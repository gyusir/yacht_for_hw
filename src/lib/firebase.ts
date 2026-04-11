import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyB3mDt-PW6AtI-WV1p9XRyGP8qwwmqw-JE",
  authDomain: "yacht-ff0c8.firebaseapp.com",
  databaseURL:
    "https://yacht-ff0c8-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "yacht-ff0c8",
  storageBucket: "yacht-ff0c8.firebasestorage.app",
  messagingSenderId: "101843337935",
  appId: "1:101843337935:web:536268f5230b18e9eeadba",
  measurementId: "G-DGSSY39SFG",
};

const app = initializeApp(firebaseConfig);

export const isEmulator =
  location.hostname === "localhost" &&
  new URLSearchParams(location.search).has("emulator");

// App Check
if (location.hostname === "localhost") {
  // @ts-expect-error Firebase App Check debug token
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (!isEmulator) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(
      "6LeJKaQsAAAAAMOTELXn0JR8jWduXEkSJxxYJuVQ"
    ),
    isTokenAutoRefreshEnabled: true,
  });
}

// Firebase Services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, "asia-northeast3");

if (isEmulator) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectDatabaseEmulator(db, "localhost", 9000);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Beacon URL for sendBeacon (bot game tab close)
export const beaconUrl = isEmulator
  ? "http://localhost:5001/yacht-ff0c8/asia-northeast3/saveBotGameResultBeacon"
  : "https://asia-northeast3-yacht-ff0c8.cloudfunctions.net/saveBotGameResultBeacon";

export { app };
