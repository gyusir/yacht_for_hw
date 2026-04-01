// Firebase Configuration
// Replace the placeholder values below with your own Firebase project config.
// Steps:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use an existing one)
// 3. Go to Project Settings > General > Your apps > Add web app
// 4. Copy the config object and paste the values below
// 5. Enable Realtime Database in the Firebase console

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
window.YachtGame.db = firebase.database();
window.YachtGame.auth = firebase.auth();
window.YachtGame.googleProvider = new firebase.auth.GoogleAuthProvider();
window.YachtGame.functions = firebase.app().functions('asia-northeast3');

// localhost에서는 emulator 사용
window.YachtGame.isEmulator = false;
if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator')) {
  window.YachtGame.isEmulator = true;
  window.YachtGame.auth.useEmulator('http://localhost:9099');
  window.YachtGame.db.useEmulator('localhost', 9000);
  window.YachtGame.functions.useEmulator('localhost', 5001);
}
