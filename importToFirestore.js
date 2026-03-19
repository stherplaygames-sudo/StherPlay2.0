import admin from 'firebase-admin';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwBsBwp5zkmr_cnq0ZuZAhlIfdSO7VH-whbiwgmWA26x_r7YC0QbqpP8ZfAmVYYrOU/exec';

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');

function loadServiceAccount() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `Missing service account file at ${SERVICE_ACCOUNT_PATH}. Download it from Firebase Console > Project Settings > Service accounts.`
    );
  }

  return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
}

function ensureFirebaseAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = loadServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin.firestore();
}

function normalizeClient(client) {
  return {
    id: String(client.id || '').trim(),
    name: String(client.name || client.nombre || '').trim(),
    phone: String(client.phone || client.telefono || '').trim(),
    status: String(client.status || client.estado || 'ACTIVA').trim(),
    balance: Number(client.balance || client.saldo || 0),
    source: 'app-script-import',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function normalizeSubscription(sub) {
  return {
    id: String(sub.id || sub.idSuscripcion || '').trim(),
    clientId: String(sub.clientId || sub.clienteId || '').trim(),
    clientName: String(sub.clientName || sub.nombre || '').trim(),
    clientPhone: String(sub.clientPhone || sub.telefono || '').trim(),
    platform: String(sub.platform || sub.plataforma || '').trim(),
    startDate: String(sub.startDate || sub.fechaInicio || '').trim(),
    expireDate: String(sub.expireDate || sub.fechaVencimiento || '').trim(),
    daysRemaining: sub.daysRemaining ?? sub.diasRestantes ?? null,
    status: String(sub.status || sub.estado || '').trim(),
    price: Number(sub.price || sub.precio || 0),
    email: String(sub.email || sub.correo || '').trim(),
    profile: String(sub.profile || sub.perfil || '').trim(),
    password: String(sub.password || sub.contrasena || '').trim(),
    source: 'app-script-import',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function fetchSourceData() {
  const { data } = await axios.get(APPS_SCRIPT_URL, {
    params: { action: 'loadAppData' },
    timeout: 30000,
  });

  if (!data?.ok) {
    throw new Error(data?.message || 'Apps Script returned an invalid response');
  }

  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
  };
}

async function writeCollection(db, collectionName, docs, idSelector) {
  if (!docs.length) return;

  const chunkSize = 400;
  for (let index = 0; index < docs.length; index += chunkSize) {
    const batch = db.batch();
    const chunk = docs.slice(index, index + chunkSize);

    chunk.forEach((docData) => {
      const docId = String(idSelector(docData));
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, docData, { merge: true });
    });

    await batch.commit();
    console.log(`Imported ${Math.min(index + chunk.length, docs.length)}/${docs.length} into ${collectionName}`);
  }
}

async function migrate() {
  console.log('Connecting to Firestore...');
  const db = ensureFirebaseAdmin();

  console.log('Fetching data from Apps Script...');
  const source = await fetchSourceData();

  const clients = source.clients.map(normalizeClient).filter((item) => item.id);
  const subscriptions = source.subscriptions.map(normalizeSubscription).filter((item) => item.id);

  console.log(`Clients: ${clients.length}`);
  console.log(`Subscriptions: ${subscriptions.length}`);

  await writeCollection(db, 'clients', clients, (item) => item.id);
  await writeCollection(db, 'subscriptions', subscriptions, (item) => item.id);

  console.log('Migration completed successfully.');
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
