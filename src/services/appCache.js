const state = window.appState;
const firebaseService = window.firebaseService;

const CACHE_STORAGE_KEY = 'sther-play-cache-v1';

function formatDate(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value.trim();
  }

  if (typeof value.toDate === 'function') {
    return formatDate(value.toDate());
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeClient(client) {
  return {
    id: String(client?.id || '').trim(),
    nombre: String(client?.nombre || client?.name || '').trim(),
    telefono: String(client?.telefono || client?.phone || '').trim(),
    estado: String(client?.estado || client?.status || 'ACTIVA').trim(),
    saldo: Number(client?.saldo || client?.balance || 0),
  };
}

function inferAccountId(account) {
  const explicit = String(account?.cuentaId || account?.accountId || '').trim();
  if (explicit) return explicit;
  return firebaseService.buildAccountKey(account?.plataforma || account?.platform, account?.correo || account?.email);
}

function normalizeAccount(account) {
  return {
    id: String(account?.id || '').trim(),
    idSuscripcion: String(account?.idSuscripcion || account?.subscriptionId || account?.id || '').trim(),
    cuentaId: inferAccountId(account),
    correo: String(account?.correo || account?.email || '').trim(),
    perfil: String(account?.perfil || account?.profile || '').trim(),
    contrasena: String(account?.contrasena || account?.password || '').trim(),
    plataforma: String(account?.plataforma || account?.platform || '').trim(),
  };
}

function normalizeSubscriptionStatus(subscription, accountsMap = {}) {
  const idSuscripcion = String(subscription?.idSuscripcion || subscription?.id || '').trim();
  const expireDate = formatDate(subscription?.fechaVencimiento || subscription?.expireDate);
  const startDate = formatDate(subscription?.fechaInicio || subscription?.startDate);
  const endDate = expireDate ? new Date(expireDate) : null;
  const daysRemaining = endDate && !Number.isNaN(endDate.getTime())
    ? Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24))
    : subscription?.diasRestantes ?? subscription?.daysRemaining ?? null;

  let normalizedStatus = String(subscription?.estado || subscription?.status || 'ACTIVA').trim();
  if (normalizedStatus === 'ACTIVA' && daysRemaining <= 7 && daysRemaining > 0) {
    normalizedStatus = 'POR_VENCER';
  }
  if (daysRemaining !== null && daysRemaining <= 0 && normalizedStatus !== 'SUSPENDIDA') {
    normalizedStatus = 'VENCIDA';
  }

  const linkedAccount = accountsMap[idSuscripcion] || {};
  const cuentaId = String(
    subscription?.cuentaId ||
    subscription?.accountId ||
    linkedAccount?.cuentaId ||
    linkedAccount?.accountId ||
    ''
  ).trim();

  return {
    ...subscription,
    idSuscripcion,
    cuentaId,
    accountId: cuentaId,
    clientId: String(subscription?.clientId || subscription?.clienteId || '').trim(),
    clientName: String(subscription?.clientName || subscription?.nombre || '').trim(),
    clientPhone: String(subscription?.clientPhone || subscription?.telefono || '').trim(),
    plataforma: String(subscription?.plataforma || subscription?.platform || '').trim(),
    estado: String(subscription?.estado || subscription?.status || '').trim(),
    fechaInicio: startDate,
    fechaVencimiento: expireDate,
    precio: Number(subscription?.precio || subscription?.price || 0),
    correo: String(subscription?.correo || subscription?.email || linkedAccount.correo || 'No asignado').trim(),
    perfil: String(subscription?.perfil || subscription?.profile || linkedAccount.perfil || 'No asignado').trim(),
    contrasena: String(subscription?.contrasena || subscription?.password || linkedAccount.contrasena || 'No asignada').trim(),
    diasRestantes: daysRemaining,
    estadoNormalizado: normalizedStatus,
  };
}

function statusPriority(status) {
  return {
    VENCIDA: 0,
    POR_VENCER: 1,
    ACTIVA: 2,
    SUSPENDIDA: 3,
  }[status] ?? 4;
}

function buildClientSummary(client, subscriptions) {
  const ordered = [...subscriptions].sort((a, b) => {
    const priority = statusPriority(a.estadoNormalizado) - statusPriority(b.estadoNormalizado);
    if (priority !== 0) return priority;
    return (a.diasRestantes ?? 99999) - (b.diasRestantes ?? 99999);
  });

  return {
    id: client.id,
    nombre: client.nombre,
    telefono: client.telefono,
    estadoCliente: client.estado,
    saldo: client.saldo,
    suscripciones: ordered,
    principal: ordered[0] || null,
  };
}

