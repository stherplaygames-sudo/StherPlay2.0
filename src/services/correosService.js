import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

const appCache = () => window.appCache;
const accountsService = () => window.accountsService;
const firebaseService = () => window.firebaseService;
const plataformasMetrics = () => window.plataformasMetrics;
const CORREOS_CACHE_KEY = 'sther-correos-cache-v1';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function maskPassword(password) {
  const value = normalizeText(password);
  if (!value) return 'Sin contraseña';
  return '•'.repeat(Math.max(6, value.length));
}

function applyCorreos(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item.id,
      email: normalizeText(item.email),
      emailLower: normalizeEmail(item.emailLower || item.email),
      password: normalizeText(item.password),
      createdAt: item.createdAt || null,
    }))
    .filter((item) => item.email)
    .sort((a, b) => a.email.localeCompare(b.email));
}

function loadCorreosCache() {
  try {
    const raw = localStorage.getItem(CORREOS_CACHE_KEY);
    if (!raw) return null;
    return applyCorreos(JSON.parse(raw));
  } catch (error) {
    console.warn('No se pudo leer cache de correos:', error);
    return null;
  }
}

function saveCorreosCache(items) {
  try {
    localStorage.setItem(CORREOS_CACHE_KEY, JSON.stringify(items || []));
  } catch (error) {
    console.warn('No se pudo guardar cache de correos:', error);
  }
}

function clearCorreosCache() {
  window.appState.correosCatalog = null;
  window.appState.correosRawCache = null;
  try {
    localStorage.removeItem(CORREOS_CACHE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar cache de correos:', error);
  }
}

async function getCorreos(force = false) {
  if (!force && Array.isArray(window.appState.correosRawCache)) {
    return window.appState.correosRawCache;
  }

  if (!force) {
    const snapshot = loadCorreosCache();
    if (snapshot) {
      window.appState.correosRawCache = snapshot;
      return snapshot;
    }
  }

  const snapshot = await getDocs(collection(db, 'correos'));
  const items = applyCorreos(snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })));

  window.appState.correosRawCache = items;
  saveCorreosCache(items);
  return items;
}

