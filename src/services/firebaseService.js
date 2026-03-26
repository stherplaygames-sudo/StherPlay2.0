import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return cleanString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizeSlug(value) {
  return cleanString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildCorreoKey(email) {
  return normalizeSlug(String(email || '').toLowerCase()) || 'sin-correo';
}

function buildAccountKey(platform, email) {
  const platformKey = normalizeSlug(platform) || 'sin-plataforma';
  const emailKey = buildCorreoKey(email);
  return `${platformKey}--${emailKey}`;
}

function parseDateInput(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = cleanString(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateISO(value) {
  const date = parseDateInput(value);
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonthsSafe(baseDate, months) {
  const source = parseDateInput(baseDate);
  if (!source) return null;

  const day = source.getDate();
  const endOfTargetMonth = new Date(source.getFullYear(), source.getMonth() + months + 1, 0);

  return new Date(
    source.getFullYear(),
    source.getMonth() + months,
    Math.min(day, endOfTargetMonth.getDate())
  );
}

function calculateDaysRemaining(expireDate) {
  const end = parseDateInput(expireDate);
  if (!end) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
}

function deriveSubscriptionStatus(expireDate, explicitStatus = '') {
  const normalized = cleanString(explicitStatus).toUpperCase();
  if (normalized === 'SUSPENDIDA') return 'SUSPENDIDA';

  const daysRemaining = calculateDaysRemaining(expireDate);
  if (daysRemaining === null) return normalized || 'ACTIVA';
  if (daysRemaining <= 0) return 'VENCIDA';
  if (daysRemaining <= 7) return 'POR_VENCER';
  return 'ACTIVA';
}

async function getClients() {
  const snapshot = await getDocs(collection(db, 'clients'));
  return mapSnapshot(snapshot);
}

async function getSubscriptions() {
  const snapshot = await getDocs(collection(db, 'subscriptions'));
  return mapSnapshot(snapshot);
}

async function getAccounts() {
  const snapshot = await getDocs(collection(db, 'accounts'));
  return mapSnapshot(snapshot);
}

async function generateUniqueClientId(nombre, telefono) {
  const cleanName = normalizeName(nombre);
  const prefix = cleanName.substring(0, 4).padEnd(4, 'X');
  const suffix = cleanString(telefono).slice(-4);
  const baseId = `${prefix}${suffix}`;

  let candidate = baseId;
  let attempt = 1;

  while (true) {
    const snapshot = await getDoc(doc(db, 'clients', candidate));
    if (!snapshot.exists()) return candidate;
    candidate = `${baseId}-${attempt++}`;
  }
}

async function generateUniqueSubscriptionId(clientId, platform, startDate) {
  const platformPrefix = normalizeName(platform).replace(/[^A-Z]/g, '').substring(0, 3) || 'SUB';
  const isoStart = formatDateISO(startDate).replace(/-/g, '');
  const baseId = `${cleanString(clientId)}${platformPrefix}${isoStart}`;

  let candidate = baseId;
  let attempt = 1;

  while (true) {
    const snapshot = await getDoc(doc(db, 'subscriptions', candidate));
    if (!snapshot.exists()) return candidate;
    candidate = `${baseId}-${attempt++}`;
  }
}

async function createClient(nombre, telefono) {
  const normalizedName = normalizeName(nombre);
  const phone = cleanString(telefono);

  if (normalizedName.length < 4) throw new Error('Nombre invalido');
  if (!/^\d{8,}$/.test(phone)) throw new Error('Telefono invalido');

  const id = await generateUniqueClientId(normalizedName, phone);
  const payload = {
    id,
    nombre: normalizedName,
    telefono: phone,
    estado: 'ACTIVA',
    saldo: 0,
    name: normalizedName,
    phone,
    status: 'ACTIVA',
    balance: 0,
    source: 'firebase',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'clients', id), payload);
  return { ok: true, idCliente: id };
}

async function updateClient(payload) {
  const id = cleanString(payload?.id);
  const normalizedName = normalizeName(payload?.nombre);
  const phone = cleanString(payload?.telefono);
  const status = cleanString(payload?.estado || 'ACTIVA').toUpperCase();

  if (!id) throw new Error('ID requerido');
  if (!normalizedName || !phone) throw new Error('Datos incompletos');

  await updateDoc(doc(db, 'clients', id), {
    nombre: normalizedName,
    telefono: phone,
    estado: status,
    name: normalizedName,
    phone,
    status,
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}

async function getPlatforms() {
  const subscriptions = await getSubscriptions();
  const platformsMap = new Map();

  subscriptions.forEach((item) => {
    const name = cleanString(item?.plataforma || item?.platform);
    if (!name) return;

    const current = platformsMap.get(name) || { nombre: name, precio: 0, count: 0 };
    const price = Number(item?.precioBase ?? item?.priceBase ?? item?.precio ?? item?.price ?? 0) || 0;
    current.precio += price;
    current.count += 1;
    platformsMap.set(name, current);
  });

  return [...platformsMap.values()]
    .map((item) => ({
      nombre: item.nombre,
      precio: item.count ? Math.round(item.precio / item.count) : 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function createSubscription(payload) {
  const clientId = cleanString(payload?.cliente);
  const platform = cleanString(payload?.plataforma).toUpperCase();
  const startDate = formatDateISO(payload?.fechaInicio);
  const months = Number(payload?.meses);
  const email = cleanString(payload?.correo);
  const correoId = buildCorreoKey(email);
  const accountId = cleanString(payload?.cuentaId) || buildAccountKey(platform, email);

  if (!clientId || !platform || !startDate || !months) {
    throw new Error('Datos incompletos');
  }

  const clientSnapshot = await getDoc(doc(db, 'clients', clientId));
  if (!clientSnapshot.exists()) throw new Error('Cliente no encontrado');

  const client = clientSnapshot.data();
  const expireDate = formatDateISO(addMonthsSafe(startDate, months));
  const daysRemaining = calculateDaysRemaining(expireDate);
  const status = deriveSubscriptionStatus(expireDate, 'ACTIVA');
  const priceBase = Number(payload?.precioBase || 0) || 0;
  const finalPrice =
    payload?.precioFinal !== undefined && cleanString(payload?.precioFinal) !== ''
      ? Number(payload?.precioFinal) || 0
      : priceBase;
  const subscriptionId = await generateUniqueSubscriptionId(clientId, platform, startDate);

  const subscriptionPayload = {
    id: subscriptionId,
    idSuscripcion: subscriptionId,
    cuentaId: accountId,
    accountId,
    clientId,
    clienteId: clientId,
    clientName: cleanString(client?.nombre || client?.name),
    nombre: cleanString(client?.nombre || client?.name),
    clientPhone: cleanString(client?.telefono || client?.phone),
    telefono: cleanString(client?.telefono || client?.phone),
    plataforma: platform,
    platform,
    correoId,
    emailId: correoId,
    fechaInicio: startDate,
    startDate,
    fechaVencimiento: expireDate,
    expireDate,
    diasRestantes: daysRemaining,
    daysRemaining,
    estado: status,
    status,
    precioBase: priceBase,
    priceBase,
    precioFinal: finalPrice,
    precio: finalPrice,
    price: finalPrice,
    perfil: cleanString(payload?.perfil),
    profile: cleanString(payload?.perfil),
    source: 'firebase',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const accountPayload = {
    id: subscriptionId,
    idSuscripcion: subscriptionId,
    subscriptionId,
    cuentaId: accountId,
    accountId,
    clientId,
    clienteId: clientId,
    plataforma: platform,
    platform,
    correoId,
    emailId: correoId,
    correo: email,
    email,
    perfil: cleanString(payload?.perfil),
    profile: cleanString(payload?.perfil),
    contrasena: cleanString(payload?.contrasena),
    password: cleanString(payload?.contrasena),
    source: 'firebase',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'subscriptions', subscriptionId), subscriptionPayload);
  batch.set(doc(db, 'accounts', subscriptionId), accountPayload, { merge: true });
  await batch.commit();

  return { ok: true, idSuscripcion: subscriptionId, cuentaId: accountId };
}

async function getSubscriptionById(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('ID requerido');

  const snapshot = await getDoc(doc(db, 'subscriptions', id));
  if (!snapshot.exists()) throw new Error('Suscripcion no encontrada');

  const data = snapshot.data();
  return {
    idSuscripcion: id,
    cuentaId: cleanString(data?.cuentaId || data?.accountId),
    plataforma: cleanString(data?.plataforma || data?.platform),
    inicio: formatDateISO(data?.fechaInicio || data?.startDate),
    vencimiento: formatDateISO(data?.fechaVencimiento || data?.expireDate),
    estado: deriveSubscriptionStatus(
      data?.fechaVencimiento || data?.expireDate,
      data?.estado || data?.status
    ),
    precioFinal: data?.precioFinal ?? data?.precio ?? data?.price ?? '',
  };
}

async function updateSubscription(payload) {
  const id = cleanString(payload?.idSuscripcion);
  if (!id) throw new Error('ID requerido');

  const existing = await getSubscriptionById(id);
  const platform = cleanString(payload?.plataforma || existing.plataforma).toUpperCase();
  const startDate = formatDateISO(payload?.inicio);
  const expireDate = formatDateISO(payload?.vencimiento);
  const explicitStatus = cleanString(payload?.estado).toUpperCase();
  const finalPrice = cleanString(payload?.precioFinal);
  const status = deriveSubscriptionStatus(expireDate, explicitStatus);
  const daysRemaining = calculateDaysRemaining(expireDate);

  if (!platform) throw new Error('Plataforma requerida');

  const updatePayload = {
    cuentaId: cleanString(payload?.cuentaId) || existing.cuentaId || '',
    accountId: cleanString(payload?.cuentaId) || existing.cuentaId || '',
    plataforma: platform,
    platform,
    fechaInicio: startDate,
    startDate,
    fechaVencimiento: expireDate,
    expireDate,
    diasRestantes: daysRemaining,
    daysRemaining,
    estado: status,
    status,
    updatedAt: serverTimestamp(),
  };

  if (finalPrice !== '') {
    const numericPrice = Number(finalPrice) || 0;
    updatePayload.precioFinal = numericPrice;
    updatePayload.precio = numericPrice;
    updatePayload.price = numericPrice;
  }

  await updateDoc(doc(db, 'subscriptions', id), updatePayload);

  const accountRef = doc(db, 'accounts', id);
  const accountSnapshot = await getDoc(accountRef);
  if (accountSnapshot.exists()) {
    await updateDoc(accountRef, {
      plataforma: platform,
      platform,
      updatedAt: serverTimestamp(),
    });
  }

  return { ok: true };
}

async function getAccountBySubscriptionId(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('ID requerido');

  const directSnapshot = await getDoc(doc(db, 'accounts', id));
  if (directSnapshot.exists()) {
    const data = directSnapshot.data();
    return {
      cuentaId: cleanString(data?.cuentaId || data?.accountId),
      correo: cleanString(data?.correo || data?.email),
      perfil: cleanString(data?.perfil || data?.profile),
      contrasena: cleanString(data?.contrasena || data?.password),
    };
  }

  const accountsRef = collection(db, 'accounts');
  const snapshots = await Promise.all([
    getDocs(query(accountsRef, where('idSuscripcion', '==', id))),
    getDocs(query(accountsRef, where('subscriptionId', '==', id))),
  ]);

  const accountDoc = snapshots.flatMap((snapshot) => snapshot.docs)[0];
  if (!accountDoc) {
    return { cuentaId: '', correo: '', perfil: '', contrasena: '' };
  }

  const data = accountDoc.data();
  return {
    cuentaId: cleanString(data?.cuentaId || data?.accountId),
    correo: cleanString(data?.correo || data?.email),
    perfil: cleanString(data?.perfil || data?.profile),
    contrasena: cleanString(data?.contrasena || data?.password),
  };
}

async function updateAccount(payload) {
  const id = cleanString(payload?.idSuscripcion);
  if (!id) throw new Error('ID requerido');

  const subscriptionSnapshot = await getDoc(doc(db, 'subscriptions', id));
  const subscriptionData = subscriptionSnapshot.exists() ? subscriptionSnapshot.data() : {};
  const platform = cleanString(subscriptionData?.plataforma || subscriptionData?.platform);
  const email = cleanString(payload?.correo);
  const correoId = buildCorreoKey(email);
  const accountId = cleanString(payload?.cuentaId) || buildAccountKey(platform, email);

  await setDoc(
    doc(db, 'accounts', id),
    {
      id,
      idSuscripcion: id,
      subscriptionId: id,
      cuentaId: accountId,
      accountId,
      correoId,
      emailId: correoId,
      correo: email,
      email,
      perfil: cleanString(payload?.perfil),
      profile: cleanString(payload?.perfil),
      contrasena: cleanString(payload?.contrasena),
      password: cleanString(payload?.contrasena),
      source: 'firebase',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await updateDoc(doc(db, 'subscriptions', id), {
    cuentaId: accountId,
    accountId,
    updatedAt: serverTimestamp(),
  });

  return { ok: true, cuentaId: accountId };
}

async function suspendSubscription(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('ID requerido');

  await updateDoc(doc(db, 'subscriptions', id), {
    estado: 'SUSPENDIDA',
    status: 'SUSPENDIDA',
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}

async function renewSubscription(subscriptionId, months) {
  const id = cleanString(subscriptionId);
  const numericMonths = Number(months);

  if (!id) throw new Error('ID requerido');
  if (!numericMonths || numericMonths <= 0) throw new Error('Meses invalidos');

  const current = await getSubscriptionById(id);
  const baseDate = current.vencimiento || current.inicio;
  const renewedExpireDate = formatDateISO(addMonthsSafe(baseDate, numericMonths));
  const daysRemaining = calculateDaysRemaining(renewedExpireDate);
  const status = deriveSubscriptionStatus(renewedExpireDate, 'ACTIVA');

  await updateDoc(doc(db, 'subscriptions', id), {
    fechaVencimiento: renewedExpireDate,
    expireDate: renewedExpireDate,
    diasRestantes: daysRemaining,
    daysRemaining,
    estado: status,
    status,
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}

async function deleteSubscriptionCascade(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('Subscription ID is required');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'subscriptions', id));

  const accountsRef = collection(db, 'accounts');
  const accountSnapshots = await Promise.all([
    getDocs(query(accountsRef, where('idSuscripcion', '==', id))),
    getDocs(query(accountsRef, where('subscriptionId', '==', id))),
  ]);

  const seen = new Set();
  accountSnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((accountDoc) => {
      if (seen.has(accountDoc.id)) return;
      seen.add(accountDoc.id);
      batch.delete(accountDoc.ref);
    });
  });

  await batch.commit();
  return { ok: true, deletedAccountDocs: seen.size };
}

async function deleteClientCascade(clientId) {
  const id = cleanString(clientId);
  if (!id) throw new Error('Client ID is required');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'clients', id));

  const subscriptionsRef = collection(db, 'subscriptions');
  const subscriptionSnapshots = await Promise.all([
    getDocs(query(subscriptionsRef, where('clientId', '==', id))),
    getDocs(query(subscriptionsRef, where('clienteId', '==', id))),
  ]);

  const subscriptionIds = new Set();
  subscriptionSnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((subscriptionDoc) => {
      if (subscriptionIds.has(subscriptionDoc.id)) return;
      subscriptionIds.add(subscriptionDoc.id);
      batch.delete(subscriptionDoc.ref);
    });
  });

  const accountsRef = collection(db, 'accounts');
  const accountSnapshots = await Promise.all([
    getDocs(query(accountsRef, where('clientId', '==', id))),
    getDocs(query(accountsRef, where('clienteId', '==', id))),
  ]);

  const accountIds = new Set();
  accountSnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((accountDoc) => {
      if (accountIds.has(accountDoc.id)) return;
      accountIds.add(accountDoc.id);
      batch.delete(accountDoc.ref);
    });
  });

  if (subscriptionIds.size > 0) {
    const subscriptionIdArray = [...subscriptionIds];
    const linkedAccountSnapshots = await Promise.all([
      Promise.all(
        subscriptionIdArray.map((subscriptionId) =>
          getDocs(query(accountsRef, where('idSuscripcion', '==', subscriptionId)))
        )
      ),
      Promise.all(
        subscriptionIdArray.map((subscriptionId) =>
          getDocs(query(accountsRef, where('subscriptionId', '==', subscriptionId)))
        )
      ),
    ]);

    linkedAccountSnapshots.flat().forEach((snapshot) => {
      snapshot.docs.forEach((accountDoc) => {
        if (accountIds.has(accountDoc.id)) return;
        accountIds.add(accountDoc.id);
        batch.delete(accountDoc.ref);
      });
    });
  }

  await batch.commit();
  return {
    ok: true,
    deletedSubscriptions: subscriptionIds.size,
    deletedAccounts: accountIds.size,
  };
}

window.firebaseService = {
  db,
  getClients,
  getSubscriptions,
  getAccounts,
  buildCorreoKey,
  buildCorreoKey,
  buildAccountKey,
  createClient,
  updateClient,
  getPlatforms,
  createSubscription,
  getSubscriptionById,
  updateSubscription,
  getAccountBySubscriptionId,
  updateAccount,
  suspendSubscription,
  renewSubscription,
  deleteSubscriptionCascade,
  deleteClientCascade,
};

export {
  db,
  getClients,
  getSubscriptions,
  getAccounts,
  buildAccountKey,
  createClient,
  updateClient,
  getPlatforms,
  createSubscription,
  getSubscriptionById,
  updateSubscription,
  getAccountBySubscriptionId,
  updateAccount,
  suspendSubscription,
  renewSubscription,
  deleteSubscriptionCascade,
  deleteClientCascade,
};
