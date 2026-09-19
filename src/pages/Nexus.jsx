import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';

function Nexus() {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const { currentUser, currentUsername, partnerUid } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If they already have a partner, redirect to dashboard
    if (partnerUid) {
      navigate('/dashboard');
    }
  }, [partnerUid, navigate]);

  useEffect(() => {
    if (!currentUser) return;

    // Fetch all users
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const usersData = [];
        querySnapshot.forEach((doc) => {
          if (doc.id !== currentUser.uid) {
            usersData.push({ id: doc.id, ...doc.data() });
          }
        });
        setUsers(usersData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();

    // Listen for incoming requests
    const q = query(collection(db, "requests"), where("to", "==", currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = [];
      snapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() });
      });
      setRequests(requestsData);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const sendBridgeRequest = async (targetUid, targetUsername) => {
    try {
      await setDoc(doc(collection(db, "requests")), {
        from: currentUser.uid,
        fromUsername: currentUsername,
        to: targetUid,
        status: "pending",
        timestamp: new Date().toISOString()
      });
      alert(`Request broadcasted to ${targetUsername}!`);
    } catch (error) {
      alert("Failed to send request: " + error.message);
    }
  };

  const acceptRequest = async (requestId, senderUid) => {
    try {
      const bridgeId = "bridge_" + Date.now();

      await setDoc(doc(db, "bridges", bridgeId), {
        members: [currentUser.uid, senderUid],
        establishedAt: new Date().toISOString()
      });

      await updateDoc(doc(db, "users", currentUser.uid), {
        partnerUid: senderUid,
        bridgeId: bridgeId
      });

      await updateDoc(doc(db, "users", senderUid), {
        partnerUid: currentUser.uid,
        bridgeId: bridgeId
      });

      await deleteDoc(doc(db, "requests", requestId));

      alert("Handshake Complete! Welcome to the Inner Sanctum.");
      navigate('/dashboard');
    } catch (error) {
      alert("Error accepting connection: " + error.message);
    }
  };

  const declineRequest = async (requestId) => {
    try {
      await deleteDoc(doc(db, "requests", requestId));
    } catch (error) {
      console.error("Error declining request:", error);
    }
  };

  const executeLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("activeBridgeUser");
      navigate('/');
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <div className="aurora-background">
      <div className="nexus-window">
        <div className="nexus-header">
          <h2>The Nexus</h2>
          <p id="nexusStatus">
            Logged in as {currentUsername || '...'}. Scanning for nodes...
          </p>
        </div>

        <div className="nexus-split">
          <div className="directory-panel">
            <h3>Available</h3>
            <div id="usersDirectory" className="users-grid">
              {users.length === 0 ? (
                <p className="loading-text">No other nodes found in the system yet.</p>
              ) : (
                users.map((user) => {
                  const isClaimed = !!user.partnerUid;
                  return (
                    <div key={user.id} className="user-card">
                      <div className="user-info">
                        <p className="name">{user.username}</p>
                        <p className="role">{isClaimed ? 'Unavailable' : 'Available for connection'}</p>
                      </div>
                      {isClaimed ? (
                        <button className="connect-btn pending" disabled>Bridged</button>
                      ) : (
                        <button className="connect-btn" onClick={() => sendBridgeRequest(user.id, user.username)}>
                          Send Request
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="signals-panel">
            <h3>Incoming REQUESTS</h3>
            <div id="incomingRequests" className="requests-list">
              {requests.length === 0 ? (
                <p className="loading-text">No incoming handshakes.</p>
              ) : (
                requests.map((req) => (
                  <div key={req.id} className="request-card">
                    <div className="user-info">
                      <p className="name">{req.fromUsername}</p>
                      <p className="role">Wants to connect</p>
                    </div>
                    <div>
                      <button className="accept-btn" onClick={() => acceptRequest(req.id, req.from)}>Accept</button>
                      <button className="decline-btn" onClick={() => declineRequest(req.id)}>X</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="nexus-footer">
          <button className="logout-btn" onClick={executeLogout}>Disconnect & Logout</button>
        </div>
      </div>
    </div>
  );
}

export default Nexus;
