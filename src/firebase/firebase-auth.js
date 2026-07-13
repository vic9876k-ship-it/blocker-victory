import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential
} from "firebase/auth";

import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

export async function convertGoogleTokenToFirebase(token) {
  const credential = GoogleAuthProvider.credential(null, token);
  const result = await signInWithCredential(auth, credential);

  // cache only AFTER success
  await chrome.storage.local.set({
    uid: result.user.uid,
    userEmail: result.user.email,
    username: result.user.displayName
  });

  return result;
}