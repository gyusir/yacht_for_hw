// Firebase Configuration
window.YachtGame = window.YachtGame || {};

const firebaseConfig = {
  apiKey: "AIzaSyB3mDt-PW6AtI-WV1p9XRyGP8qwwmqw-JE",
  authDomain: "yacht-ff0c8.firebaseapp.com",
  databaseURL: "https://yacht-ff0c8-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "yacht-ff0c8",
  storageBucket: "yacht-ff0c8.firebasestorage.app",
  messagingSenderId: "101843337935",
  appId: "1:101843337935:web:536268f5230b18e9eeadba",
  measurementId: "G-DGSSY39SFG"
};

firebase.initializeApp(firebaseConfig);

// ─── App Check ───
window.YachtGame.isEmulator = (location.hostname === 'localhost');
if (window.YachtGame.isEmulator) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (!window.YachtGame.isEmulator) {
  firebase.appCheck().activate(
    new firebase.appCheck.ReCaptchaEnterpriseProvider('6LeJKaQsAAAAAMOTELXn0JR8jWduXEkSJxxYJuVQ'),
    true
  );
}

// ─── Firebase Services ───
window.YachtGame.db = firebase.database();
window.YachtGame.auth = firebase.auth();
window.YachtGame.googleProvider = new firebase.auth.GoogleAuthProvider();
window.YachtGame.functions = firebase.app().functions('asia-northeast3');

if (window.YachtGame.isEmulator) {
  window.YachtGame.auth.useEmulator('http://localhost:9099');
  window.YachtGame.db.useEmulator('localhost', 9000);
  window.YachtGame.functions.useEmulator('localhost', 5001);
}

// Beacon URL for sendBeacon (bot game tab close)
window.YachtGame.beaconUrl = window.YachtGame.isEmulator
  ? 'http://localhost:5001/yacht-ff0c8/asia-northeast3/saveBotGameResultBeacon'
  : 'https://asia-northeast3-yacht-ff0c8.cloudfunctions.net/saveBotGameResultBeacon';
