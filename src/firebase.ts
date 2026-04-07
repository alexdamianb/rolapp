
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";
import firebaseConfig from "../firebase-config.json";


const app = initializeApp(firebaseConfig);


export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();


export const db = getDatabase(
  app,
  "https://gen-lang-client-0641922617-default-rtdb.europe-west1.firebasedatabase.app"
);