import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Firebase web config is public by design; access is enforced by firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyDQGA1KVfQAFRXstBzz50F7NNnjIfSYd6Q",
  authDomain: "angelus-sons.firebaseapp.com",
  projectId: "angelus-sons",
  storageBucket: "angelus-sons.firebasestorage.app",
  messagingSenderId: "666346786242",
  appId: "1:666346786242:web:b317427d594f4ff6255a5b",
};

export const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = initializeFirestore(app, {
  // WebChannel streams keep erroring on React Native; long polling is the stable transport here.
  experimentalForceLongPolling: true,
});
