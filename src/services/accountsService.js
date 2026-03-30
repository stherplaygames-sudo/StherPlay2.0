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

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysUntil(dateValue) {
  const iso = normalizeDate(dateValue);
  if (!iso) return null;

  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getRenewalStatus(dateValue) {
  const diffDays = getDaysUntil(dateValue);
  if (diffDays === null) return 'SIN_FECHA';
  if (diffDays < 0) return 'VENCIDA';
  if (diffDays <= 3) return 'POR_VENCER';
  return 'AL_DIA';
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

function buildMetaMap(rawAccounts) {
  const map = new Map();

  (Array.isArray(rawAccounts) ? rawAccounts : []).forEach((account) => {
    const subscriptionId = normalizeText(account?.idSuscripcion || account?.subscriptionId);
    const accountId = normalizeText(account?.cuentaId || account?.accountId || account?.id);

    if (!accountId || subscriptionId) return;

    map.set(accountId, {
      id: normalizeText(account?.id || accountId),
      cuentaId: accountId,
      correo: normalizeText(account?.correo || account?.email),
      correoId: normalizeText(account?.correoId || account?.emailId),
      plataforma: normalizeText(account?.plataforma || account?.platform),
      perfilesMax: Number(account?.perfiles_max ?? account?.profiles_max ?? account?.maxProfiles ?? 0) || 0,
      renewalDate: normalizeText(account?.renewalDate),
      renewalPrice: Number(account?.renewalPrice ?? account?.renewal_price ?? account?.costoRenovacion ?? 0) || 0,
      autoRenew: Boolean(account?.autoRenew),
      notes: normalizeText(account?.notes),
    });
  });

  return map;
}

async function getAccountsOverview(force = false) {
  const [data, capacityMap] = await Promise.all([
    getAppCache().ensureData(force),
    getPlatformCapacityMap(),
  ]);

  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const rawAccounts = Array.isArray(data?.rawAccounts) ? data.rawAccounts : [];
  const metadataMap = buildMetaMap(rawAccounts);

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
    const meta = metadataMap.get(accountId) || null;

    if (!groups.has(accountId)) {
      groups.set(accountId, {
        id: accountId,
        correo: meta?.correo || email,
        correoId: meta?.correoId || normalizeText(account.correoId || account.emailId || linkedSubscription?.correoId || linkedSubscription?.emailId),
        plataforma: meta?.plataforma || platform,
        perfilesMax:
          Number(meta?.perfilesMax || account.perfiles_max || account.profiles_max || 0) ||
          capacityMap[normalizePlatformKey(meta?.plataforma || platform)] ||
          0,
        renewalDate: normalizeText(meta?.renewalDate),
        renewalPrice: Number(meta?.renewalPrice || 0) || 0,
        autoRenew: Boolean(meta?.autoRenew),
        notes: normalizeText(meta?.notes),
        perfiles: new Set(),
        clientes: [],
        cuentaIds: new Set(),
      });
    }

    const group = groups.get(accountId);
    if (subscriptionId) {
      group.cuentaIds.add(subscriptionId);
    }

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
      precio: Number(linkedSubscription.precioFinal ?? linkedSubscription.precio ?? linkedSubscription.price ?? 0) || 0,
    });
  });

  const overview = [...groups.values()].map((group) => {
    const perfilesUsados = Math.max(group.perfiles.size, group.clientes.length);
    const perfilesMax = group.perfilesMax || 0;
    const porcentajeUso = perfilesMax > 0 ? Number(((perfilesUsados / perfilesMax) * 100).toFixed(1)) : 0;
    const renewalStatus = getRenewalStatus(group.renewalDate);
    const renewalDiffDays = getDaysUntil(group.renewalDate);

    return {
      id: group.id,
      correo: group.correo,
      correoId: group.correoId,
      plataforma: group.plataforma,
      perfilesUsados,
      perfilesMax,
      porcentajeUso,
      cuposDisponibles: Math.max(perfilesMax - perfilesUsados, 0),
      sobrecargada: perfilesMax > 0 && perfilesUsados > perfilesMax,
      clientes: group.clientes.sort((a, b) => a.cliente.localeCompare(b.cliente)),
      cuentaIds: [...group.cuentaIds].filter(Boolean),
      renewalDate: group.renewalDate,
      renewalPrice: Number(group.renewalPrice || 0) || 0,
      autoRenew: Boolean(group.autoRenew),
      notes: group.notes,
      renewalStatus,
      renewalDiffDays,
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
  const cuentasSobrecargadas = cuentas.filter((item) => item.sobrecargada).length;
  const cuentasLlenas = cuentas.filter((item) => !item.sobrecargada && item.cuposDisponibles <= 0).length;
  const cuentasCriticas = cuentas.filter((item) => !item.sobrecargada && item.cuposDisponibles === 1).length;
  const cuentasDisponibles = cuentas.filter((item) => item.cuposDisponibles > 0).length;

  return {
    plataforma: normalizeText(plataforma),
    cuentas,
    totalCuentas: cuentas.length,
    cuentasDisponibles,
    cuentasLlenas,
    cuentasCriticas,
    cuentasSobrecargadas,
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

