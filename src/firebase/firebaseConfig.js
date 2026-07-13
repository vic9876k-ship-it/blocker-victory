import { initializeApp } from 'firebase/app'
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCR8dZBRmgjHVPzcmlGc2odAz14eh4WjLc",
  authDomain: "victory-fb944.firebaseapp.com",
  projectId: "victory-fb944",
  storageBucket: "victory-fb944.firebasestorage.app",
  messagingSenderId: "650310438797",
  appId: "1:650310438797:web:d938478b38f6f3275137c4",
  measurementId: "G-K6PRVV72B6"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export { app };