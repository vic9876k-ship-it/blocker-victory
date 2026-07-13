import { auth } from "../src/firebase/firebase-auth.js";

import { onAuthStateChanged } from "firebase/auth";

import backgroundImage from '../public/assets/background-image.png';

import '../src/CSS/styles.css';

onAuthStateChanged(auth, (user) => {

  if (!user) {
    console.log("No signed in user");
    return;
  }

  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");

  if (nameEl) {
    nameEl.textContent = user.displayName || "Victory User";
  }

  if (emailEl) {
    emailEl.textContent = user.email || "";
  }

});
