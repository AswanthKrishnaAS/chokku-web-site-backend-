const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firebaseApp = null;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;
  if (admin.apps.length > 0) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  try {
    // 1. Try FIREBASE_SERVICE_ACCOUNT JSON string from environment
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('[FCM] Firebase Admin SDK initialized successfully');
        return firebaseApp;
      } catch (e) {
        console.warn('[FCM] Note parsing FIREBASE_SERVICE_ACCOUNT env string:', e.message);
      }
    }

    // 2. Try individual env variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        const cleanPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: cleanPrivateKey,
          }),
        });
        console.log('[FCM] Firebase Admin SDK initialized successfully');
        return firebaseApp;
      } catch (envCertErr) {
        console.warn('[FCM] Note initializing with env cert:', envCertErr.message);
      }
    }

    // 3. Try firebase-service-account.json file in backend root
    const serviceAccountPath = process.env.FIREBASE_CREDENTIALS_PATH || path.join(__dirname, '../../firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('[FCM] Firebase Admin SDK initialized successfully');
        return firebaseApp;
      } catch (fileErr) {
        console.warn('[FCM] Note initializing with service account file:', fileErr.message);
      }
    }

    console.warn('[FCM] Valid Firebase Admin service account credentials not detected.');
    return null;
  } catch (err) {
    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      console.log('[FCM] Firebase Admin SDK initialized successfully');
      return firebaseApp;
    }
    console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
    return null;
  }
}

module.exports = {
  initializeFirebase,
  getAdmin: () => admin,
};
