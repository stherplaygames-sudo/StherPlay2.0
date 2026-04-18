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
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePlatform(value) {
  return normalizeText(value).toUpperCase();
}

function buildProfileKey(accountId, platform, profileName) {
  const accountKey = normalizeSlug(accountId) || 'sin-cuenta';
  const platformKey = normalizeSlug(platform) || 'sin-plataforma';
  const profileKey = normalizeSlug(profileName) || 'sin-perfil';
  return `${accountKey}--${platformKey}--${profileKey}`;
}

function applyProfiles(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: normalizeText(item.id),
      accountId: normalizeText(item.accountId || item.cuentaId),
      cuentaId: normalizeText(item.cuentaId || item.accountId),
      correoId: normalizeText(item.correoId || item.emailId),
      emailId: normalizeText(item.emailId || item.correoId),
      correo: normalizeText(item.correo || item.email),
      email: normalizeText(item.email || item.correo),
      plataforma: normalizePlatform(item.plataforma || item.platform),
      platform: normalizePlatform(item.platform || item.plataforma),
      name: normalizeText(item.name || item.perfil),
      perfil: normalizeText(item.perfil || item.name),
      pin: normalizeText(item.pin),
      password: normalizeText(item.password || item.contrasena),
      subscriptionId: normalizeText(item.subscriptionId || item.idSuscripcion),
      idSuscripcion: normalizeText(item.idSuscripcion || item.subscriptionId),
      clientId: normalizeText(item.clientId || item.clienteId || item.assignedTo),
      clienteId: normalizeText(item.clienteId || item.clientId || item.assignedTo),
      assignedTo: normalizeText(item.assignedTo || item.clientId || item.clienteId),
      assignedClientName: normalizeText(item.assignedClientName || item.clientName || item.nombre),
      active: item.active !== false,
    }))
    .filter((item) => item.id);
}

async function getProfiles(force = false) {
  if (!force && Array.isArray(window.appState?.profilesCache)) {
    return window.appState.profilesCache;
  }

  const snapshot = await getDocs(collection(db, 'profiles'));
  const items = applyProfiles(snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })));

  window.appState.profilesCache = items;
  return items;
}

async function getProfileById(profileId) {
  const id = normalizeText(profileId);
  if (!id) return null;

  const snapshot = await getDoc(doc(db, 'profiles', id));
  if (!snapshot.exists()) return null;

  return applyProfiles([{ id: snapshot.id, ...snapshot.data() }])[0] || null;
}

async function getProfileBySubscriptionId(subscriptionId) {
  const id = normalizeText(subscriptionId);
  if (!id) return null;

  const snapshot = await getDocs(query(collection(db, 'profiles'), where('subscriptionId', '==', id)));
  if (snapshot.empty) return null;

  return applyProfiles([{ id: snapshot.docs[0].id, ...snapshot.docs[0].data() }])[0] || null;
}

async function getProfilesByAccount(accountId, force = false) {
  const id = normalizeText(accountId);
  const items = await getProfiles(force);
  if (!id) return [];
  return items.filter((item) => item.accountId === id || item.cuentaId === id);
}

async function getSuggestedProfiles({ accountId = '', correoId = '', email = '', platform = '', maxProfiles = 0, force = false } = {}) {
  const normalizedAccountId = normalizeText(accountId);
  const normalizedCorreoId = normalizeText(correoId);
  const normalizedEmail = normalizeText(email).toLowerCase();
  const normalizedPlatform = normalizePlatform(platform);
  const items = await getProfiles(force);

  const related = items.filter((item) => {
    const samePlatform = !normalizedPlatform || item.plataforma === normalizedPlatform;
    const sameAccount = normalizedAccountId && item.accountId === normalizedAccountId;
    const sameCorreoId = normalizedCorreoId && item.correoId === normalizedCorreoId;
    const sameEmail = normalizedEmail && normalizeText(item.correo || item.email).toLowerCase() === normalizedEmail;
    return samePlatform && (sameAccount || sameCorreoId || sameEmail);
  });

  const names = related
    .map((item) => item.name || item.perfil)
    .filter(Boolean);

  const generic = Array.from(
    { length: Math.max(Number(maxProfiles) || 0, names.length, 5) },
    (_, index) => `Perfil ${index + 1}`
  );

  return [...new Set([...names, ...generic])];
}

async function upsertProfile(data) {
  const accountId = normalizeText(data?.accountId || data?.cuentaId);
  const platform = normalizePlatform(data?.platform || data?.plataforma);
  const profileName = normalizeText(data?.name || data?.perfil);
  if (!accountId || !platform || !profileName) return null;

  const id = normalizeText(data?.id) || buildProfileKey(accountId, platform, profileName);
  const payload = {
    id,
    accountId,
    cuentaId: accountId,
    correoId: normalizeText(data?.correoId || data?.emailId),
    emailId: normalizeText(data?.emailId || data?.correoId),
    correo: normalizeText(data?.correo || data?.email),
    email: normalizeText(data?.email || data?.correo),
    plataforma: platform,
    platform,
    name: profileName,
    perfil: profileName,
    pin: normalizeText(data?.pin),
    password: normalizeText(data?.password || data?.contrasena),
    subscriptionId: normalizeText(data?.subscriptionId || data?.idSuscripcion),
    idSuscripcion: normalizeText(data?.idSuscripcion || data?.subscriptionId),
    clientId: normalizeText(data?.clientId || data?.clienteId || data?.assignedTo),
    clienteId: normalizeText(data?.clienteId || data?.clientId || data?.assignedTo),
    assignedTo: normalizeText(data?.assignedTo || data?.clientId || data?.clienteId),
    assignedClientName: normalizeText(data?.assignedClientName || data?.clientName || data?.nombre),
    active: data?.active !== false,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'profiles', id), {
    ...payload,
    createdAt: serverTimestamp(),
  }, { merge: true });

  window.appState.profilesCache = null;
  return payload;
}

async function releaseProfile(profileId) {
  const id = normalizeText(profileId);
  if (!id) return;

  await updateDoc(doc(db, 'profiles', id), {
    subscriptionId: '',
    idSuscripcion: '',
    clientId: '',
    clienteId: '',
    assignedTo: '',
    assignedClientName: '',
    updatedAt: serverTimestamp(),
  });

  window.appState.profilesCache = null;
}

window.profilesService = {
  buildProfileKey,
  getProfiles,
  getProfileById,
  getProfileBySubscriptionId,
  getProfilesByAccount,
  getSuggestedProfiles,
  upsertProfile,
  releaseProfile,
};

export {
  buildProfileKey,
  getProfiles,
  getProfileById,
  getProfileBySubscriptionId,
  getProfilesByAccount,
  getSuggestedProfiles,
  upsertProfile,
  releaseProfile,
};
