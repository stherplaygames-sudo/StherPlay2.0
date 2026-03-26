function getAppCache() {
  return window.appCache;
}

function getPlataformasService() {
  return window.plataformasService;
}

function getFirebaseService() {
  return window.firebaseService;
}

function getPlataformasMetrics() {
  return window.plataformasMetrics;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePlatformKey(value) {
  return normalizeText(value).toUpperCase();
}

function inferAccountId(account, linkedSubscription) {
  const explicit = normalizeText(
    account?.cuentaId ||
    account?.accountId ||
    linkedSubscription?.cuentaId ||
    linkedSubscription?.accountId
  );
  if (explicit) return explicit;

  const platform =
    account?.plataforma ||
    account?.platform ||
    linkedSubscription?.plataforma ||
    linkedSubscription?.platform ||
    'Sin plataforma';
  const email =
    account?.correo || account?.email || linkedSubscription?.correo || linkedSubscription?.email || 'sin-correo';
  return getFirebaseService().buildAccountKey(platform, email);
}

function shouldCountSubscription(linkedSubscription) {
  const status = normalizeText(
    linkedSubscription?.normalizedStatus ||
    linkedSubscription?.estadoNormalizado ||
    linkedSubscription?.estado ||
    linkedSubscription?.status
  ).toUpperCase();

  return status !== 'SUSPENDIDA';
}

async function getPlatformCapacityMap() {
  try {
    const plataformas = await getPlataformasService().getPlataformas();
    const entries = (plataformas || []).map((item) => [
      normalizePlatformKey(item.nombre),
      Number(item.perfiles ?? item.raw?.perfiles_max ?? item.raw?.profiles_max ?? item.raw?.cupos_max ?? 0) || 0,
    ]);
    return Object.fromEntries(entries);
  } catch (error) {
    console.error('No se pudieron cargar capacidades de plataformas:', error);
    return {};
  }
}

async function getAccountsOverview(force = false) {
  const data = await getAppCache().ensureData(force);
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const capacityMap = await getPlatformCapacityMap();

  const subscriptionsById = new Map(
    subscriptions.map((item) => [String(item.idSuscripcion || item.id || '').trim(), item])
  );

  const sourceAccounts = [...accounts];
  const knownSubscriptionIds = new Set(
    accounts.map((item) => String(item.idSuscripcion || item.subscriptionId || item.id || '').trim()).filter(Boolean)
  );

  subscriptions.forEach((subscription) => {
    const subscriptionId = String(subscription.idSuscripcion || subscription.id || '').trim();
    if (!subscriptionId || knownSubscriptionIds.has(subscriptionId)) return;

    sourceAccounts.push({
      id: subscriptionId,
      idSuscripcion: subscriptionId,
      subscriptionId,
      cuentaId: subscription.cuentaId || subscription.accountId || '',
      accountId: subscription.accountId || subscription.cuentaId || '',
      correo: subscription.correo || subscription.email || '',
      email: subscription.email || subscription.correo || '',
      perfil: subscription.perfil || subscription.profile || '',
      profile: subscription.profile || subscription.perfil || '',
      plataforma: subscription.plataforma || subscription.platform || '',
      platform: subscription.platform || subscription.plataforma || '',
    });
  });

  const groups = new Map();

  sourceAccounts.forEach((account) => {
    const subscriptionId = String(account.idSuscripcion || account.subscriptionId || account.id || '').trim();
    const linkedSubscription = subscriptionsById.get(subscriptionId) || null;
    const platform = normalizeText(
      account.plataforma ||
      account.platform ||
      linkedSubscription?.plataforma ||
      linkedSubscription?.platform ||
      'Sin plataforma'
    );
    const email = normalizeText(
      account.correo || account.email || linkedSubscription?.correo || linkedSubscription?.email || 'Sin correo'
    );
    const accountId = inferAccountId(account, linkedSubscription);

    if (!groups.has(accountId)) {
      groups.set(accountId, {
        id: accountId,
        correo: email,
        plataforma: platform,
        perfilesMax:
          Number(account.perfiles_max ?? account.profiles_max ?? 0) ||
          capacityMap[normalizePlatformKey(platform)] ||
          0,
        perfilesUsados: 0,
        cuposDisponibles: 0,
        perfiles: new Set(),
        clientes: [],
        cuentaIds: new Set(),
      });
    }

    const group = groups.get(accountId);
    group.cuentaIds.add(subscriptionId || String(account.id || ''));

    if (!linkedSubscription || !shouldCountSubscription(linkedSubscription)) {
      return;
    }

    const perfil = normalizeText(
      account.perfil || account.profile || linkedSubscription?.perfil || linkedSubscription?.profile
    );
    if (perfil) {
      group.perfiles.add(perfil);
    }

    group.clientes.push({
      id: linkedSubscription.idSuscripcion,
      cliente: linkedSubscription.clientName || linkedSubscription.nombre || 'Sin cliente',
      perfil: perfil || 'Sin perfil',
      estado: linkedSubscription.normalizedStatus || linkedSubscription.estado || 'ACTIVA',
      fechaVencimiento: linkedSubscription.fechaVencimiento || linkedSubscription.expireDate || '',
    });
  });

  const overview = [...groups.values()].map((group) => {
    const perfilesUsados = Math.max(group.perfiles.size, group.clientes.length);
    const perfilesMax = group.perfilesMax || perfilesUsados || 0;
    const porcentajeUso = perfilesMax > 0 ? Number(((perfilesUsados / perfilesMax) * 100).toFixed(1)) : 0;

    return {
      id: group.id,
      correo: group.correo,
      plataforma: group.plataforma,
      perfilesUsados,
      perfilesMax,
      porcentajeUso,
      cuposDisponibles: Math.max(perfilesMax - perfilesUsados, 0),
      clientes: group.clientes.sort((a, b) => a.cliente.localeCompare(b.cliente)),
      cuentaIds: [...group.cuentaIds].filter(Boolean),
    };
  });

  return overview.sort((a, b) => {
    const byPlatform = a.plataforma.localeCompare(b.plataforma);
    if (byPlatform !== 0) return byPlatform;
    return a.correo.localeCompare(b.correo);
  });
}

async function getAccountsByPlatform(plataforma, force = false) {
  const target = normalizePlatformKey(plataforma);
  const items = await getAccountsOverview(force);

  if (!target) {
    return items;
  }

  return items.filter((item) => normalizePlatformKey(item.plataforma) === target);
}

async function getPlatformOperationalSummary(plataforma, force = false) {
  const cuentas = await getAccountsByPlatform(plataforma, force);
  const metrics = getPlataformasMetrics().calcularOcupacion(cuentas);
  const cuentasLlenas = cuentas.filter((item) => item.cuposDisponibles <= 0).length;
  const cuentasCriticas = cuentas.filter((item) => item.cuposDisponibles === 1).length;
  const cuentasDisponibles = cuentas.filter((item) => item.cuposDisponibles > 0).length;

  return {
    plataforma: normalizeText(plataforma),
    cuentas,
    totalCuentas: cuentas.length,
    cuentasDisponibles,
    cuentasLlenas,
    cuentasCriticas,
    totalCapacidad: metrics.total,
    totalUsados: metrics.usados,
    porcentajeOcupacion: metrics.porcentaje,
  };
}

window.accountsService = {
  getAccountsOverview,
  getAccountsByPlatform,
  getPlatformCapacityMap,
  getPlatformOperationalSummary,
};

export { getAccountsOverview, getAccountsByPlatform, getPlatformCapacityMap, getPlatformOperationalSummary };