function buildSubscriptionRecord(subscription, client) {
  return {
    ...subscription,
    clientId: client.id,
    clientName: client.nombre,
    clientPhone: client.telefono,
    normalizedStatus: subscription.estadoNormalizado,
    daysRemaining: subscription.diasRestantes,
  };
}

function toLoadErrorMessage(error) {
  const message = String(error?.message || error || '').trim();
  if (!message) return 'Could not connect to Firestore';
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Could not connect to Firestore';
  }
  return message;
}

function saveCacheSnapshot(payload) {
  try {
    localStorage.setItem(
      CACHE_STORAGE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        ...payload,
      })
    );
  } catch (error) {
    console.warn('Could not persist cache snapshot:', error);
  }
}

function loadCacheSnapshot() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.subscriptions)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Could not read cache snapshot:', error);
    return null;
  }
}

function applyCacheSnapshot(snapshot) {
  const clients = Array.isArray(snapshot?.clients) ? snapshot.clients : [];
  const subscriptions = Array.isArray(snapshot?.subscriptions) ? snapshot.subscriptions : [];
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  const rawClients = Array.isArray(snapshot?.rawClients) ? snapshot.rawClients : clients.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    telefono: item.telefono,
    estado: item.estadoCliente,
    saldo: item.saldo,
  }));

  state.clientSummaries = clients;
  state.subscriptionRecords = subscriptions;
  state.accountsCache = accounts;
  state.clientesCache = rawClients;

  return {
    clients,
    subscriptions,
    accounts,
  };
}

async function ensureData(force = false) {
  if (!force && Array.isArray(state.clientSummaries) && Array.isArray(state.subscriptionRecords)) {
    return {
      clients: state.clientSummaries,
      subscriptions: state.subscriptionRecords,
      accounts: state.accountsCache || [],
    };
  }

  try {
    state.loadError = null;

    const [rawClients, rawSubscriptions, rawAccounts] = await Promise.all([
      firebaseService.getClients(),
      firebaseService.getSubscriptions(),
      firebaseService.getAccounts(),
    ]);

    const clients = rawClients.map(normalizeClient).filter((item) => item.id && item.nombre);
    const accounts = rawAccounts.map(normalizeAccount).filter((item) => item.idSuscripcion);
    const accountsMap = Object.fromEntries(accounts.map((item) => [item.idSuscripcion, item]));

    const subscriptions = rawSubscriptions
      .map((item) => normalizeSubscriptionStatus(item, accountsMap))
      .filter((item) => item.idSuscripcion && item.clientId);

    state.clientesCache = clients;
    state.accountsCache = accounts;

    const subscriptionsByClient = clients.map((client) => ({
      client,
      subscriptions: subscriptions.filter((item) => item.clientId === client.id),
    }));

    const clientSummaries = subscriptionsByClient
      .map(({ client, subscriptions: items }) => buildClientSummary(client, items))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const subscriptionRecords = subscriptionsByClient
      .flatMap(({ client, subscriptions: items }) => items.map((subscription) => buildSubscriptionRecord(subscription, client)))
      .sort((a, b) => {
        const priority = statusPriority(a.normalizedStatus) - statusPriority(b.normalizedStatus);
        if (priority !== 0) return priority;
        return (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999);
      });

    state.clientSummaries = clientSummaries;
    state.subscriptionRecords = subscriptionRecords;
    state.lastSyncAt = Date.now();

    saveCacheSnapshot({
      clients: clientSummaries,
      subscriptions: subscriptionRecords,
      accounts,
      rawClients: clients,
    });

    return {
      clients: clientSummaries,
      subscriptions: subscriptionRecords,
      accounts,
    };
  } catch (error) {
    const snapshot = loadCacheSnapshot();
    if (snapshot) {
      state.loadError = 'Sin conexion. Mostrando datos guardados.';
      state.lastSyncAt = snapshot.updatedAt || null;
      return applyCacheSnapshot(snapshot);
    }

    state.clientSummaries = [];
    state.subscriptionRecords = [];
    state.accountsCache = [];
    state.loadError = toLoadErrorMessage(error);
    throw error;
  }
}

function invalidate() {
  state.clientSummaries = null;
  state.subscriptionRecords = null;
  state.accountsCache = null;
  state.accountSummaries = null;
  state.correoSummaries = null;
  state.correosCatalog = null;
  state.loadError = null;
}

function getClientById(clientId) {
  return (state.clientSummaries || []).find((item) => String(item.id) === String(clientId)) || null;
}

function getSubscriptionsByClientId(clientId) {
  return (state.subscriptionRecords || []).filter((item) => String(item.clientId) === String(clientId));
}

window.appCache = {
  ensureData,
  invalidate,
  getClientById,
  getSubscriptionsByClientId,
  statusPriority,
  formatDate,
  loadCacheSnapshot,
};

