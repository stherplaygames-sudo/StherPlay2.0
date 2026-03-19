import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

const BATCH_LIMIT = 400;

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function mapClient(client) {
  return {
    id: client.id,
    name: client.nombre,
    phone: client.telefono,
    status: client.estadoCliente,
    primaryPlatform: client.principal?.plataforma || '',
    expireDate: client.principal?.fechaVencimiento || '',
    daysRemaining: client.principal?.diasRestantes ?? null,
    subscriptionsCount: Array.isArray(client.suscripciones) ? client.suscripciones.length : 0,
    updatedAt: serverTimestamp(),
    source: 'sheets-import',
  };
}

function mapSubscription(subscription) {
  return {
    id: subscription.idSuscripcion || subscription.id,
    clientId: subscription.clientId,
    clientName: subscription.clientName,
    clientPhone: subscription.clientPhone,
    platform: subscription.plataforma,
    startDate: subscription.fechaInicio || '',
    expireDate: subscription.fechaVencimiento || '',
    daysRemaining: subscription.daysRemaining ?? null,
    status: subscription.normalizedStatus || subscription.estado,
    price: subscription.precioFinal || subscription.precio || subscription.price || 0,
    email: subscription.correo || '',
    profile: subscription.perfil || '',
    password: subscription.contrasena || '',
    updatedAt: serverTimestamp(),
    source: 'sheets-import',
  };
}

async function testFirebaseConnection() {
  const snapshot = await getDocs(collection(db, 'clients'));
  return {
    ok: true,
    count: snapshot.size,
  };
}

async function syncCollection(collectionName, items, mapper, idSelector) {
  const chunks = chunkArray(items, BATCH_LIMIT);

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const id = String(idSelector(item));
      batch.set(doc(db, collectionName, id), mapper(item), { merge: true });
    });
    await batch.commit();
  }
}

async function syncSheetsToFirebase(force = true) {
  if (!window.appCache?.ensureData) {
    throw new Error('appCache is not available');
  }

  const data = await window.appCache.ensureData(force);
  const clients = Array.isArray(data?.clients) ? data.clients : [];
  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];

  await syncCollection('clients', clients, mapClient, (item) => item.id);
  await syncCollection(
    'subscriptions',
    subscriptions,
    mapSubscription,
    (item) => item.idSuscripcion || item.id
  );

  return {
    ok: true,
    clients: clients.length,
    subscriptions: subscriptions.length,
  };
}

window.firebaseSyncService = {
  db,
  testFirebaseConnection,
  syncSheetsToFirebase,
};
window.testFirebaseConnection = testFirebaseConnection;
window.syncSheetsToFirebase = syncSheetsToFirebase;
