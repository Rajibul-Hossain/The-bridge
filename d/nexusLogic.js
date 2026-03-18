// ==========================================
// 1. FIREBASE IMPORTS
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, query, where, onSnapshot, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 🔴 PASTE YOUR EXACT FIREBASE CONFIG HERE 🔴
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
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUsername = "";

// ==========================================
// 2. AUTHENTICATION LISTENER (Who is looking at the screen?)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Fetch their username from the database
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUsername = userDoc.data().username;
            document.getElementById("nexusStatus").innerText = `Logged in as ${currentUsername}. Scanning for nodes...`;
            
            // Check if they are already bridged! If yes, skip the Nexus entirely.
            if(userDoc.data().partnerUid) {
                window.location.href = 'd/dashboard.html';
                return;
            }
            
            // If no partner, load the Nexus data
            fetchAllUsers();
            listenForRequests();
        }
    } else {
        // Not logged in? Kick them back to the gatekeeper
        window.location.href = 'index.html';
    }
});

// ==========================================
// 3. FETCH THE GLOBAL DIRECTORY
// ==========================================
async function fetchAllUsers() {
    const directoryBox = document.getElementById('usersDirectory');
    directoryBox.innerHTML = ""; // Clear loading text

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        
        querySnapshot.forEach((documentSnapshot) => {
            let userData = documentSnapshot.data();
            let userId = documentSnapshot.id;

            // Don't show the currently logged in user in their own search!
            if (userId !== currentUser.uid) {
                
                // Has this user already been claimed by someone else?
                let isClaimed = userData.partnerUid ? true : false;
                
                let btnHTML = isClaimed 
                    ? `<button class="connect-btn pending" disabled>Bridged</button>`
                    : `<button class="connect-btn" onclick="sendBridgeRequest('${userId}', '${userData.username}')">Send Request</button>`;

                directoryBox.innerHTML += `
                    <div class="user-card">
                        <div class="user-info">
                            <p class="name">${userData.username}</p>
                            <p class="role">${isClaimed ? 'Unavailable' : 'Available for connection'}</p>
                        </div>
                        ${btnHTML}
                    </div>
                `;
            }
        });

        if(directoryBox.innerHTML === "") {
            directoryBox.innerHTML = "<p class='loading-text'>No other nodes found in the system yet.</p>";
        }

    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

// ==========================================
// 4. REAL-TIME LISTENER FOR INCOMING REQUESTS
// ==========================================
function listenForRequests() {
    const signalsBox = document.getElementById('incomingRequests');
    
    // Look for documents in 'requests' where "to" equals MY User ID
    const q = query(collection(db, "requests"), where("to", "==", currentUser.uid));
    
    // onSnapshot listens LIVE. If Lavanya clicks send, it pops up instantly on your screen without refreshing.
    onSnapshot(q, (snapshot) => {
        signalsBox.innerHTML = ""; // Clear the box
        
        if (snapshot.empty) {
            signalsBox.innerHTML = "<p class='loading-text'>No incoming handshakes.</p>";
            return;
        }

        snapshot.forEach((docSnap) => {
            let reqData = docSnap.data();
            let reqId = docSnap.id;

            signalsBox.innerHTML += `
                <div class="request-card">
                    <div class="user-info">
                        <p class="name">${reqData.fromUsername}</p>
                        <p class="role">Wants to connect</p>
                    </div>
                    <div>
                        <button class="accept-btn" onclick="acceptRequest('${reqId}', '${reqData.from}')">Accept</button>
                        <button class="decline-btn" onclick="declineRequest('${reqId}')">X</button>
                    </div>
                </div>
            `;
        });
    });
}

// ==========================================
// 5. THE ACTIVE FUNCTIONS (Attached to Window for HTML onclicks)
// ==========================================

window.sendBridgeRequest = async function(targetUid, targetUsername) {
    try {
        // Create a request document
        await setDoc(doc(collection(db, "requests")), {
            from: currentUser.uid,
            fromUsername: currentUsername,
            to: targetUid,
            status: "pending",
            timestamp: new Date().toISOString()
        });
        alert(`Request broadcasted to ${targetUsername}!`);
        // Refresh directory to prevent sending multiple times
        fetchAllUsers(); 
    } catch (error) {
        alert("Failed to send request: " + error.message);
    }
}

window.acceptRequest = async function(requestId, senderUid) {
    try {
        // 1. Create the permanent Bridge Document
        const bridgeId = "bridge_" + Date.now(); // Unique ID for the relationship
        await setDoc(doc(db, "bridges", bridgeId), {
            members: [currentUser.uid, senderUid],
            establishedAt: new Date().toISOString()
        });

        // 2. Update MY profile to lock me to them
        await updateDoc(doc(db, "users", currentUser.uid), {
            partnerUid: senderUid,
            bridgeId: bridgeId
        });

        // 3. Update THEIR profile to lock them to me
        await updateDoc(doc(db, "users", senderUid), {
            partnerUid: currentUser.uid,
            bridgeId: bridgeId
        });

        // 4. Delete the request now that it's accepted
        await deleteDoc(doc(db, "requests", requestId));

        alert("Handshake Complete! Welcome to the Inner Sanctum.");
        window.location.href = 'd/dashboard.html';

    } catch (error) {
        alert("Error accepting connection: " + error.message);
    }
}

window.declineRequest = async function(requestId) {
    // Simply delete the request document
    await deleteDoc(doc(db, "requests", requestId));
}

window.executeLogout = function() {
    signOut(auth).then(() => {
        localStorage.removeItem("activeBridgeUser");
        window.location.href = './index.html';
    });
}