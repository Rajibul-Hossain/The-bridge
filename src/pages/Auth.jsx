import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingText, setLoadingText] = useState('');
  const navigate = useNavigate();
  const { currentUser, partnerUid } = useAuth();

  useEffect(() => {
    // If user is already logged in, redirect them
    if (currentUser) {
       if(partnerUid) {
           navigate('/dashboard');
       } else {
           navigate('/nexus');
       }
    }
  }, [currentUser, partnerUid, navigate]);

  const toggleView = () => {
    setIsLogin(!isLogin);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setLoadingText('');
  };

  const attemptLogin = async () => {
    const typedUser = username.trim().toLowerCase();
    const typedPass = password.trim();

    if (typedUser === "" || typedPass === "") {
        return alert("Please fill in all fields.");
    }

    setLoadingText("Authenticating...");
    const fakeEmail = typedUser + "@thebridge.app";

    try {
        await signInWithEmailAndPassword(auth, fakeEmail, typedPass);
        localStorage.setItem("activeBridgeUser", typedUser);
        navigate('/nexus');
    } catch (error) {
        alert("Invalid credentials. Access Denied.");
        setLoadingText('');
    }
  };

  const attemptRegister = async () => {
    const typedUser = username.trim().toLowerCase();
    const pass1 = password.trim();
    const pass2 = confirmPassword.trim();

    if (typedUser === "" || pass1 === "") {
        return alert("Please fill in all fields.");
    }
    if (pass1 !== pass2) {
        return alert("Your passwords do not match.");
    }

    setLoadingText("Creating secure profile...");
    const fakeEmail = typedUser + "@thebridge.app";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, pass1);
        const uniqueUserId = userCredential.user.uid;

        await setDoc(doc(db, "users", uniqueUserId), {
            username: typedUser,
            role: typedUser === "lavanya" ? "partner" : "admin",
            accountCreated: new Date().toISOString()
        });

        localStorage.setItem("activeBridgeUser", typedUser);
        navigate('/nexus');

    } catch (error) {
        alert("Error creating account: " + error.message);
        setLoadingText('');
    }
  };

  return (
    <div className="aurora-background">
      <div className="mac-window">
        <div className="left-art">
          <div className="art-content">
            <h1 className="brand-title">THE BRIDGE</h1>
            <h2 className="hero-headline">Distance is just a variable.</h2>
            <p className="hero-subtext">Securely syncing. Your private ecosystem awaits.</p>
          </div>
        </div>

        <div className="right-form">
          <div id="authContainer" className="form-wrapper">
            {isLogin ? (
              <>
                <h2 className="auth-title">Welcome Back</h2>
                <p className="auth-subtitle">Verify your credentials.</p>
                <div className="input-group">
                  <input
                    type="text"
                    id="username"
                    className="smooth-input"
                    placeholder=" "
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <label className="floating-label">Username</label>
                </div>
                <div className="input-group">
                  <input
                    type="password"
                    id="password"
                    className="smooth-input"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label className="floating-label">Password</label>
                </div>
                <button className="spring-btn" id="loginBtn" onClick={attemptLogin}>
                  {loadingText || "Connect Now"}
                </button>
                <p className="switch-text">
                  First time here? <span className="switch-link" onClick={toggleView}>Create account</span>
                </p>
              </>
            ) : (
              <>
                <h2 className="auth-title">Create Profile</h2>
                <p className="auth-subtitle">Establish a secure node.</p>
                <div className="input-group">
                  <input
                    type="text"
                    id="regUsername"
                    className="smooth-input"
                    placeholder=" "
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <label className="floating-label">Username</label>
                </div>
                <div className="input-group">
                  <input
                    type="password"
                    id="regPassword"
                    className="smooth-input"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label className="floating-label">Password</label>
                </div>
                <div className="input-group">
                  <input
                    type="password"
                    id="regPasswordConfirm"
                    className="smooth-input"
                    placeholder=" "
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <label className="floating-label">Confirm Password</label>
                </div>
                <button className="spring-btn" id="registerBtn" onClick={attemptRegister}>
                  {loadingText || "Create Account"}
                </button>
                <p className="switch-text">
                  Already registered? <span className="switch-link" onClick={toggleView}>Return to Login</span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;
