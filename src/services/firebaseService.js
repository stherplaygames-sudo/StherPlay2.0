import {
  collection,
  doc,
  deleteDoc,
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
import { getProfileBySubscriptionId, releaseProfile, upsertProfile } from './profilesService.js';

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

function buildProfileKey(accountId, platform, profileName) {
  const accountKey = normalizeSlug(accountId) || 'sin-cuenta';
  const platformKey = normalizeSlug(platform) || 'sin-plataforma';
  const profileKey = normalizeSlug(profileName) || 'sin-perfil';
  return `${accountKey}--${platformKey}--${profileKey}`;
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

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = cleanString(value).toLowerCase();
    if (['true', '1', 'si', 's?', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return fallback;
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

async function syncProfileAssignment({
  previousProfileId = '',
  subscriptionId = '',
  accountId = '',
  platform = '',
  profileName = '',
  pin = '',
  email = '',
  correoId = '',
  clientId = '',
  clientName = '',
}) {
  const prevId = cleanString(previousProfileId);
  const nextName = cleanString(profileName);

  if (prevId && (!nextName || prevId !== buildProfileKey(accountId, platform, nextName))) {
    await releaseProfile(prevId);
  }

  if (!nextName) return '';

  const profileId = buildProfileKey(accountId, platform, nextName);
  await upsertProfile({
    id: profileId,
    accountId,
    cuentaId: accountId,
    correoId,
    emailId: correoId,
    correo: email,
    email,
    plataforma: platform,
    platform,
    name: nextName,
    perfil: nextName,
    pin,
    password: pin,
    subscriptionId,
    idSuscripcion: subscriptionId,
    clientId,
    clienteId: clientId,
    assignedTo: clientId,
    assignedClientName: clientName,
  });

  return profileId;
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

async function resolveLogicalAccountId(correoId, platform, email) {
  const fallback = buildAccountKey(platform, email);
  const normalizedCorreoId = cleanString(correoId);
  if (!normalizedCorreoId) return fallback;

  const snapshot = await getDocs(query(collection(db, 'accounts'), where('correoId', '==', normalizedCorreoId)));
  const match = snapshot.docs.find((item) => {
    const data = item.data();
    return cleanString(data?.plataforma || data?.platform).toUpperCase() === cleanString(platform).toUpperCase();
  });

  if (!match) return fallback;

  const data = match.data();
  return cleanString(data?.cuentaId || data?.accountId) || fallback;
}

async function ensureCorreoDocument(email, password = '', correoId = '') {
  const normalizedEmail = cleanString(email).toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) return '';

  const emailLower = normalizedEmail;
  const existing = await getDocs(query(collection(db, 'correos'), where('emailLower', '==', emailLower)));
  if (!existing.empty) {
    const correoRef = existing.docs[0].ref;
    const updates = {
      updatedAt: serverTimestamp(),
    };

    if (cleanString(password)) {
      updates.password = cleanString(password);
    }

    await setDoc(correoRef, updates, { merge: true });
    return existing.docs[0].id;
  }

  const docId = cleanString(correoId) || buildCorreoKey(normalizedEmail);
  await setDoc(doc(db, 'correos', docId), {
    email: normalizedEmail,
    emailLower,
    password: cleanString(password),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return docId;
}

async function getAccountMetaByAccountId(accountId) {
  const id = cleanString(accountId);
  if (!id) return null;

  const directSnapshot = await getDoc(doc(db, 'accounts', id));
  if (!directSnapshot.exists()) return null;

  const data = directSnapshot.data();
  const sameLogicalAccount =
    cleanString(data?.cuentaId || data?.accountId || directSnapshot.id) === id;

  if (!sameLogicalAccount) return null;

  return {
    id: directSnapshot.id,
    cuentaId: id,
    accountId: id,
    correo: cleanString(data?.correo || data?.email),
    email: cleanString(data?.email || data?.correo),
    correoId: cleanString(data?.correoId || data?.emailId),
    plataforma: cleanString(data?.plataforma || data?.platform),
    platform: cleanString(data?.platform || data?.plataforma),
    perfilesMax: Number(data?.perfiles_max ?? data?.profiles_max ?? data?.maxProfiles ?? 0) || 0,
    renewalDate: formatDateISO(data?.renewalDate),
    renewalPrice: Number(data?.renewalPrice ?? data?.renewal_price ?? data?.costoRenovacion ?? 0) || 0,
    autoRenew: normalizeBoolean(data?.autoRenew, false),
    notes: cleanString(data?.notes),
  };
}

async function updateAccountMeta(payload) {
  const accountId = cleanString(payload?.cuentaId || payload?.accountId);
  if (!accountId) throw new Error('Cuenta ID requerido');

  const existingMeta = await getAccountMetaByAccountId(accountId);
  const email = cleanString(payload?.correo || payload?.email || existingMeta?.correo);
  const platform = cleanString(payload?.plataforma || payload?.platform || existingMeta?.plataforma).toUpperCase();
  const correoId = cleanString(payload?.correoId || payload?.emailId || existingMeta?.correoId) || buildCorreoKey(email);

  const hasProfilesMax = payload?.perfilesMax !== undefined || payload?.perfiles_max !== undefined || payload?.profiles_max !== undefined;
  const perfilesMax = hasProfilesMax
    ? Number(payload?.perfilesMax ?? payload?.perfiles_max ?? payload?.profiles_max ?? 0) || 0
    : Number(existingMeta?.perfilesMax || 0) || 0;

  const hasRenewalPrice = payload?.renewalPrice !== undefined || payload?.renewal_price !== undefined || payload?.costoRenovacion !== undefined;
  const renewalPrice = hasRenewalPrice
    ? Number(payload?.renewalPrice ?? payload?.renewal_price ?? payload?.costoRenovacion ?? 0) || 0
    : Number(existingMeta?.renewalPrice || 0) || 0;

  const hasRenewalDate = payload?.renewalDate !== undefined;
  const renewalDate = hasRenewalDate
    ? formatDateISO(payload?.renewalDate)
    : formatDateISO(existingMeta?.renewalDate);

  const hasAutoRenew = payload?.autoRenew !== undefined;
  const autoRenew = hasAutoRenew
    ? normalizeBoolean(payload?.autoRenew, false)
    : normalizeBoolean(existingMeta?.autoRenew, false);

  const notes = payload?.notes !== undefined ? cleanString(payload?.notes) : cleanString(existingMeta?.notes);

  await setDoc(
    doc(db, 'accounts', accountId),
    {
      id: accountId,
      cuentaId: accountId,
      accountId,
      correo: email,
      email,
      correoId,
      emailId: correoId,
      plataforma: platform,
      platform,
      perfiles_max: perfilesMax,
      profiles_max: perfilesMax,
      maxProfiles: perfilesMax,
      renewalDate,
      renewalPrice,
      autoRenew,
      notes,
      source: 'firebase',
      sourceType: 'accountMeta',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, cuentaId: accountId };
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
  const incomingCorreoId = cleanString(payload?.correoId);
  const ensuredCorreoId = email ? await ensureCorreoDocument(email, payload?.contrasena, incomingCorreoId) : '';
  const correoId = ensuredCorreoId || incomingCorreoId || buildCorreoKey(email);
  const accountId = cleanString(payload?.cuentaId) || await resolveLogicalAccountId(correoId, platform, email);

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
  const profileName = cleanString(payload?.perfil);
  const pin = cleanString(payload?.contrasena);
  const profileId = profileName ? buildProfileKey(accountId, platform, profileName) : '';

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
    correo: email,
    email,
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
    perfil: profileName,
    profile: profileName,
    profileId,
    pin,
    contrasena: pin,
    password: pin,
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
    perfil: profileName,
    profile: profileName,
    profileId,
    pin,
    contrasena: pin,
    password: pin,
    source: 'firebase',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'subscriptions', subscriptionId), subscriptionPayload);
  batch.set(doc(db, 'accounts', subscriptionId), accountPayload, { merge: true });
  batch.set(doc(db, 'accounts', accountId), {
    id: accountId,
    cuentaId: accountId,
    accountId,
    correo: email,
    email,
    correoId,
    emailId: correoId,
    plataforma: platform,
    platform,
    perfiles_max: Number(payload?.perfilesMax ?? payload?.profiles_max ?? 0) || 0,
    profiles_max: Number(payload?.perfilesMax ?? payload?.profiles_max ?? 0) || 0,
    maxProfiles: Number(payload?.perfilesMax ?? payload?.profiles_max ?? 0) || 0,
    renewalDate: '',
    renewalPrice: 0,
    autoRenew: false,
    notes: '',
    source: 'firebase',
    sourceType: 'accountMeta',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  if (profileName) {
    await syncProfileAssignment({
      subscriptionId,
      accountId,
      platform,
      profileName,
      pin,
      email,
      correoId,
      clientId,
      clientName: cleanString(client?.nombre || client?.name),
    });
  }

  return { ok: true, idSuscripcion: subscriptionId, cuentaId: accountId };
}

async function getSubscriptionById(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('ID requerido');

  const snapshot = await getDoc(doc(db, 'subscriptions', id));
  if (!snapshot.exists()) throw new Error('Suscripcion no encontrada');

  const data = snapshot.data();
  const relatedAccount = await getAccountBySubscriptionId(id);
  const profileDoc = await getProfileBySubscriptionId(id);
  const profileId = cleanString(data?.profileId || profileDoc?.id);
  const resolvedProfile = cleanString(profileDoc?.name || profileDoc?.perfil || data?.perfil || data?.profile || relatedAccount?.perfil);
  const resolvedPin = cleanString(profileDoc?.pin || data?.pin || data?.contrasena || data?.password || relatedAccount?.contrasena);
  return {
    idSuscripcion: id,
    cuentaId: cleanString(data?.cuentaId || data?.accountId || relatedAccount?.cuentaId),
    accountId: cleanString(data?.cuentaId || data?.accountId || relatedAccount?.cuentaId),
    profileId,
    clientId: cleanString(data?.clientId || data?.clienteId),
    clientName: cleanString(data?.clientName || data?.nombre),
    plataforma: cleanString(data?.plataforma || data?.platform),
    inicio: formatDateISO(data?.fechaInicio || data?.startDate),
    vencimiento: formatDateISO(data?.fechaVencimiento || data?.expireDate),
    estado: deriveSubscriptionStatus(
      data?.fechaVencimiento || data?.expireDate,
      data?.estado || data?.status
    ),
    precioFinal: data?.precioFinal ?? data?.precio ?? data?.price ?? '',
    correo: cleanString(data?.correo || data?.email || relatedAccount?.correo),
    correoId: cleanString(data?.correoId || data?.emailId),
    perfil: resolvedProfile,
    pin: resolvedPin,
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
  const email = cleanString(payload?.correo || existing.correo);
  const profile = cleanString(payload?.perfil || existing.perfil);
  const pin = cleanString(payload?.pin || existing.pin);
  const previousProfileId = cleanString(existing?.profileId);
  const incomingCorreoId = cleanString(payload?.correoId || existing.correoId);
  const ensuredCorreoId = email ? await ensureCorreoDocument(email, pin, incomingCorreoId) : '';
  const correoId = ensuredCorreoId || incomingCorreoId || buildCorreoKey(email);
  const accountId = cleanString(payload?.cuentaId) || existing.cuentaId || buildAccountKey(platform, email);
  const profileId = profile ? buildProfileKey(accountId, platform, profile) : '';
  const status = deriveSubscriptionStatus(expireDate, explicitStatus);
  const daysRemaining = calculateDaysRemaining(expireDate);

  if (!platform) throw new Error('Plataforma requerida');

  const updatePayload = {
    cuentaId: accountId,
    accountId,
    plataforma: platform,
    platform,
    correo: email,
    email,
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
    perfil: profile,
    profile,
    profileId,
    pin,
    contrasena: pin,
    password: pin,
    updatedAt: serverTimestamp(),
  };

  if (finalPrice !== '') {
    const numericPrice = Number(finalPrice) || 0;
    updatePayload.precioFinal = numericPrice;
    updatePayload.precio = numericPrice;
    updatePayload.price = numericPrice;
  }

  await updateDoc(doc(db, 'subscriptions', id), updatePayload);

  await setDoc(doc(db, 'accounts', id), {
    id,
    idSuscripcion: id,
    subscriptionId: id,
    cuentaId: accountId,
    accountId,
    plataforma: platform,
    platform,
    correoId,
    emailId: correoId,
    correo: email,
    email,
    perfil: profile,
    profile,
    profileId,
    contrasena: pin,
    password: pin,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await syncProfileAssignment({
    previousProfileId,
    subscriptionId: id,
    accountId,
    platform,
    profileName: profile,
    pin,
    email,
    correoId,
    clientId: cleanString(existing?.clientId),
    clientName: cleanString(existing?.clientName || existing?.nombre),
  });

  return { ok: true };
}

async function getAccountBySubscriptionId(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('ID requerido');

  const directSnapshot = await getDoc(doc(db, 'accounts', id));
  if (directSnapshot.exists()) {
    const data = directSnapshot.data();
    const logicalAccountId = cleanString(data?.cuentaId || data?.accountId);
    const meta = await getAccountMetaByAccountId(logicalAccountId);
    const profile = await getProfileBySubscriptionId(id);
    return {
      cuentaId: logicalAccountId,
      correo: cleanString(meta?.correo || data?.correo || data?.email),
      perfil: cleanString(profile?.name || profile?.perfil || data?.perfil || data?.profile),
      contrasena: cleanString(profile?.pin || data?.contrasena || data?.password),
      renewalDate: cleanString(meta?.renewalDate),
      renewalPrice: Number(meta?.renewalPrice || 0) || 0,
      autoRenew: Boolean(meta?.autoRenew),
      notes: cleanString(meta?.notes),
      perfilesMax: Number(meta?.perfilesMax || 0) || 0,
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
  const logicalAccountId = cleanString(data?.cuentaId || data?.accountId);
  const meta = await getAccountMetaByAccountId(logicalAccountId);
  const profile = await getProfileBySubscriptionId(id);
  return {
    cuentaId: logicalAccountId,
    correo: cleanString(meta?.correo || data?.correo || data?.email),
    perfil: cleanString(profile?.name || profile?.perfil || data?.perfil || data?.profile),
    contrasena: cleanString(profile?.pin || data?.contrasena || data?.password),
    renewalDate: cleanString(meta?.renewalDate),
    renewalPrice: Number(meta?.renewalPrice || 0) || 0,
    autoRenew: Boolean(meta?.autoRenew),
    notes: cleanString(meta?.notes),
    perfilesMax: Number(meta?.perfilesMax || 0) || 0,
  };
}

async function updateAccount(payload) {
  const id = cleanString(payload?.idSuscripcion);
  if (!id) throw new Error('ID requerido');

  const subscriptionSnapshot = await getDoc(doc(db, 'subscriptions', id));
  const subscriptionData = subscriptionSnapshot.exists() ? subscriptionSnapshot.data() : {};
  const previousProfileId = cleanString(subscriptionData?.profileId);
  const platform = cleanString(subscriptionData?.plataforma || subscriptionData?.platform);
  const email = cleanString(payload?.correo);
  const incomingCorreoId = cleanString(payload?.correoId);
  const ensuredCorreoId = email ? await ensureCorreoDocument(email, payload?.contrasena, incomingCorreoId) : '';
  const correoId = ensuredCorreoId || incomingCorreoId || buildCorreoKey(email);
  const accountId = cleanString(payload?.cuentaId) || buildAccountKey(platform, email);
  const profile = cleanString(payload?.perfil);
  const pin = cleanString(payload?.contrasena);
  const profileId = profile ? buildProfileKey(accountId, platform, profile) : '';

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
      perfil: profile,
      profile: profile,
      profileId,
      pin,
      contrasena: pin,
      password: pin,
      source: 'firebase',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await updateAccountMeta({
    cuentaId: accountId,
    correo: email,
    correoId,
    plataforma: platform,
    perfilesMax: payload?.perfilesMax ?? payload?.profiles_max ?? 0,
    renewalDate: payload?.renewalDate,
    renewalPrice: payload?.renewalPrice,
    autoRenew: payload?.autoRenew,
    notes: payload?.notes,
  });

  await updateDoc(doc(db, 'subscriptions', id), {
    cuentaId: accountId,
    accountId,
    correo: email,
    email,
    correoId,
    emailId: correoId,
    perfil: profile,
    profile: profile,
    profileId,
    pin,
    contrasena: pin,
    password: pin,
    updatedAt: serverTimestamp(),
  });

  await syncProfileAssignment({
    previousProfileId,
    subscriptionId: id,
    accountId,
    platform,
    profileName: profile,
    pin,
    email,
    correoId,
    clientId: cleanString(subscriptionData?.clientId || subscriptionData?.clienteId),
    clientName: cleanString(subscriptionData?.clientName || subscriptionData?.nombre),
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

async function deleteCorreo(correoId) {
  const id = cleanString(correoId);
  if (!id) throw new Error('Correo ID requerido');

  await deleteDoc(doc(db, 'correos', id));
  return { ok: true };
}

async function deleteAccountSafe(accountId) {
  const id = cleanString(accountId);
  if (!id) throw new Error('Cuenta ID requerido');

  const subscriptionsRef = collection(db, 'subscriptions');
  const [byCuentaId, byAccountId] = await Promise.all([
    getDocs(query(subscriptionsRef, where('cuentaId', '==', id))),
    getDocs(query(subscriptionsRef, where('accountId', '==', id))),
  ]);

  const linkedSubscriptions = [...byCuentaId.docs, ...byAccountId.docs]
    .filter((item, index, self) => self.findIndex((x) => x.id === item.id) === index);

  if (linkedSubscriptions.length > 0) {
    throw new Error('No se puede eliminar: la cuenta tiene suscripciones activas');
  }

  const profilesRef = collection(db, 'profiles');
  const [profilesByCuentaId, profilesByAccountId] = await Promise.all([
    getDocs(query(profilesRef, where('cuentaId', '==', id))),
    getDocs(query(profilesRef, where('accountId', '==', id))),
  ]);

  const profileDocs = [...profilesByCuentaId.docs, ...profilesByAccountId.docs]
    .filter((item, index, self) => self.findIndex((x) => x.id === item.id) === index);

  for (const profileDoc of profileDocs) {
    const data = profileDoc.data();
    if (cleanString(data?.assignedTo || data?.clientId || data?.clienteId)) {
      throw new Error('No se puede eliminar: existen perfiles asignados');
    }
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, 'accounts', id));
  profileDocs.forEach((profileDoc) => {
    batch.delete(profileDoc.ref);
  });
  await batch.commit();

  return {
    ok: true,
    deletedProfiles: profileDocs.length,
  };
}

async function deleteSubscriptionCascade(subscriptionId) {
  const id = cleanString(subscriptionId);
  if (!id) throw new Error('Subscription ID is required');

  const linkedProfile = await getProfileBySubscriptionId(id);
  if (linkedProfile?.id) {
    await releaseProfile(linkedProfile.id);
  }

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

  const profilesRef = collection(db, 'profiles');
  const profileSnapshots = await Promise.all([
    getDocs(query(profilesRef, where('clientId', '==', id))),
    getDocs(query(profilesRef, where('clienteId', '==', id))),
    getDocs(query(profilesRef, where('assignedTo', '==', id))),
  ]);

  const profileIds = new Set();
  profileSnapshots.forEach((snapshot) => {
    snapshot.docs.forEach((profileDoc) => {
      if (profileIds.has(profileDoc.id)) return;
      profileIds.add(profileDoc.id);
      batch.delete(profileDoc.ref);
    });
  });

  if (subscriptionIds.size > 0) {
    const subscriptionIdArray = [...subscriptionIds];
    const linkedProfiles = await Promise.all(
      subscriptionIdArray.map((subscriptionId) =>
        getDocs(query(profilesRef, where('subscriptionId', '==', subscriptionId)))
      )
    );

    linkedProfiles.forEach((snapshot) => {
      snapshot.docs.forEach((profileDoc) => {
        if (profileIds.has(profileDoc.id)) return;
        profileIds.add(profileDoc.id);
        batch.delete(profileDoc.ref);
      });
    });
  }

  await batch.commit();
  return {
    ok: true,
    deletedSubscriptions: subscriptionIds.size,
    deletedAccounts: accountIds.size,
    deletedProfiles: profileIds.size,
  };
}

window.firebaseService = {
  db,
  getClients,
  getSubscriptions,
  getAccounts,
  buildCorreoKey,
  buildAccountKey,
  buildProfileKey,
  createClient,
  updateClient,
  getPlatforms,
  createSubscription,
  getSubscriptionById,
  updateSubscription,
  getAccountBySubscriptionId,
  updateAccount,
  getAccountMetaByAccountId,
  updateAccountMeta,
  deleteCorreo,
  deleteAccountSafe,
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
  buildProfileKey,
  createClient,
  updateClient,
  getPlatforms,
  createSubscription,
  getSubscriptionById,
  updateSubscription,
  getAccountBySubscriptionId,
  updateAccount,
  getAccountMetaByAccountId,
  updateAccountMeta,
  deleteCorreo,
  deleteAccountSafe,
  suspendSubscription,
  renewSubscription,
  deleteSubscriptionCascade,
  deleteClientCascade,
};
