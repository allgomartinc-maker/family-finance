// 1) Firebase console → Project settings → Your apps → Web app → copy the config object here.
// 2) This key is safe to publish: firestore.rules is what protects the family data.
export const firebaseConfig = {
  apiKey: 'AIzaSyAFHkvzE4kSaecuM1FKohFtGYjHEDPFySo',
  authDomain: 'family-finance-75f11.firebaseapp.com',
  projectId: 'family-finance-75f11',
  storageBucket: 'family-finance-75f11.firebasestorage.app',
  messagingSenderId: '279554661333',
  appId: '1:279554661333:web:b781e213bbfc6de0c2bb5c',
};

// Local testing only: open http://localhost:5178/?emu to use the Firebase emulator.
export const emulator = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).has('emu');

export const emulatorConfig = { apiKey: 'demo-key', authDomain: 'demo-family.firebaseapp.com', projectId: 'demo-family', appId: 'demo-app' };
