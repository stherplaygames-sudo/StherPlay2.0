import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

const plataformasRef = collection(db, 'plataformas');
const subscriptionsRef = collection(db, 'subscriptions');

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return cleanString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePlatform(item) {
  const nombre = cleanString(item?.nombre || item?.name);
  const precioBase = Number(item?.precio_base ?? item?.precioBase ?? item?.costoMensual ?? item?.precio ?? item?.price ?? 0) || 0;
  const perfiles = Number(item?.perfiles ?? item?.perfiles_max ?? item?.profiles_max ?? item?.cupos_max ?? 0) || 0;
  const activo = item?.activo === undefined ? true : Boolean(item.activo);

  return {
    id: cleanString(item?.id),
    nombre,
    precioBase,
    costoMensual: precioBase,
    perfiles,
    activo,
    raw: item,
  };
}

function getPlatformNameFromSubscription(item) {
  return cleanString(item?.plataforma || item?.platform);
}

function getPlatformPriceFromSubscription(item) {
  return Number(item?.precioBase ?? item?.priceBase ?? item?.precio ?? item?.price ?? item?.precioFinal ?? 0) || 0;
}

async function getPlataformas() {
  const snapshot = await getDocs(query(plataformasRef, orderBy('nombre')));
  return snapshot.docs.map((docItem) =>
    normalizePlatform({
      id: docItem.id,
      ...docItem.data(),
    })
  );
}

async function createPlataforma(payload) {
  const nombre = cleanString(payload?.nombre);
  const perfiles = Number(payload?.perfiles ?? 0) || 0;
  const precioBase = Number(payload?.costoMensual ?? payload?.precioBase ?? 0) || 0;
  const activo = payload?.activo === undefined ? true : Boolean(payload.activo);

  if (!nombre) throw new Error('Nombre requerido');
  if (perfiles <= 0) throw new Error('Perfiles invalidos');
  if (precioBase < 0) throw new Error('Costo mensual invalido');

  const slug = normalizeSlug(nombre);
  const existentes = await getPlataformas();
  if (existentes.some((item) => normalizeSlug(item.nombre) === slug)) {
    throw new Error('Ya existe una plataforma con ese nombre');
  }

  return addDoc(plataformasRef, {
    nombre,
    name: nombre,
    perfiles,
    perfiles_max: perfiles,
    costoMensual: precioBase,
    precio_base: precioBase,
    precioBase,
    activo,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function updatePlataforma(id, payload) {
  const platformId = cleanString(id);
  const nombre = cleanString(payload?.nombre);
  const perfiles = Number(payload?.perfiles ?? 0) || 0;
  const precioBase = Number(payload?.costoMensual ?? payload?.precioBase ?? 0) || 0;
  const activo = payload?.activo === undefined ? true : Boolean(payload.activo);

  if (!platformId) throw new Error('ID requerido');
  if (!nombre) throw new Error('Nombre requerido');
  if (perfiles <= 0) throw new Error('Perfiles invalidos');
  if (precioBase < 0) throw new Error('Costo mensual invalido');

  const slug = normalizeSlug(nombre);
  const existentes = await getPlataformas();
  if (existentes.some((item) => item.id !== platformId && normalizeSlug(item.nombre) === slug)) {
    throw new Error('Ya existe una plataforma con ese nombre');
  }

  await updateDoc(doc(db, 'plataformas', platformId), {
    nombre,
    name: nombre,
    perfiles,
    perfiles_max: perfiles,
    costoMensual: precioBase,
    precio_base: precioBase,
    precioBase,
    activo,
    updatedAt: serverTimestamp(),
  });
}

async function deletePlataforma(id) {
  const platformId = cleanString(id);
  if (!platformId) throw new Error('ID requerido');
  await deleteDoc(doc(db, 'plataformas', platformId));
}

async function importPlataformasFromSubscriptions(defaultPerfiles = 5, subscriptionsInput = null) {
  const existentes = await getPlataformas();
  const existingSlugs = new Set(existentes.map((item) => normalizeSlug(item.nombre)));

  let subscriptions = Array.isArray(subscriptionsInput) ? subscriptionsInput : null;
  if (!subscriptions) {
    const subscriptionsSnapshot = await getDocs(subscriptionsRef);
    subscriptions = subscriptionsSnapshot.docs.map((docItem) => docItem.data() || {});
  }

  const grouped = new Map();

  (subscriptions || []).forEach((item) => {
    const nombre = getPlatformNameFromSubscription(item);
    if (!nombre) return;

    const key = normalizeSlug(nombre);
    const current = grouped.get(key) || {
      nombre,
      totalPrecio: 0,
      countPrecio: 0,
    };

    const price = getPlatformPriceFromSubscription(item);
    if (price > 0) {
      current.totalPrecio += price;
      current.countPrecio += 1;
    }

    grouped.set(key, current);
  });

  let created = 0;

  for (const [slug, item] of grouped.entries()) {
    if (existingSlugs.has(slug)) continue;

    const precioBase = item.countPrecio > 0 ? Math.round(item.totalPrecio / item.countPrecio) : 0;
    await addDoc(plataformasRef, {
      nombre: item.nombre,
      name: item.nombre,
      perfiles: Number(defaultPerfiles) || 5,
      perfiles_max: Number(defaultPerfiles) || 5,
      costoMensual: precioBase,
      precio_base: precioBase,
      precioBase,
      activo: true,
      importedFromSubscriptions: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    created += 1;
  }

  return { created, totalDetectadas: grouped.size };
}

window.plataformasService = {
  getPlataformas,
  createPlataforma,
  updatePlataforma,
  deletePlataforma,
  importPlataformasFromSubscriptions,
};

export { getPlataformas, createPlataforma, updatePlataforma, deletePlataforma, importPlataformasFromSubscriptions };
