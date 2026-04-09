import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDAJig66eOUWLINBN662WRxCTUDqcCibcc',
  authDomain: 'stherplay-app-47825.firebaseapp.com',
  projectId: 'stherplay-app-47825',
  storageBucket: 'stherplay-app-47825.firebasestorage.app',
  messagingSenderId: '846243619708',
  appId: '1:846243619708:web:b7fa494f7a35061bf53af9',
};

const app = initializeApp(firebaseConfig);

let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager(),
    }),
  });
} catch (error) {
  console.warn('Falling back to default Firestore instance:', error);
  db = getFirestore(app);
}

const auth = getAuth(app);

window.firebaseServices = {
  app,
  db,
  auth,
  firebaseConfig,
};

export { app, db, auth, firebaseConfig };
