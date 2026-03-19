import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig.js';

function mapSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
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

window.firebaseService = {
  db,
  getClients,
  getSubscriptions,
  getAccounts,
};

export { db, getClients, getSubscriptions, getAccounts };
