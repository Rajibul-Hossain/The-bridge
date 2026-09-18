import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "fake-api-key",
    authDomain: "fake-project.firebaseapp.com",
    projectId: "fake-project",
    storageBucket: "fake-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

// set persistence to local by default
setPersistence(auth, browserLocalPersistence).catch(console.error);

export { auth, db, rtdb, storage };
