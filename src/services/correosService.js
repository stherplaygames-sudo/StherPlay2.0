import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

const appCache = () => window.appCache;
const accountsService = () => window.accountsService;
const firebaseService = () => window.firebaseService;
const plataformasMetrics = () => window.plataformasMetrics;

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

async function getCorreos() {
  const snapshot = await getDocs(collection(db, 'correos'));
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...item.data(),
    }))
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

  return { id: created.id, email, password };
}

async function getCorreosCatalog(force = false) {
  const [correos, overview] = await Promise.all([
    getCorreos(),
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

  return [...map.values()]
    .filter((item) => item.email)
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function getCorreosOverview(force = false) {
  const [correos, accounts, data] = await Promise.all([
    getCorreos(),
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
  getCorreosOverview,
  maskPassword,
};

export { getCorreos, getCorreosCatalog, createCorreo, getCorreosOverview, maskPassword };
