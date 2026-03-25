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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
window.YachtGame.db = firebase.database();
