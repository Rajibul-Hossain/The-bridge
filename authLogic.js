import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
const loginHTML = `
    <h2 class="auth-title">Welcome Back</h2>
    <p class="auth-subtitle">Verify your credentials.</p>
    
    <div class="input-group">
        <input type="text" id="username" class="smooth-input" placeholder=" ">
        <label class="floating-label">Username</label>
    </div>

    <div class="input-group">
        <input type="password" id="password" class="smooth-input" placeholder=" ">
        <label class="floating-label">Password</label>
    </div>
    
    <button class="spring-btn" id="loginBtn" onclick="attemptLogin()">Connect Now</button>
    
    <p class="switch-text">
        First time here? <span class="switch-link" onclick="loadRegister()">Create account</span>
    </p>
`;

const registerHTML = `
    <h2 class="auth-title">Create Profile</h2>
    <p class="auth-subtitle">Establish a secure node.</p>
    
    <div class="input-group">
        <input type="text" id="regUsername" class="smooth-input" placeholder=" ">
        <label class="floating-label">Username</label>
    </div>

    <div class="input-group">
        <input type="password" id="regPassword" class="smooth-input" placeholder=" ">
        <label class="floating-label">Password</label>
    </div>

    <div class="input-group">
        <input type="password" id="regPasswordConfirm" class="smooth-input" placeholder=" ">
        <label class="floating-label">Confirm Password</label>
    </div>
    
    <button class="spring-btn" id="registerBtn" onclick="attemptRegister()">Create Account</button>
    
    <p class="switch-text">
        Already registered? <span class="switch-link" onclick="loadLogin()">Return to Login</span>
    </p>
`;

window.loadLogin = function() {
    let authBox = document.getElementById('authContainer');
    if(authBox) {
        authBox.innerHTML = loginHTML;
        authBox.style.animation = 'none';
        authBox.offsetHeight; 
        authBox.style.animation = null; 
    }
}

window.loadRegister = function() {
    let authBox = document.getElementById('authContainer');
    if(authBox) {
        authBox.innerHTML = registerHTML;
        authBox.style.animation = 'none';
        authBox.offsetHeight; 
        authBox.style.animation = null; 
    }
}
window.loadLogin();
let authentication, database;

try {
const firebaseConfig = {
  apiKey: "AIzaSyDEbvPzoahjdt0w5s2SF7Usn3ZnOxF2v38",
  authDomain: "ever-us.firebaseapp.com",
  projectId: "ever-us",
  storageBucket: "ever-us.firebasestorage.app",
  messagingSenderId: "925623567345",
  appId: "1:925623567345:web:10c9d1e5873a4df7983a50",
  measurementId: "G-6E4K45TWLV"
};
    const app = initializeApp(firebaseConfig);
    authentication = getAuth(app);
    database = getFirestore(app);
    console.log("Firebase systems armed and ready.");
} catch (error) {
    console.warn("Firebase not connected yet. UI is loaded in offline mode. Error:", error.message);
}
window.attemptRegister = async function() {
    if (!authentication) return alert("Firebase is not connected yet!");

    let typedUser = document.getElementById('regUsername').value.trim().toLowerCase();
    let pass1 = document.getElementById('regPassword').value.trim();
    let pass2 = document.getElementById('regPasswordConfirm').value.trim();
    let btn = document.getElementById('registerBtn');

    if (typedUser === "" || pass1 === "") return alert("Please fill in all fields.");
    if (pass1 !== pass2) return alert("Your passwords do not match.");

    btn.innerText = "Creating secure profile...";
    let fakeEmail = typedUser + "@thebridge.app";

    try {
        // 1. Create the user (This automatically logs them in behind the scenes)
        const userCredential = await createUserWithEmailAndPassword(authentication, fakeEmail, pass1);
        const uniqueUserId = userCredential.user.uid;

        // 2. Write their profile to the newly activated Firestore Database
        await setDoc(doc(database, "users", uniqueUserId), {
            username: typedUser,
            role: typedUser === "lavanya" ? "partner" : "admin",
            accountCreated: new Date().toISOString()
        });

        // 3. Set the active session locally for the dashboard to read
        localStorage.setItem("activeBridgeUser", typedUser);

        // 4. Instantly redirect to the inner sanctum
        window.location.href = 'd/nexus.html';

    } catch (error) {
        alert("Error creating account: " + error.message);
        btn.innerText = "Create Account";
    }
}
window.attemptLogin = async function() {
    if (!authentication) {
        // Fallback for UI testing if Firebase isn't set up yet
        alert("Firebase not connected. Bypassing straight to dashboard for testing!");
        window.location.href = 'd/nexus.html';
        return;
    }

    let typedUser = document.getElementById('username').value.trim().toLowerCase();
    let typedPass = document.getElementById('password').value.trim();
    let btn = document.getElementById('loginBtn');

    if (typedUser === "" || typedPass === "") return alert("Please fill in all fields.");

    btn.innerText = "Authenticating...";
    let fakeEmail = typedUser + "@thebridge.app";

    try {
        await signInWithEmailAndPassword(authentication, fakeEmail, typedPass);
        localStorage.setItem("activeBridgeUser", typedUser);
        window.location.href = 'd/nexus.html';
    } catch (error) {
        alert("Invalid credentials. Access Denied.");
        btn.innerText = "Connect Now"; 
    }
}