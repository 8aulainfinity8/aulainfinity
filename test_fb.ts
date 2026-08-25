import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
const app = initializeApp({});
initializeFirestore(app, { experimentalForceLongPolling: true });