async function createCorreo(data) {
  const email = normalizeText(data?.email);
  const password = normalizeText(data?.password);
  const emailLower = normalizeEmail(email);

  if (!email || !email.includes('@')) {
    throw new Error('Ingresa un correo valido');
  }

  if (!password || password.length < 3) {
    throw new Error('Ingresa una contraseña valida');
  }

  const existing = await getDocs(query(collection(db, 'correos'), where('emailLower', '==', emailLower)));
  if (!existing.empty) {
    throw new Error('Ese correo ya existe');
  }

  const created = await addDoc(collection(db, 'correos'), {
    email,
    emailLower,
    password,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  clearCorreosCache();
  return { id: created.id, email, password };
}

async function updateCorreo(correoId, data) {
  const id = normalizeText(correoId);
  const email = normalizeText(data?.email);
  const password = normalizeText(data?.password);
  const emailLower = normalizeEmail(email);

  if (!id) throw new Error('Correo ID requerido');
  if (!email || !email.includes('@')) throw new Error('Ingresa un correo valido');
  if (!password || password.length < 3) throw new Error('Ingresa una contraseña valida');

  const existing = await getDocs(query(collection(db, 'correos'), where('emailLower', '==', emailLower)));
  const duplicated = existing.docs.find((item) => item.id !== id);
  if (duplicated) {
    throw new Error('Ese correo ya existe');
  }

  await setDoc(doc(db, 'correos', id), {
    email,
    emailLower,
    password,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  clearCorreosCache();
  return { ok: true, id, email, password };
}

async function deleteCorreo(correoId) {
  const id = normalizeText(correoId);
  if (!id) throw new Error('Correo ID requerido');

  await deleteDoc(doc(db, 'correos', id));
  clearCorreosCache();
  return { ok: true };
}

async function getCorreosCatalog(force = false) {
  if (!force && Array.isArray(window.appState.correosCatalog)) {
    return window.appState.correosCatalog;
  }

  const [correos, overview] = await Promise.all([
    getCorreos(force),
    getCorreosOverview(force),
  ]);

  const map = new Map();

  (overview || []).forEach((item) => {
    const email = normalizeText(item?.correo);
    if (!email) return;
    const key = normalizeEmail(email);
    map.set(key, {
      id: normalizeText(item?.id) || key,
      email,
      emailLower: key,
      password: normalizeText(item?.password),
      createdAt: item?.createdAt || null,
    });
  });

  (correos || []).forEach((item) => {
    const key = normalizeEmail(item.emailLower || item.email);
    if (!key) return;
    const current = map.get(key) || {};
    map.set(key, {
      id: item.id || current.id || key,
      email: item.email || current.email || '',
      emailLower: key,
      password: item.password || current.password || '',
      createdAt: item.createdAt || current.createdAt || null,
    });
  });

  const catalog = [...map.values()]
    .filter((item) => item.email)
    .sort((a, b) => a.email.localeCompare(b.email));

  window.appState.correosCatalog = catalog;
  return catalog;
}

async function getCorreosOverview(force = false) {
  const [correos, accounts, data] = await Promise.all([
    getCorreos(force),
    accountsService().getAccountsOverview(force),
    appCache().ensureData(force),
  ]);

  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const groups = new Map();
  const correoByEmail = new Map(correos.map((item) => [item.emailLower, item]));

  (correos || []).forEach((correo) => {
    groups.set(correo.id, {
      id: correo.id,
      correo: correo.email,
      password: correo.password,
      passwordMask: maskPassword(correo.password),
      cuentas: [],
      clientesSet: new Set(),
    });
  });

  (accounts || []).forEach((account) => {
    const email = normalizeText(account?.correo || 'Sin correo');
    const emailLower = normalizeEmail(email);
    const linkedCorreo = correoByEmail.get(emailLower);
    const correoId = normalizeText(account?.correoId || account?.emailId) || linkedCorreo?.id || firebaseService().buildCorreoKey(email);

    if (!groups.has(correoId)) {
      groups.set(correoId, {
        id: correoId,
        correo: email,
        password: '',
        passwordMask: 'Sin contraseña',
        cuentas: [],
        clientesSet: new Set(),
      });
    }

    const group = groups.get(correoId);
    if (!group.correo || group.correo === 'Sin correo') {
      group.correo = email;
    }

    group.cuentas.push(account);
    (account.clientes || []).forEach((cliente) => {
      if (cliente?.cliente) group.clientesSet.add(cliente.cliente);
    });
  });

  return [...groups.values()].map((group) => {
    const metrics = plataformasMetrics().calcularOcupacion(group.cuentas);
    const ingresos = subscriptions.reduce((acc, item) => {
      const subscriptionCorreoId = normalizeText(item?.correoId || item?.emailId);
      const subscriptionEmail = normalizeEmail(item?.correo || item?.email);
      const sameCorreo = subscriptionCorreoId
        ? subscriptionCorreoId === group.id
        : subscriptionEmail && subscriptionEmail === normalizeEmail(group.correo);

      if (!sameCorreo) return acc;
      return acc + (Number(item?.precioFinal ?? item?.precio ?? item?.price ?? 0) || 0);
    }, 0);

    return {
      id: group.id,
      correo: group.correo,
      password: group.password,
      passwordMask: group.passwordMask,
      totalCuentas: group.cuentas.length,
      totalClientes: group.clientesSet.size,
      totalCapacidad: metrics.total,
      totalUsados: metrics.usados,
      porcentajeOcupacion: metrics.porcentaje,
      ingresos,
      cuentas: group.cuentas.sort((a, b) => String(a.plataforma || '').localeCompare(String(b.plataforma || ''))),
    };
  }).sort((a, b) => a.correo.localeCompare(b.correo));
}

window.correosService = {
  getCorreos,
  getCorreosCatalog,
  createCorreo,
  updateCorreo,
  deleteCorreo,
  getCorreosOverview,
  maskPassword,
  clearCorreosCache,
};

export { getCorreos, getCorreosCatalog, createCorreo, updateCorreo, deleteCorreo, getCorreosOverview, maskPassword, clearCorreosCache };
