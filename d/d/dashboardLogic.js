import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initInteractionListener } from './interxn.js';
import { getFirestore, doc, getDoc, updateDoc, onSnapshot as firestoreSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, get, push, onDisconnect, serverTimestamp as rtdbTime, update, remove, onChildAdded} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
const firebaseConfig = {
    apiKey: "AIzaSyDEbvPzoahjdt0w5s2SF7Usn3ZnOxF2v38",
    authDomain: "ever-us.firebaseapp.com",
    databaseURL: "https://ever-us-default-rtdb.firebaseio.com", 
    projectId: "ever-us", storageBucket: "ever-us.firebasestorage.app",
    messagingSenderId: "925623567345",
    appId: "1:925623567345:web:10c9d1e5873a4df7983a50",
    measurementId: "G-6E4K45TWLV"};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);const db = getFirestore(app);
const rtdb = getDatabase(app); 
export const storage = getStorage(app);
Quill.register('modules/cursors', QuillCursors);
window.storage = storage;
window.sRef = sRef;
window.uploadBytesResumable = uploadBytesResumable;
window.getDownloadURL = getDownloadURL;
let currentUser = null; 
let currentUsername = ""; 
let currentBridgeId = null; 
let partnerUid = null; 
let partnerUsername = "Loading...";
let partnerIsOnline = false; 
let partnerLastActive = null;
let myLocation = { city: "Locating...", temp: "--", lat: 0, lon: 0 }; 
let partnerLocation = { city: "Tracking...", temp: "--", lat: 0, lon: 0 };
let timelineEvents = [];
import { setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
setPersistence(auth, browserLocalPersistence)
    .then(() => {initAuthListener();})
    .catch((error) => {console.error("Persistence Error:", error);});
function initAuthListener() {onAuthStateChanged(auth, async (user) => {
        if (user) {currentUser = user;
            try {const userRef = doc(db, "users", user.uid);
                const myDoc = await getDoc(userRef);
                if (myDoc.exists()) {const userData = myDoc.data();
                    currentUsername = userData.username;
                    currentBridgeId = userData.bridgeId;
                    partnerUid = userData.partnerUid;
                    if (!currentBridgeId || !partnerUid) {
                        window.location.href = 'nexus.html';
                        return;
                    }
                    const partnerDoc = await getDoc(doc(db, "users", partnerUid));
                    if (partnerDoc.exists()) {
                        partnerUsername = partnerDoc.data().username;}
                    activateGlobalUpdateListener();
                    initGlobalReceiptEngine();
                    window.initCallEngine();
                   
                    activatePresenceEngine();
                    activateLiveCanvas();
                    activateTelemetry();
                    activateTimeline();
                    activateFigmaMouseEngine();
                    initInteractionListener(rtdb, currentBridgeId, currentUsername);

                    // Reveal the UI with a clean transition
                    const loadingScreen = document.getElementById('loadingCore');
                    const appShell = document.getElementById('appShell');
                    
                    if (loadingScreen) loadingScreen.style.display = 'none';
                    if (appShell) appShell.style.display = 'flex';
                    
                    window.loadView('overview');
                } else {
                    // Handle case where user is authenticated but no Firestore doc exists
                    console.warn("No user profile found in Firestore.");
                    window.location.href = 'nexus.html';
                }
            } catch (error) {
                console.error("Init Error:", error);
                // Keep the user on the page but show error, or redirect if fatal
                alert("Error connecting to bridge. Please check your connection.");
            }
        } else {
            window.location.href = 'index.html';
        }
    });
}
function setOnlineStatus(isOnline) {
    if (!currentUser) return;
    const myRef = ref(rtdb, `presence/${currentUser.uid}`);
    
    if (isOnline) { 
        set(myRef, { isOnline: true, lastActive: rtdbTime() }); 
        onDisconnect(myRef).set({ isOnline: false, lastActive: rtdbTime() }); 
    } else { 
        set(myRef, { isOnline: false, lastActive: rtdbTime() }); 
    }
}

function activatePresenceEngine() {
    onValue(ref(rtdb, '.info/connected'), (snap) => { 
        if (snap.val() === true) setOnlineStatus(true); 
    });
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') setOnlineStatus(true);
        else setOnlineStatus(false);
    });
    
    window.addEventListener("beforeunload", () => setOnlineStatus(false));
    
    onValue(ref(rtdb, `presence/${partnerUid}`), (snap) => {
        if (snap.exists()) {
            partnerIsOnline = snap.val().isOnline; 
            partnerLastActive = snap.val().lastActive; 
            
            let statusText = document.getElementById('partnerStatusText'); 
            let dot = document.querySelector('.pulse-dot');
            
            if (statusText && dot) {
                if (partnerIsOnline) { 
                    statusText.innerText = "Online"; 
                    dot.style.background = '#32d74b'; 
                    dot.style.boxShadow = '0 0 10px #32d74b'; 
                    dot.style.animation = 'pulse 2s infinite'; 
                } else { 
                    let timeStr = partnerLastActive ? "Last seen " + calculateTimeAgo(new Date(partnerLastActive)) : "Offline";
                    statusText.innerText = timeStr; 
                    dot.style.background = '#8e8e93'; 
                    dot.style.boxShadow = 'none'; 
                    dot.style.animation = 'none'; 
                }
            }
        }
    });
}

function calculateTimeAgo(date) {
    const secs = Math.floor((new Date() - date) / 1000); 
    if (secs < 30) return "just now";
    let interval = secs / 86400; if (interval > 1) return Math.floor(interval) + "d ago"; 
    interval = secs / 3600; if (interval > 1) return Math.floor(interval) + "h ago"; 
    interval = secs / 60; if (interval > 1) return Math.floor(interval) + "m ago"; 
    return "just now";
}

// ==========================================
// 5. ACTIVITY TIMELINE ENGINE
// ==========================================
window.logActivity = function(actionText) {
    push(ref(rtdb, `bridges/${currentBridgeId}/timeline`), {
        user: currentUsername, 
        action: actionText, 
        timestamp: rtdbTime()
    });
}

function activateTimeline() {
    onValue(ref(rtdb, `bridges/${currentBridgeId}/timeline`), (snap) => {
        timelineEvents = [];
        snap.forEach((child) => { timelineEvents.push(child.val()); });
        if(timelineEvents.length > 50) timelineEvents = timelineEvents.slice(timelineEvents.length - 50);
        paintTimeline();
    });
}

function paintTimeline() {
    let box = document.getElementById('timelineFeed');
    if (!box) return;
    box.innerHTML = "";
    
    if (timelineEvents.length === 0) {
        box.innerHTML = "<p style='color: var(--text-faded); font-size: 12px;'>No activity yet.</p>";
        return;
    }

    [...timelineEvents].reverse().forEach(ev => {
        let isPartner = ev.user !== currentUsername;
        let cClass = isPartner ? "timeline-event partner" : "timeline-event";
        let timeStr = new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        box.innerHTML += `
            <div class="${cClass}">
                <div><b>${ev.user}</b> ${ev.action}</div>
                <div class="timeline-time">${timeStr}</div>
            </div>
        `;
    });
}

// ==========================================
// 6. QUILL CANVAS & TEXT CURSORS
// ==========================================
let sharedEditor = null;
let isProgrammaticUpdate = false; 
let cursorModule = null;

let typingIndicatorTimer; // Restored the timer variable
function activateLiveCanvas() {
    const canvasRef = ref(rtdb, `bridges/${currentBridgeId}/canvasData`);

    // 1. PRIMARY CONTENT & UNREAD LISTENER
    onValue(canvasRef, (snap) => {
        if (snap.exists()) {
            let data = snap.val();
            let remoteContent = data.content; 
            let lastEditor = data.lastEditor || "System";
            let lastEditTime = data.lastEditTime || 0;
            let activeTypist = data.typing || "";

            // --- A. UNREAD UPDATES LOGIC ---
            const lastRead = localStorage.getItem(`lastRead_${currentBridgeId}`) || 0;
            const unreadBadge = document.getElementById('unreadBadge');
            const statusEl = document.getElementById('notepadStatus');

            // If partner edited while you were away/offline
            if (lastEditor !== currentUsername && lastEditTime > lastRead) {
                if (unreadBadge) unreadBadge.classList.add('active');
                if (statusEl) {
                    statusEl.innerHTML = `<span class="update-text-highlight">✨ New from ${lastEditor}</span>`;
                }
            } else {
                // Normal Synced State
                if (statusEl) statusEl.innerText = `☁️ Synced • Last edit by ${lastEditor}`;
            }

            // --- B. TYPING INDICATOR LOGIC ---
            let typingEl = document.getElementById('typingIndicator');
            if (typingEl) {
                if (activeTypist !== "" && activeTypist !== currentUsername) {
                    typingEl.innerText = `${activeTypist} is typing...`;
                    typingEl.classList.add('active');
                } else {
                    typingEl.classList.remove('active');
                }
            }

            // --- C. REMOTE CONTENT INJECTION ---
            // We only inject if the update came from the partner to prevent local "echo" lag
            if (sharedEditor && lastEditor !== currentUsername && remoteContent) {
                isProgrammaticUpdate = true;
                // Using 'silent' so Quill doesn't think the USER typed this and trigger a re-save
                sharedEditor.setContents(remoteContent, 'silent'); 
                isProgrammaticUpdate = false;
            }
        }
    });

    // 2. TEXT CURSOR (BLUE FLAG) LISTENER
    // This tracks specifically where their blinking cursor is inside the text
    onValue(ref(rtdb, `bridges/${currentBridgeId}/textCursors/${partnerUid}`), (snap) => {
        if (snap.exists() && cursorModule) {
            let range = snap.val();
            
            // Move the partner's flag on your screen
            cursorModule.moveCursor(partnerUid, range);
            cursorModule.toggleFlag(partnerUid, true);
            clearTimeout(window.textCursorFlagTimer);
            window.textCursorFlagTimer = setTimeout(() => {
                if (cursorModule) cursorModule.toggleFlag(partnerUid, false);}, 2000);
} else if (cursorModule) {
            cursorModule.removeCursor(partnerUid);}});
}

window.initQuillEditor = function() {
    sharedEditor = new Quill('#editorCore', {
        theme: 'snow',
        placeholder: `A shared workspace notepad... Type anything you want and make it visible automatically`,
        modules: {
            cursors: true, 
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'color': [] }, { 'background': [] }],
                ['link', 'image']
            ]
        }
    });

    cursorModule = sharedEditor.getModule('cursors');
    cursorModule.createCursor(partnerUid, partnerUsername, '#0a84ff');

    get(ref(rtdb, `bridges/${currentBridgeId}/canvasData`)).then((snap) => {
        if (snap.exists() && snap.val().content) {
            isProgrammaticUpdate = true; 
            sharedEditor.setContents(snap.val().content, 'silent'); 
            isProgrammaticUpdate = false;}});
    sharedEditor.on('selection-change', function(range, oldRange, source) {
        if (source === 'user' && range) {
            set(ref(rtdb, `bridges/${currentBridgeId}/textCursors/${currentUser.uid}`), range);}});
    // BROADCAST MY TEXT EDITS (Sync & Versioning)
    // ==========================================
    sharedEditor.on('text-change', function(delta, oldDelta, source) {
        if (source === 'user' && !isProgrammaticUpdate) {
            
            // 1. UI Update: Set local status to "Saving"
            const statusEl = document.getElementById('notepadStatus');
            if (statusEl) statusEl.innerText = "Saving...";
            set(ref(rtdb, `bridges/${currentBridgeId}/canvasData/typing`), currentUsername);
            clearTimeout(typingIndicatorTimer);
            typingIndicatorTimer = setTimeout(() => {
                set(ref(rtdb, `bridges/${currentBridgeId}/canvasData/typing`), "");
            }, 1500);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                const fullContent = sharedEditor.getContents(); 
                const timestamp = rtdbTime(); 
                set(ref(rtdb, `bridges/${currentBridgeId}/canvasData`), {
                    content: fullContent, 
                    lastEditor: currentUsername, 
                    lastEditTime: timestamp, 
                    typing: ""
                });
                localStorage.setItem(`lastRead_${currentBridgeId}`, Date.now());
                
                // Log to the Activity Timeline
                logActivity("edited the canvas.");
                
                // Save a permanent version snapshot for the History Time-Machine
                saveVersionSnapshot(fullContent); 

            }, 1000);  }});
    logActivity("opened the SyncSpace.");
}

// ==========================================
// 7. RESTRICTED FIGMA MOUSE ENGINE
// ==========================================
let mouseThrottleTimer = 0;

function activateFigmaMouseEngine() {
    // 1. Listen for Partner's Mouse Movements
    onValue(ref(rtdb, `bridges/${currentBridgeId}/mousePointers/${partnerUid}`), (snap) => {
        let pointerEl = document.getElementById('partnerMousePointer');
        let editorDiv = document.querySelector('.notion-page');
        
        // Only render the cursor if we are actually looking at the Journal view
        if (!editorDiv) return;

        if (snap.exists()) {
            let data = snap.val();
            
            // Create the cursor if it doesn't exist
            if (!pointerEl) {
                pointerEl = document.createElement('div');
                pointerEl.id = 'partnerMousePointer';
                pointerEl.className = 'mouse-pointer';
                
                // Override CSS to ensure it positions absolutely within the canvas
                pointerEl.style.position = 'absolute';
                pointerEl.style.top = '0';
                pointerEl.style.left = '0';
                
                pointerEl.innerHTML = `
                    <svg viewBox="0 0 16 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1.38316 1.48911C1.04944 0.988457 1.45524 0.315904 2.05285 0.380755L14.7761 1.76184C15.3526 1.82442 15.5401 2.55938 15.0886 2.98687L11.5303 6.35565C11.3323 6.54316 11.2339 6.81432 11.2678 7.085L12.5645 17.4361C12.6366 18.0121 12.0163 18.4206 11.4965 18.1408L5.34149 14.8276C5.10189 14.6986 4.81524 14.7171 4.59103 14.8761L0.640954 17.6756C0.180016 18.0023 -0.428789 17.5857 -0.347573 17.0097L1.38316 1.48911Z" fill="#0a84ff" stroke="white" stroke-width="1.5"/>
                    </svg>
                    <div class="mouse-name-tag">${partnerUsername}</div>
                `;
                // Append directly to the editor canvas container
                editorDiv.appendChild(pointerEl);
            }

            // Show pointer and map percentages to actual pixel size of the container
            pointerEl.style.display = 'flex';
            let absoluteX = data.x * editorDiv.clientWidth;
            let absoluteY = data.y * editorDiv.clientHeight;
            
            pointerEl.style.transform = `translate(${absoluteX}px, ${absoluteY}px)`;
        } else {
            // If data is null (partner mouse left the canvas), hide the pointer
            if (pointerEl) pointerEl.style.display = 'none';
        }
    });

    // 2. Broadcast My Mouse Movements
    document.addEventListener('mousemove', (e) => {
        let editorDiv = document.querySelector('.notion-page');
        
        // Only run logic if we are inside the SyncSpace Tab
        if (editorDiv) {
            let now = Date.now();
            
            if (now - mouseThrottleTimer > 50) {
                mouseThrottleTimer = now;
                
                // Get the physical screen boundaries of the canvas
                const rect = editorDiv.getBoundingClientRect();
                
                // Check if my mouse is physically inside the canvas box
                if (e.clientX >= rect.left && e.clientX <= rect.right && 
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    
                    // Calculate percentage relative to the canvas, not the whole window
                    let xPercent = (e.clientX - rect.left) / rect.width;
                    let yPercent = (e.clientY - rect.top) / rect.height;
                    
                    set(ref(rtdb, `bridges/${currentBridgeId}/mousePointers/${currentUser.uid}`), { 
                        x: xPercent, 
                        y: yPercent 
                    });
                } else {
                    // I moved my mouse outside the canvas, delete my pointer from Firebase
                    set(ref(rtdb, `bridges/${currentBridgeId}/mousePointers/${currentUser.uid}`), null);
                }
            }
        }
    });
}

// ==========================================
// 8. TELEMETRY ENGINE (Location)
// ==========================================
function activateTelemetry() {
    const fetchWeather = async (lat, lon) => {
        try {
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const geoData = await geoRes.json();
            const city = geoData.city || geoData.locality || "Unknown Node";
            
            const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const weatherData = await weatherRes.json();
            
            myLocation = { city: city, temp: weatherData.current_weather.temperature, lat: lat, lon: lon };
            await updateDoc(doc(db, "users", currentUser.uid), { telemetry: myLocation });
            
            let activeTab = document.querySelector('.nav-item.active');
            if (activeTab && activeTab.innerText.includes("Overview")) {
                window.loadView('overview');
            }
        } catch (e) {
            console.error("Telemetry fetch error:", e);
        }
    };
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude), 
            (err) => console.warn("Location denied."), 
            { timeout: 8000 }
        );
    }
    
    firestoreSnapshot(doc(db, "users", partnerUid), (snap) => {
        if (snap.exists() && snap.data().telemetry) { 
            partnerLocation = snap.data().telemetry; 
            let activeTab = document.querySelector('.nav-item.active');
            if (activeTab && activeTab.innerText.includes("Overview")) {
                window.loadView('overview');
            }
        }
    });
}

// ==========================================
// 9. UI ROUTER (Dynamic HTML Injection)
// ==========================================
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
}

window.loadView = function(viewName) {
    const box = document.getElementById('mainAppContent');
    
    document.querySelectorAll('.nav-item').forEach(btn => { 
        btn.classList.remove('active'); 
        if(btn.getAttribute('onclick').includes(viewName)) btn.classList.add('active'); 
    });

    if (viewName !== 'journal') { 
        sharedEditor = null; 
        cursorModule = null; 
        if(currentUser) {
            set(ref(rtdb, `bridges/${currentBridgeId}/textCursors/${currentUser.uid}`), null);
            set(ref(rtdb, `bridges/${currentBridgeId}/mousePointers/${currentUser.uid}`), null);
        }
    } 
if (viewName === 'overview') {
        let distanceStr = "Calculating..."; 
        if (myLocation.lat !== 0 && partnerLocation.lat !== 0) {
            distanceStr = calculateDistance(myLocation.lat, myLocation.lon, partnerLocation.lat, partnerLocation.lon) + " km";
        }

        box.innerHTML = `
            <style>
                /* Desktop Position */
                .pulse-hub {
                    position: absolute;
                    top: 0px; 
                    right: 130px; /* Sits exactly left of + Note */
                    display: flex;
                    gap: 10px;
                    z-index: 9999; /* ⚡ CRITICAL FIX: Forces buttons above all invisible overlapping elements so they are clickable */
                }
                
                /* Mobile Position */
                @media (max-width: 650px) {
                    .pulse-hub {
                        top: 110px; /* ⚡ Pushes it completely below "View Notes" */
                        right: 20px; /* Aligns to the right edge */
                    }
                    .view-title {
                        padding-right: 0 !important;
                        margin-bottom: 50px; 
                    }
                }

                /* Visual Effects */
                .pulse-overlay {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    pointer-events: none; z-index: 99999;
                }
                .pulse-overlay.tap {
                    background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
                    animation: tapAnim 1s ease-out forwards;
                }
                .pulse-overlay.hug {
                    background: rgba(255, 42, 95, 0.15);
                    box-shadow: inset 0 0 150px rgba(255, 42, 95, 0.4);
                    animation: hugAnim 3.5s ease-in-out forwards;
                }
                @keyframes tapAnim { 0% { transform: scale(0.5); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
                @keyframes hugAnim { 0% { opacity: 0; } 25% { opacity: 1; } 50% { opacity: 0.5; } 75% { opacity: 1; } 100% { opacity: 0; } }
            </style>

            <div style="position: relative; width: 100%; min-height: 100%; display: flex; flex-direction: column;">
                
                <div class="pulse-hub">
<button data-tip="Send a Tap" class="pro-btn" style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0; display: flex; justify-content: center; align-items: center; cursor: pointer;" onclick="window.triggerPulse('tap')">
    <span style="font-size: 18px;">👋</span>
</button>

<button data-tip="Send a Hug" class="pro-btn" style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,42,95,0.1); border: 1px solid rgba(255,42,95,0.2); padding: 0; display: flex; justify-content: center; align-items: center; cursor: pointer;" onclick="window.triggerPulse('hug')">
    <span style="font-size: 18px;">👻</span>
</button>
                </div>

                <div class="note-system-anchor">
                    <button id="noteTrigger" class="note-trigger-btn" onclick="togglePulseTyper()">+ Note</button>
                    <button id="mobileNoteToggle" class="mobile-note-toggle-btn" onclick="toggleMobileNotes()">👀 View Notes</button>
                    
                    <div id="pulseTyper" class="bubbly-typer">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 11px; color: #0a84ff; font-weight: 700;">NEW NOTE</span>
                            <span style="font-size: 10px; color: var(--text-faded);">24H Auto-Delete</span>
                        </div>
                        <textarea id="pulseNoteInput" class="premium-textarea" placeholder="What's on your mind?..."></textarea>
                        <div class="typer-controls">
                            <button class="typer-btn btn-primary" data-tip="Save Note for ur love"  onclick="savePulseNote()">Save Note</button>
                            <button class="typer-btn btn-secondary" data-tip="Close" style="width: 44px;" onclick="togglePulseTyper()">✕</button>
                        </div>
                    </div>
                    <div id="activeNoteDisplay"></div>
                </div>

                <h1 class="view-title" style="text-transform: none; padding-right: 120px;">${getGreeting()}, <span style="text-transform: capitalize;">${currentUsername}</span></h1>
                <p class="view-subtitle">Live telemetry synchronization.</p>
                    
                <div class="widget-grid" style="margin-top: 30px;">
                    <div class="glass-widget">
                        <p class="widget-label">DISTANCE</p>
                        <h2 class="widget-value">${distanceStr}</h2>
                        <p style="font-size: 12px; color: #32d74b; margin-top: 5px; font-weight: 600;">Bridge Active</p>
                    </div>
                    
                    <div class="glass-widget clickable-widget" onclick="openMap(${myLocation.lat}, ${myLocation.lon}, 'My Node: ${myLocation.city}')">
                        <p class="widget-label" style="text-transform: uppercase;">${myLocation.city}</p>
                        <h2 class="widget-value">${myLocation.temp}°C</h2>
                    </div>
                    
                    <div class="glass-widget clickable-widget" style="border-color: rgba(10, 132, 255, 0.3);" onclick="openMap(${partnerLocation.lat}, ${partnerLocation.lon}, '${partnerUsername} is in ${partnerLocation.city}')">
                        <p class="widget-label" style="color: #0a84ff; text-transform: uppercase;">${partnerUsername}: ${partnerLocation.city}</p>
                        <h2 class="widget-value">${partnerLocation.temp}°C</h2>
                    </div>

                    <div class="milestone-widget">
                        <div class="journey-header">
                            <div>
                                <p style="font-size: 11px; color: #ff2a5f; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">The Journey</p>
                                <div style="display: flex; align-items: baseline; gap: 8px;">
                                    <h2 id="daysTogetherCounter" class="mega-number">0</h2>
                                    <span style="font-size: 14px; color: var(--text-faded); font-weight: 500;">Days</span>
                                </div>
                            </div>
                        </div>
                        <div id="eventsCarousel" class="events-carousel"></div>
                    </div>
                </div>

                <div id="milestoneModal" class="modal-overlay">
                    <div class="premium-modal">
                        <h3 style="margin-top:0; margin-bottom: 20px; color: white;">Add Milestone</h3>
                        <div style="display: flex; gap: 15px;">
                            <div class="input-group" style="width: 75px;">
                                <label>Emoji</label>
                                <input type="text" id="msIcon" class="premium-input" placeholder="❤️" maxlength="2" style="text-align: center; font-size: 20px; padding: 8px;">
                            </div>
                            <div class="input-group" style="flex: 1;">
                                <label>Event Title</label>
                                <input type="text" id="msTitle" class="premium-input" placeholder="e.g. First Date">
                            </div>
                        </div>
                        <div class="input-group">
                            <label>Date</label>
                            <input type="date" id="msDate" class="premium-input">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 25px;">
                            <button class="typer-btn btn-primary" onclick="saveMilestone()">Save to Timeline</button>
                            <button class="typer-btn btn-secondary" style="width: 70px;" onclick="closeMilestoneModal()">❌</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        syncPulseNoteUI();
        initMilestonesEngine(); 
        if(typeof window.initInteractionListener === 'function') window.initInteractionListener();
    }
    else if (viewName === 'cinema') {
        box.innerHTML = `
            <style>
                /* ==========================================
                   💎 TWINVISION: FLAWLESS SPATIAL LAYOUT
                   ========================================== */
                :root {
                    --cinema-bg: #030305;
                    --glass-surface: rgba(22, 22, 28, 0.65);
                    --glass-border: 1px solid rgba(255, 255, 255, 0.08);
                    --apple-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
                }

                .cinema-wrapper {
                    display: flex; flex-direction: column; height: 100%; width: 100%;
                    padding: 0; box-sizing: border-box; position: relative;
                    background: var(--cinema-bg);
                    background-image: radial-gradient(circle at 50% 0%, rgba(255, 42, 95, 0.05), transparent 60%);
                    font-family: 'Poppins', -apple-system, sans-serif; 
                    overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
                }
                
                .cinema-header-pro {
                    display: flex; justify-content: space-between; align-items: center;
                    margin: 20px 20px 0 20px; z-index: 50; position: sticky; top: 20px;
                    background: rgba(18, 18, 24, 0.6);
                    backdrop-filter: blur(40px) saturate(200%); -webkit-backdrop-filter: blur(40px) saturate(200%);
                    padding: 16px 24px; border-radius: 24px; border: var(--glass-border);
                    box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 20px 40px -15px rgba(0,0,0,0.8);
                }
                
                .header-text h2 { margin: 0; color: #FFF; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
                .header-text p { margin: 2px 0 0 0; color: rgba(255,255,255,0.5); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;}
                
                .cinema-search-bar {
                    display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.4);
                    padding: 8px 12px 8px 18px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.04); 
                    flex: 1; max-width: 380px; transition: all 0.3s ease;
                }
                .cinema-search-bar:focus-within {
                    background: rgba(0,0,0,0.6); border-color: rgba(255, 42, 95, 0.5); box-shadow: 0 0 20px rgba(255,42,95,0.15);
                }
                .cinema-input {
                    background: transparent; border: none; color: white; width: 100%;
                    font-family: inherit; font-size: 14px; outline: none; font-weight: 500;
                }
                
                /* ⚡ CRITICAL FIX: THE STICKY CATEGORY SHELF */
                .cinema-categories-container {
                    position: sticky; top: 85px; z-index: 45; /* Sits right below the header */
                    background: linear-gradient(to bottom, var(--cinema-bg) 60%, transparent 100%);
                    padding: 15px 20px 20px 20px; margin-top: 5px;
                }
                
                .cinema-categories {
                    display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
                }
                .cinema-categories::-webkit-scrollbar { display: none; }
                
                .cat-pill {
                    background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); 
                    border: var(--glass-border); padding: 10px 20px; border-radius: 24px; 
                    font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; 
                    transition: all 0.2s ease; scroll-snap-align: start; backdrop-filter: blur(10px);
                }
                .cat-pill:hover { background: rgba(255,255,255,0.08); color: white; }
                .cat-pill.active { background: white; color: black; font-weight: 600; box-shadow: 0 10px 20px rgba(255,255,255,0.15); }
                .cat-pill.shorts { background: linear-gradient(135deg, #ff0050, #00f2fe); color: white; border: none; font-weight: 600; }
                
                /* 🎬 RESPONSIVE GRID (Slides UNDER the categories) */
                .cinema-results-grid {
                    display: none; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 20px; width: 100%; max-width: 1400px; margin: 0 auto; padding: 0 20px 100px 20px;
                    animation: popIn3D 0.5s var(--apple-ease) forwards; z-index: 10; position: relative;
                }
                .yt-card {
                    background: rgba(20, 20, 26, 0.4); border: var(--glass-border); border-radius: 20px; 
                    overflow: hidden; cursor: pointer; transition: all 0.3s var(--apple-ease); 
                    display: flex; flex-direction: column; position: relative;
                }
                .yt-card:hover {
                    transform: translateY(-6px) scale(1.01); background: rgba(30, 30, 38, 0.8);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1);
                }
                .yt-thumb-wrapper { position: relative; overflow: hidden; border-radius: 20px 20px 0 0; }
                .yt-thumb { width: 100%; aspect-ratio: 16/9; object-fit: cover; transition: transform 0.5s var(--apple-ease); }
                .yt-card:hover .yt-thumb { transform: scale(1.03); }
                .yt-thumb.is-short { aspect-ratio: 9/16; max-height: 400px; border-radius: 20px; }
                .yt-info { padding: 14px; display: flex; flex-direction: column; gap: 4px; }
                .yt-title { color: rgba(255,255,255,0.95); font-size: 14px; font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .yt-channel { color: rgba(255,255,255,0.4); font-size: 12px; font-weight: 500; }

                /* 🍿 THEATER STAGE */
                .cinema-stage {
                    flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;
                    position: relative; width: 100%; max-width: 1000px; margin: 0 auto; padding: 0 20px;
                    animation: fadeScaleIn 0.5s var(--apple-ease) forwards; z-index: 20;
                }
                .ambient-glow {
                    position: absolute; top: 15%; left: 5%; right: 5%; bottom: 15%;
                    background: radial-gradient(ellipse at center, rgba(255,42,95,0.35) 0%, rgba(10,132,255,0.2) 50%, transparent 80%);
                    filter: blur(80px); opacity: 0; z-index: 0; pointer-events: none; transition: opacity 1.5s ease;
                }
                .ambient-glow.active { opacity: 1; animation: breatheGlow 4s infinite alternate ease-in-out; }
                @keyframes breatheGlow { 0% { filter: blur(80px); opacity: 0.8; } 100% { filter: blur(100px); opacity: 1; } }
                
                .video-container {
                    width: 100%; max-height: 75vh; aspect-ratio: 16 / 9; 
                    background: #000; border-radius: 24px; overflow: hidden; 
                    box-shadow: 0 40px 80px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.1);
                    z-index: 1; position: relative; display: flex;
                }
                .video-container.is-short { width: auto; height: 80vh; aspect-ratio: 9 / 16; border-radius: 28px; }
                #ytCinemaPlayer, .video-container iframe { width: 100% !important; height: 100% !important; border: none !important; display: block; }
                
                .cinema-controls-island {
                    display: flex; justify-content: center; align-items: center; gap: 15px;
                    margin-top: 25px; z-index: 10; background: rgba(20, 20, 25, 0.85); 
                    padding: 10px 20px; border-radius: 40px; border: var(--glass-border);
                    backdrop-filter: blur(40px) saturate(200%); -webkit-backdrop-filter: blur(40px) saturate(200%);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1);
                }

                @media (max-width: 768px) {
                    .cinema-header-pro { margin: 10px; flex-direction: column; align-items: stretch; border-radius: 20px; padding: 15px; gap: 12px; }
                    .cinema-search-bar { max-width: 100%; }
                    .cinema-categories-container { top: 145px; } /* Adjust for taller mobile header */
                    .cinema-results-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; padding: 0 10px 100px 10px; }
                    .yt-title { font-size: 13px; -webkit-line-clamp: 3; }
                    .video-container { border-radius: 16px; }
                    .video-container.is-short { width: 100%; height: auto; }
                    .cinema-controls-island { flex-wrap: wrap; margin-top: 15px; border-radius: 24px; }
                }
                @keyframes fadeScaleIn { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
            </style>
            
            <div class="cinema-wrapper">
                <div class="cinema-header-pro">
                    <div class="header-text">
                        <h2>TwinVision</h2>
                        <p>Solo & Sync Theater</p>
                    </div>
                    <div class="cinema-search-bar">
                        <span style="font-size: 16px; opacity: 0.6;">🔍</span>
                        <input type="text" id="cinemaSearchInput" class="cinema-input" placeholder="Search or paste link..." onkeydown="if(event.key === 'Enter') window.searchYouTubeAPI()">
                        <button class="icon-btn-pro" style="background: rgba(255,255,255,0.1); color: white; width: 28px; height: 28px; border-radius: 8px;" onclick="window.searchYouTubeAPI()">▶</button>
                    </div>
                </div>

                <div class="cinema-categories-container" id="cinemaPillsContainer">
                    <div class="cinema-categories" id="cinemaPills"></div>
                </div>

                <div id="cinemaResultsGrid" class="cinema-results-grid" style="display: grid;">
                    <div style="grid-column: 1 / -1; text-align: center; padding: 100px 20px; color: var(--text-faded);">
                        <span class="pulse-dot" style="width: 15px; height: 15px; background: #ff2a5f; margin: 0 auto 20px auto;"></span>
                        <span style="font-size: 14px; letter-spacing: 0.5px;">Curating your flagship feed...</span>
                    </div>
                </div>

                <div class="cinema-stage" id="cinemaTheaterStage" style="display: none;">
                    <button class="pro-btn" style="align-self: flex-start; margin-bottom: 20px; background: rgba(255,255,255,0.05); border: var(--glass-border); font-size: 12px; padding: 8px 16px; border-radius: 20px; backdrop-filter: blur(10px);" onclick="window.closeTheaterAndBrowse()">
                        <span style="margin-right: 5px;">←</span> Back to Hub
                    </button>
                    
                    <div class="ambient-glow" id="cinemaAmbientGlow"></div>
                    
                    <div class="video-container" id="cinemaVideoFrame">
                        <div id="ytCinemaPlayer"></div> 
                    </div>

                    <div class="cinema-controls-island">
                        <button class="send-core-btn" style="width: 44px; height: 44px; font-size: 18px; box-shadow: 0 4px 10px rgba(255,42,95,0.3);" onclick="window.toggleCinemaPlayback()" id="cinemaPlayPauseBtn">▶️</button>
                        <button class="icon-btn-pro" id="cinemaForceSyncBtn" data-tip="Force Sync" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; width: 38px; height: 38px; border-radius: 50%; display: none;" onclick="window.forceCinemaSync()">🔄</button>
                        <div class="sync-status-badge" id="cinemaSyncStatus" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.08); padding: 6px 14px; border-radius: 20px;">
                            <span class="pulse-dot" style="background: #0a84ff;"></span> <span style="font-size: 12px; font-weight: 600;">Watching Solo</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof window.initCinemaEngine === 'function') setTimeout(() => window.initCinemaEngine(), 100);
        if (typeof window.renderCinemaPills === 'function') setTimeout(() => window.renderCinemaPills(), 150);
    }
    else if (viewName === 'journal') {
        box.innerHTML = `
            <div class="journal-layout" style="position: relative;">
                <div class="canvas-container">
                    <div style="width: 100%; max-width: 800px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <h1 class="view-title" style="margin: 0; font-size: 28px;">SyncSpace</h1>
                                <div class="mobile-status-chip">
                                    <div id="mobileDot" class="status-dot-small"></div>
                                    <span id="mobileStatusText" style="font-size: 11px; color: var(--text-faded);">Offline</span>
                                </div>
                            </div>
                            <div style="display:flex; gap: 12px; align-items:center;">
                                <p id="notepadStatus" style="margin: 0; font-size: 13px; color: var(--text-faded);">☁️ Synced</p>
                                
                                <div style="position: relative; display: inline-block;">
                                    <button id="historyBtn" class="action-btn" style="margin:0; padding: 4px 12px; font-size: 11px; background: rgba(255,255,255,0.1); color:white;" onclick="toggleVersionHistory()">📜 History</button>
                                    <div id="unreadBadge" class="notification-badge"></div>
                                </div>
                                
                                <div id="historyPopup" class="history-popup">
                                    <div class="timeline-header" style="display:flex; justify-content:space-between; align-items:center; padding: 15px;">
                                        <span>Version History</span>
                                        <span onclick="toggleVersionHistory()" style="cursor:pointer; font-size:18px;">×</span>
                                    </div>
                                    <div id="historyFeed" class="history-feed-container"></div>
                                </div>
                            </div>
                        </div>
                        <p id="typingIndicator" class="typing-indicator"></p> 
                    </div>
                    <div class="notion-page" style="position: relative;">
                        <div id="editorCore"></div>
                    </div>
                </div>
                
                <div class="timeline-panel">
                    <div class="timeline-header">Activity Feed</div>
                    <div id="timelineFeed" class="timeline-feed">Loading...</div>
                </div>
            </div>
        `;
        setTimeout(() => { 
            window.initQuillEditor(); 
            paintTimeline(); 
            updatePartnerPresenceUI();
            
            // CLEAR THE BADGE: Mark as read
            localStorage.setItem(`lastRead_${currentBridgeId}`, Date.now());
            
            const sidebarBadge = document.getElementById('sidebarUnreadBadge');
            if (sidebarBadge) sidebarBadge.classList.remove('active');
            
            const unreadBadge = document.getElementById('unreadBadge');
            if (unreadBadge) unreadBadge.classList.remove('active');
        }, 50);
    }
if (viewName === 'messages') {
        // 1. Initialize State
        window.activeMsgId = null;
        window.activeMsgText = "";
        window.activeMsgSender = ""; // Track who we are replying to
        window.activeReplyData = null; // Store reply context

        box.innerHTML = `
            <style>
/* =========================================================
   🪐 THE SYNCHRONIZED FLAGSHIP ENGINE (OVERWHELMING TIER)
   ========================================================= */

:root {
    /* Advanced Spring Physics (iOS inspired) */
    --spring-intense: cubic-bezier(0.24, 1.15, 0.28, 1.05);
    --spring-smooth: cubic-bezier(0.25, 1, 0.5, 1);
    
    /* Dynamic Spatial Glass (VisionOS / iOS 26 inspired) */
    --glass-surface: rgba(18, 18, 24, 0.45);
    --glass-highlight: inset 0 1px 1px rgba(255, 255, 255, 0.15), 
                       inset 0 -1px 1px rgba(0, 0, 0, 0.4);
    --glass-border: 0.5px solid rgba(255, 255, 255, 0.08);
    
    /* Brand Gradients */
    --accent-primary: linear-gradient(135deg, #FF2A5F 0%, #FF6B3D 100%);
    --oled-bg: linear-gradient(-45deg, #050508, #0B030A, #020611, #000000);
}

.chat-wrapper {
    display: flex; 
    flex-direction: column;
    height: 100%; 
    width: 100%;
    position: relative; 
    overflow: hidden;
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--oled-bg);
    background-size: 400% 400%;
    animation: ambientOLED 20s ease-in-out infinite alternate;
    perspective: 1200px; /* Deepened perspective for spatial UI */
    -webkit-font-smoothing: antialiased;
}

@keyframes ambientOLED { 
    0% { background-position: 0% 50%; } 
    50% { background-position: 100% 50%; } 
    100% { background-position: 0% 50%; } 
}

.chat-header-godtier {
    position: absolute; 
    top: 0; left: 0; right: 0;
    padding: 28px 24px 20px 24px; /* One UI reachability spacing */
    background: var(--glass-surface);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-bottom: var(--glass-border);
    box-shadow: 0 15px 35px -10px rgba(0,0,0,0.5);
    display: flex; 
    align-items: center; 
    justify-content: space-between;
    z-index: 100;
    animation: dropIn3D 0.9s var(--spring-intense) forwards;
}

.avatar-godtier {
    width: 48px; 
    height: 48px; 
    border-radius: 18px; /* Smooth squarcle instead of perfect circle */
    background: linear-gradient(135deg, #2A2A30, #16161A);
    display: flex; 
    justify-content: center; 
    align-items: center;
    box-shadow: var(--glass-highlight), 0 8px 16px rgba(0,0,0,0.4);
    position: relative;
}

.avatar-godtier::after {
    content: ''; 
    position: absolute; 
    bottom: -2px; 
    right: -2px;
    width: 14px; 
    height: 14px; 
    background: #32D74B; 
    border-radius: 50%;
    border: 2.5px solid #0D0D11; 
    box-shadow: 0 0 12px rgba(50, 215, 75, 0.8);
    animation: pulseOnline 2.5s var(--spring-smooth) infinite;
}

.chat-title-pro { 
    margin: 0; 
    font-size: 19px; 
    font-weight: 600; 
    color: #F5F5F7; 
    letter-spacing: 0.3px; 
}

.chat-status-typing { 
    margin: 4px 0 0 0; 
    font-size: 12px; 
    color: #FF2A5F; 
    font-weight: 500; 
    display: flex; 
    align-items: center; 
    gap: 4px; 
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.status-dot { 
    width: 5px; 
    height: 5px; 
    background: #FF2A5F; 
    border-radius: 50%; 
    animation: blink 1.4s infinite both; 
}
.status-dot:nth-child(2) { animation-delay: 0.2s; }
.status-dot:nth-child(3) { animation-delay: 0.4s; }

.chat-feed {
    flex: 1; 
    overflow-y: auto;
    
    /* Adjusted padding to sit perfectly inside the new glass pane */
    padding: 100px 20px 140px 20px; 
    
    /* Give it breathing room from the actual screen edges so the radius makes sense */
    margin: 8px 12px; 
    
    /* 💎 Pure Glassmorphism Treatment */
    background: rgba(22, 22, 26, 0.4); 
    backdrop-filter: blur(20px) saturate(120%);
    -webkit-backdrop-filter: blur(20px) saturate(120%);
    
    /* Premium iOS squarcle curvature */
    border-radius: 32px; 
    
    /* Machined edge lighting (sub-pixel borders) */
    border: 0.5px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 
                0 10px 30px rgba(0, 0, 0, 0.3);
    
    display: flex; 
    flex-direction: column; 
    gap: 15px; /* Slightly tightened gap for better grouping */
    scroll-behavior: smooth;
    
    /* Fixed the awkward fade: Now tight, smooth, and intentional */
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%);
}

/* Crucial: Hide the scrollbar so it doesn't break the glass edge illusion */
.chat-feed::-webkit-scrollbar { 
    display: none; 
}

.message-row { 
    display: flex; 
    width: 100%; 
    opacity: 0; 
    transform: translateY(40px) scale(0.92) rotateX(-12deg); 
}
.message-row.sent { justify-content: flex-end; transform-origin: right center; }
.message-row.received { justify-content: flex-start; transform-origin: left center; }
.message-row.animate-in { animation: popIn3D 0.8s var(--spring-intense) forwards; }

.bubble { 
    max-width: 75%; 
    padding: 16px 22px; 
    font-size: 16px; 
    line-height: 1.5; 
    position: relative; 
    cursor: pointer; 
    transition: transform 0.2s var(--spring-smooth), filter 0.2s ease; 
}
.bubble:active { transform: scale(0.96); filter: brightness(0.9); }

.bubble.sent { 
    background: var(--accent-primary); 
    color: #FFF; 
    border-radius: 22px 22px 6px 22px; 
    box-shadow: 0 12px 28px -6px rgba(255, 42, 95, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3); 
    text-shadow: 0 1px 1px rgba(0,0,0,0.1);
}

.bubble.received { 
    background: rgba(35, 35, 42, 0.65); 
    backdrop-filter: blur(20px); 
    -webkit-backdrop-filter: blur(20px);
    border-radius: 22px 22px 22px 6px; 
    color: #E8E8ED; 
    border: var(--glass-border);
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
}

.msg-time { 
    font-size: 11px; 
    opacity: 0.5; 
    margin-top: 8px; 
    display: block; 
    font-weight: 500; 
    letter-spacing: 0.3px;
}
.sent .msg-time { text-align: right; color: rgba(255,255,255,0.8); }

.input-godtier {
    background: rgba(20, 20, 26, 0.75); 
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border-radius: 40px; 
    padding: 10px 10px 10px 15px;
    display: flex; 
    align-items: flex-end; 
    gap: 10px; 
    z-index: 100;
    border: var(--glass-border);
    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6);
    transition: all 0.3s var(--spring-smooth);
}
.input-godtier:focus-within {
    background: rgba(25, 25, 32, 0.85);
    border-color: rgba(255, 42, 95, 0.4);
    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6), 0 0 20px rgba(255, 42, 95, 0.15);
}

.chat-textarea { 
    flex: 1; 
    background: transparent; 
    border: none; 
    color: #F5F5F7; 
    font-family: inherit; 
    font-size: 16px; 
    line-height: 1.4;
    resize: none; 
    outline: none; 
    padding: 12px 0; 
    max-height: 120px;
}
.chat-textarea::placeholder { color: rgba(255,255,255,0.3); }

.send-core-btn { 
    width: 44px; 
    height: 44px; 
    border-radius: 50%; 
    border: none; 
    background: var(--accent-primary); 
    color: white; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    cursor: pointer; 
    box-shadow: 0 8px 16px rgba(255, 42, 95, 0.3);
    transition: all 0.2s var(--spring-smooth);
}
.send-core-btn:hover { transform: scale(1.05); }
.send-core-btn:active { transform: scale(0.92); box-shadow: 0 4px 8px rgba(255, 42, 95, 0.2); }

/* --- ⚡ THE FIXED HAPTIC OVERLAY --- */
.haptic-overlay-pro { 
    position: fixed; 
    top: 0; left: 0; 
    width: 100vw; height: 100vh; 
    background: rgba(0, 0, 0, 0.4); 
    z-index: 999999; 
    display: flex; 
    flex-direction: column; 
    justify-content: center; 
    align-items: center; 
    opacity: 0; 
    pointer-events: none; 
    transition: opacity 0.4s var(--spring-smooth), backdrop-filter 0.4s;
}
.haptic-overlay-pro.active { 
    opacity: 1; 
    pointer-events: auto; 
    backdrop-filter: blur(25px) saturate(150%); 
    -webkit-backdrop-filter: blur(25px) saturate(150%);
}

.menu-3d { 
    width: 300px; 
    background: rgba(28, 28, 34, 0.75); 
    backdrop-filter: blur(50px); 
    -webkit-backdrop-filter: blur(50px);
    border-radius: 24px; 
    overflow: hidden; 
    border: var(--glass-border);
    transform: rotateX(15deg) translateY(60px) scale(0.9);
    opacity: 0; 
    transition: all 0.5s var(--spring-intense);
    box-shadow: 0 40px 80px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1);
}
.haptic-overlay-pro.active .menu-3d { 
    transform: rotateX(0deg) translateY(0) scale(1); 
    opacity: 1; 
}

.haptic-btn-pro { 
    width: 100%; 
    padding: 20px 24px; 
    background: transparent; 
    border: none; 
    border-bottom: var(--glass-border); 
    color: #F5F5F7; 
    font-size: 16px; 
    font-weight: 500;
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    cursor: pointer; 
    font-family: inherit;
    transition: background 0.2s ease;
}
.haptic-btn-pro:last-child { border-bottom: none; }
.haptic-btn-pro:hover { background: rgba(255,255,255,0.05); }
.haptic-btn-pro:active { background: rgba(255,255,255,0.08); }
.haptic-btn-pro.danger { color: #FF453A; }

/* --- KEYFRAMES --- */
@keyframes dropIn3D { 
    0% { transform: translateY(-100%) rotateX(-15deg); opacity: 0; } 
    100% { transform: translateY(0) rotateX(0deg); opacity: 1; } 
}
@keyframes riseUp3D { 
    0% { transform: translateY(60px) scale(0.95); opacity: 0; } 
    100% { transform: translateY(0) scale(1); opacity: 1; } 
}
@keyframes popIn3D { 
    0% { opacity: 0; transform: translateY(30px) scale(0.9) rotateX(-10deg); } 
    100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); } 
}
@keyframes blink { 
    0%, 100% { opacity: 0.3; transform: scale(0.8); } 
    50% { opacity: 1; transform: scale(1.1); } 
}
@keyframes pulseOnline {
    0% { box-shadow: 0 0 0 0 rgba(50, 215, 75, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(50, 215, 75, 0); }
    100% { box-shadow: 0 0 0 0 rgba(50, 215, 75, 0); }
}
            </style>
<div class="chat-wrapper">
                <div class="chat-header-godtier">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="avatar-godtier">👻</div>
                        <div class="header-text-group">
                            <h2 class="chat-title-pro">${partnerUsername}</h2>
                            <p class="chat-status-typing" id="headerTypingStatus" style="display: none;">
                                Typing <span class="status-dot"></span><span class="status-dot"></span><span class="status-dot"></span>
                            </p>
                            <p class="chat-status-typing" id="headerOnlineStatus" style="color: #32d74b;">Connected</p>
                        </div>
                    </div>

<div style="display: flex; gap: 10px;">
        <button class="icon-btn-pro" data-tip="Clear Chat for Me" style="background:transparent; color:#ff3b30;" onclick="window.clearMyChat()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>

        <button class="icon-btn-pro" data-tip="Call History" style="background:transparent; color:white; position: relative;" onclick="window.openCallHistory()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span id="missedCallBadge" style="display:none; position: absolute; top: -5px; right: -5px; background: #ff3b30; color: white; font-size: 10px; font-weight: 800; width: 16px; height: 16px; border-radius: 50%; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(255,59,48,0.5); font-family: 'Poppins', sans-serif;">0</span>
        </button>
        <button class="icon-btn-pro" data-tip="Start Audio Call" style="background:transparent; color:white;" onclick="window.startAudioCall()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        </button>
        <button class="icon-btn-pro" data-tip="Video Call" style="background: rgba(10, 132, 255, 0.15); color: #0a84ff; border: 1px solid rgba(10, 132, 255, 0.3); width: 42px; height: 42px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: all 0.2s ease;" onclick="window.startIGCall()" onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 5px 15px rgba(10, 132, 255, 0.3)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;">
        <polygon points="23 7 16 12 23 17 23 7"></polygon>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>
</button>
    </div>
                </div>

                <div class="chat-feed" id="chatFeed"></div>

                <div id="mediaUploadProgress" style="position: absolute; bottom: 120px; left: 20px; right: 20px; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); border-radius: 10px; padding: 8px 15px; display: none; align-items: center; gap: 10px; z-index: 90; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="flex: 1; height: 4px; background: rgba(255,255,255,0.2); border-radius: 5px; overflow: hidden;">
                        <div id="uploadProgressBar" style="width: 0%; height: 100%; background: #32d74b; transition: width 0.2s;"></div>
                    </div>
                    <span id="uploadProgressText" style="color: white; font-size: 10px; font-weight: 700;">0%</span>
                </div>

                <div id="emojiPickerBay" style="display: none; position: absolute; bottom: 85px; left: 20px; background: rgba(20,20,25,0.95); backdrop-filter: blur(25px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 15px; z-index: 100; box-shadow: 0 15px 30px rgba(0,0,0,0.6); grid-template-columns: repeat(6, 1fr); gap: 8px;">
                    </div>

                <div style="position: absolute; bottom: 24px; left: 20px; right: 20px; z-index: 100; display: flex; flex-direction: column; animation: riseUp3D 0.9s var(--spring-intense) forwards;">
                    <div id="replyPreviewBox" style="display: none; background: rgba(255,255,255,0.05); border-top-left-radius: 20px; border-top-right-radius: 20px; padding: 10px 15px; border-bottom: 1px solid rgba(255,255,255,0.1); align-items: center; justify-content: space-between; backdrop-filter: blur(10px);">
                        <div style="flex: 1; overflow: hidden; border-left: 3px solid #ff2a5f; padding-left: 10px;">
                            <span id="replyPreviewName" style="color: #ff2a5f; font-size: 11px; font-weight: 800; text-transform: uppercase;"></span>
                            <p id="replyPreviewText" style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 2px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></p>
                        </div>
                        <button class="icon-btn-pro" style="width: 25px; height: 25px; background: rgba(255,255,255,0.1);" onclick="window.cancelReply()">✕</button>
                    </div>

                    <div class="input-godtier" style="position: relative; bottom: 0; left: 0; right: 0; animation: none;">
                        <button class="icon-btn-pro" data-tip="Emojis" onclick="window.toggleEmojiBay()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        </button>

                        <button data-tip="Attach Media" class="icon-btn-pro" onclick="document.getElementById('mediaUploader').click()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </button>
                        
                        <textarea id="chatInputMessage" class="chat-textarea" placeholder="iMessage..." rows="1" oninput="window.handleTypingSignal()"></textarea>
                        
                        <button id="voiceRecordBtn" data-tip="Hold to Record" class="icon-btn-pro" style="background: rgba(10, 132, 255, 0.15); color: #0a84ff; transition: all 0.2s ease;" onmousedown="window.startVoiceRecord()" onmouseup="window.stopVoiceRecord()" ontouchstart="window.startVoiceRecord()" ontouchend="window.stopVoiceRecord()">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        </button>

                        <button data-tip="Send Message" class="send-core-btn" onclick="window.sendTextMessage()">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>

                <div id="hapticMenuOverlay" class="haptic-overlay-pro" onclick="window.closeMessageMenu()">
                    <div class="menu-3d" onclick="event.stopPropagation()">
                        <button class="haptic-btn-pro" onclick="window.initiateReply()">Reply to Message</button>
                        <button class="haptic-btn-pro" onclick="window.copySelectedMsg()">Copy Text</button>
                        <div id="authorActions" style="display: none;">
                            <button class="haptic-btn-pro" id="editBtn" onclick="window.editSelectedMsg()">Edit Message</button>
                            <button class="haptic-btn-pro danger" onclick="window.unsendSelectedMsg()">Undo Send</button>
                        </div>
                    </div>
                </div>
                
                <input type="file" id="mediaUploader" accept="image/*,video/*" style="display:none;" onchange="window.handleMediaSelection(event)">
            </div>
        `;

        // --- ⚡ DYNAMIC MENU FUNCTIONS ---
        // Enhanced to capture who sent the message for the reply UI
        window.openMessageMenu = function(msgId, text, isSentByMe, timestamp, senderName) {
            if (navigator.vibrate) navigator.vibrate([20, 40]); 
            window.activeMsgId = msgId;
            window.activeMsgText = text;
            window.activeMsgSender = senderName || (isSentByMe ? 'You' : partnerUsername);
            
            const overlay = document.getElementById('hapticMenuOverlay');
            const authorActions = document.getElementById('authorActions');
            const editBtn = document.getElementById('editBtn');

            if (isSentByMe) {
                authorActions.style.display = 'block';
                const fifteenMins = 900000;
                const isEditable = (Date.now() - timestamp) < fifteenMins;
                editBtn.style.display = isEditable ? 'flex' : 'none';
            } else {
                authorActions.style.display = 'none';
            }
            overlay.classList.add('active');
        };

        window.closeMessageMenu = function() {
            document.getElementById('hapticMenuOverlay').classList.remove('active');
        };

        window.copySelectedMsg = function() {
            navigator.clipboard.writeText(window.activeMsgText);
            window.closeMessageMenu();
        };

        window.editSelectedMsg = function() {
            const input = document.getElementById('chatInputMessage');
            const sendBtn = document.querySelector('.send-core-btn');
            input.value = window.activeMsgText;
            input.focus();
            
            const originalIcon = sendBtn.innerHTML;
            sendBtn.innerHTML = "✅"; 
            const editId = window.activeMsgId;
            
            sendBtn.onclick = async () => {
                const newText = input.value.trim();
                if (newText && newText !== window.activeMsgText) {
                    await update(ref(rtdb, `bridges/${currentBridgeId}/messages/${editId}`), { text: newText, edited: true });
                }
                input.value = "";
                sendBtn.innerHTML = originalIcon;
                sendBtn.onclick = window.sendTextMessage;
            };
            window.closeMessageMenu();
        };

        window.unsendSelectedMsg = async function() {
            await remove(ref(rtdb, `bridges/${currentBridgeId}/messages/${window.activeMsgId}`));
            window.closeMessageMenu();
        };

        // --- 🗑️ CLEAR CHAT LOGIC ---
        window.clearMyChat = async function() {
            if (confirm("Clear all messages? This deletes them on your screen only.")) {
                await set(ref(rtdb, `bridges/${currentBridgeId}/clearedAt/${currentUsername}`), Date.now());
                if (navigator.vibrate) navigator.vibrate([20, 30]);
                // Clear UI immediately without waiting for database reflection
                const chatFeed = document.getElementById('chatFeed');
                if(chatFeed) chatFeed.innerHTML = "";
            }
        };

        // --- 😀 EMOJI BAY LOGIC ---
        window.toggleEmojiBay = function() {
            const bay = document.getElementById('emojiPickerBay');
            if (bay.style.display === 'grid') {
                bay.style.display = 'none';
                return;
            }
            
            if (bay.innerHTML.trim() === '') {
                const emojis = ['😂','❤️','😍','🥺','🔥','✨','👻','💀','👀','🙏','😊','😭','🥰','😘','👍','🙌','😎','🥳','🥹','💯','🤍','🫶','💕','✨'];
                emojis.forEach(emoji => {
                    const btn = document.createElement('button');
                    btn.innerHTML = emoji;
                    btn.style.cssText = "background:transparent; border:none; font-size: 24px; cursor:pointer; padding:5px; transition: transform 0.2s;";
                    btn.onmouseover = () => btn.style.transform = "scale(1.2)";
                    btn.onmouseout = () => btn.style.transform = "scale(1)";
                    btn.onclick = () => {
                        const input = document.getElementById('chatInputMessage');
                        input.value += emoji;
                        bay.style.display = 'none';
                        input.focus();
                    };
                    bay.appendChild(btn);
                });
            }
            bay.style.display = 'grid';
        };

        // --- ↩️ REPLY LOGIC ---
        window.initiateReply = function() {
            window.activeReplyData = {
                id: window.activeMsgId,
                text: window.activeMsgText || "Media Attachment",
                sender: window.activeMsgSender
            };
            
            document.getElementById('replyPreviewName').innerText = `Replying to ${window.activeReplyData.sender}`;
            document.getElementById('replyPreviewText').innerText = window.activeReplyData.text;
            document.getElementById('replyPreviewBox').style.display = 'flex';
            
            // Re-round the top corners of the input bar to connect visually with the reply box
            document.querySelector('.input-godtier').style.borderTopLeftRadius = '0';
            document.querySelector('.input-godtier').style.borderTopRightRadius = '0';
            
            document.getElementById('chatInputMessage').focus();
            window.closeMessageMenu();
        };

        window.cancelReply = function() {
            window.activeReplyData = null;
            document.getElementById('replyPreviewBox').style.display = 'none';
            document.querySelector('.input-godtier').style.borderTopLeftRadius = '40px';
            document.querySelector('.input-godtier').style.borderTopRightRadius = '40px';
        };

        // --- ✉️ ENTER-TO-SEND LISTENER ---
        // Set timeout ensures the DOM has fully painted before we attach the listener
        setTimeout(() => {
            const chatInput = document.getElementById('chatInputMessage');
            if(chatInput) {
                chatInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault(); // Prevents line break
                        window.sendTextMessage(); // Ensure your sendTextMessage in dashboardLogic handles window.activeReplyData!
                    }
                });
            }
        }, 100);

        if (typeof window.initChatEngine === 'function') window.initChatEngine();
    }else if (viewName === 'music') {
        box.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: auto; padding: 20px;">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding: 0 5px; flex-shrink: 0;">
                    <div style="flex: 1;">
                        <h1 class="view-title" data-tip="TwinTunes Engine" style="text-transform: none; margin: 0; font-size: clamp(24px, 5vw, 32px);">TwinTunes</h1>
                        <p class="view-subtitle" style="margin: 2px 0 0 0; opacity: 0.7;">Your synchronized musical universe.</p>
                    </div>
                    
                    <button class="pro-btn" data-tip="View Shared Playlist"
                            style="padding: 10px 16px; border-radius: 20px; font-size: 13px; color: white; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 8px; flex-shrink: 0;" 
                            onclick="window.togglePlaylistContainer(this)">
                        <span style="font-size: 16px;">📁</span> Playlist
                    </button>
                </div>

                <div class="music-page-grid" style="flex: 1; display: grid; grid-template-columns: 1fr 320px; gap: 20px; min-height: 0; align-items: center;">
                    
                    <div class="main-player-panel" style="height: 100%; max-height: 650px; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; background: rgba(255,255,255,0.03); border-radius: 35px; border: 1px solid rgba(255,255,255,0.05); padding: 30px;">
                        
                        <div id="liveEqBars" class="top-right-eq" data-tip="Live Audio Sync" style="position: absolute; top: 25px; right: 25px;">
                            <div class="live-bar"></div><div class="live-bar"></div><div class="live-bar"></div><div class="live-bar"></div>
                        </div>

                        <div id="vinylDisk" class="giant-album-art" data-tip="Currently Playing" style="width: min(240px, 50vh); height: min(240px, 50vh); margin-bottom: 30px;"></div>
                        
                        <div style="z-index: 1; text-align: center; width: 100%; max-width: 450px;">
                            <h2 id="songTitle" data-tip="Track Title" style="font-size: clamp(28px, 6vw, 38px); font-weight: 800; margin: 0; color: white; letter-spacing: -1px; text-shadow: 0 4px 15px rgba(0,0,0,0.5);">Loading...</h2>
                            <p id="songArtist" data-tip="Artist" style="font-size: 16px; color: #ff2a5f; font-weight: 600; margin: 5px 0 20px 0; text-transform: uppercase; letter-spacing: 1.5px;"></p>
                            
                            <div data-tip="Dedication Note" style="background: rgba(0,0,0,0.4); padding: 15px 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 25px; backdrop-filter: blur(10px);">
                                <p id="songMessage" style="font-size: 14px; color: #e0e0e0; font-style: italic; margin: 0; line-height: 1.6;"></p>
                            </div>

                            <div class="playback-controller" style="width: 100%; max-width: 400px; margin: 0 auto;">
                                <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-faded); margin-bottom: 8px; font-family: 'Poppins', sans-serif;">
                                    <span id="currentTimeDisplay">0:00</span>
                                    <span id="totalTimeDisplay">0:00</span>
                                </div>
                                
                                <div id="progressBarContainer" data-tip="Scrub Timeline" style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; position: relative; margin-bottom: 25px;" onclick="window.scrubMusic(event)">
                                    <div id="progressBarFill" style="width: 100%; height: 100%; background: linear-gradient(90deg, #ff2a5f, #ff719a); border-radius: 10px; transform-origin: left; transform: scaleX(0); will-change: transform; box-shadow: 0 0 10px rgba(255,42,95,0.5);"></div>
                                    <div id="progressDot" style="position: absolute; top: -3px; left: 0%; width: 12px; height: 12px; background: white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity 0.2s;"></div>
                                </div>

                                <div class="controls-wrapper" style="display: flex; justify-content: space-between; align-items: center; padding: 0 5px;">
                                    <button id="btnRepeat" data-tip="Toggle Repeat" style="background:none; border:none; color: var(--text-faded); font-size: 18px; cursor: pointer;" onclick="window.toggleRepeat()">🔁 </button>
                                    
                                    <div class="action-buttons" style="display: flex; gap: 12px;">
                                        <button class="pro-btn btn-listen" data-tip="Play/Pause for both" style="padding: 12px 22px; border-radius: 30px; font-size: 13px; font-weight: 700;" onclick="window.toggleMusicPlayback()">▶ Play Sync</button>
                                        <button class="pro-btn btn-dedicate" data-tip="Dedicate a track" style="padding: 12px 18px; border-radius: 30px; font-size: 13px;" onclick="window.openDedicationModal()">Add Music</button>
                                    </div>
                                    <button data-tip="Force Exact Resync" style="background:none; border:none; color: var(--text-faded); font-size: 18px; cursor: pointer;" onclick="window.forceExactSync()">🔄</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="music-history-panel" style="height: 100%; max-height: 650px; background: rgba(255,255,255,0.02); border-radius: 30px; border: 1px solid rgba(255,255,255,0.05); padding: 25px; display: flex; flex-direction: column;">
                        <h3 data-tip="History Log" style="margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-faded); font-weight: 700;">Recent Dedications</h3>
                        <div id="historyFeedList" class="history-feed" style="flex: 1; overflow-y: auto;"></div>
                    </div> 
                </div>

                <div id="musicModal" class="modal-overlay">
                    <div class="premium-modal" style="width: 90%; max-width: 400px;">
                        <h3 style="margin-top:0; margin-bottom: 20px; color: white;">Add a Song</h3>
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <input type="text" id="songSearchQuery" data-tip="Type song name" class="premium-input" style="flex: 1;" placeholder="Search for a song...">
                            <button class="pro-btn" data-tip="Search Library" style="padding: 10px 15px; background: rgba(255,42,95,0.15); color: #ff2a5f; border-radius: 14px; box-shadow: none;" onclick="window.searchSongMetadata(this)">🔍 Search</button>
                        </div>
                        <div id="artPreviewContainer" style="display: none; align-items: center; gap: 15px; background: rgba(0,0,0,0.4); padding: 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; backdrop-filter: blur(10px);">
                            <img id="previewArtImg" src="" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover;">
                            <div style="flex: 1; display: flex; flex-direction: column; overflow: auto;">
                                <input type="text" id="dedicateTitle" class="premium-input" style="background: transparent; border: none; padding: 0; font-size: 14px; font-weight: 700; color: white; margin-bottom: 2px; box-shadow: none;" readonly>
                                <input type="text" id="dedicateArtist" class="premium-input" style="background: transparent; border: none; padding: 0; font-size: 11px; color: var(--text-faded); box-shadow: none;" readonly>
                            </div>
                            <button class="pro-btn" data-tip="Add to queue" style="width: 35px; height: 35px; border-radius: 50%; padding: 0; background: rgba(255,255,255,0.1); display: flex; justify-content: center;" onclick="window.addToPlaylistOnly()">
                                <span style="font-size: 18px;">➕</span>
                            </button>
                            <input type="hidden" id="hiddenAlbumArtUrl">
                            <input type="hidden" id="hiddenYtId">
                        </div>
                        <div class="input-group">
                            <label style="font-size: 12px; color: var(--text-faded);">Your Message</label>
                            <input type="text" id="dedicateMessage" data-tip="Write a sweet note" class="premium-input" placeholder="Say something sweet...">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 25px;">
                            <button class="pro-btn btn-dedicate" data-tip="Play for both instantly" style="flex: 1; justify-content: center; padding: 12px;" onclick="window.sendDedication()">Send & Play</button>
                            <button class="pro-btn btn-listen" data-tip="Cancel" style="width: 60px; justify-content: center; padding: 12px;" onclick="window.closeDedicationModal()">✕</button>
                        </div>
                    </div>
                </div>

                <div id="playlistContainer" class="morphing-playlist">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin:0; color: white; font-weight: 800; font-size: 20px;">Bridge Playlist</h3>
                            <p style="margin:0; font-size: 11px; color: var(--text-faded);">Your shared musical journey</p>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="pro-btn" data-tip="Add new song" style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255,42,95,0.15); color: #ff2a5f; padding: 0;" onclick="window.togglePlaylistContainer(); window.openDedicationModal();">➕</button>
                            <button class="pro-btn btn-listen" data-tip="Close Playlist" style="width: 38px; height: 38px; border-radius: 50%; justify-content: center; padding: 0;" onclick="window.togglePlaylistContainer()">✕</button>
                        </div>
                    </div>
                    <div id="playlistItems" class="playlist-scroll-area"></div>
                </div>

                <style>
                    .morphing-playlist {
                        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0);
                        width: 92%; max-width: 380px; height: 75%; max-height: 520px;
                        background: rgba(20, 20, 25, 0.95); backdrop-filter: blur(30px) saturate(180%);
                        -webkit-backdrop-filter: blur(30px) saturate(180%);
                        border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 32px; z-index: 3000; padding: 25px;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); opacity: 0; visibility: hidden;
                        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events: none;
                    }
                    .morphing-playlist.active { opacity: 1; visibility: visible; transform: translate(-50%, -50%) scale(1); pointer-events: all; }
                    .playlist-scroll-area { height: calc(100% - 70px); overflow-y: auto; padding-right: 5px; }
                    .playlist-scroll-area::-webkit-scrollbar { width: 3px; }
                    .playlist-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }

                    /* --- 📱 MOBILE RESPONSIVENESS ENGINE --- */
                    @media (max-width: 900px) {
                        .music-page-grid {
                            grid-template-columns: 1fr !important; /* Stack vertically */
                            grid-template-rows: auto 350px; /* Give history panel fixed height when stacked */
                            gap: 15px !important;
                            align-items: stretch !important;
                        }
                        .main-player-panel {
                            max-height: none !important;
                            padding: 20px !important; /* Slightly tighter padding on mobile */
                        }
                        .music-history-panel {
                            max-height: none !important;
                        }
                        #vinylDisk {
                            /* Scale vinyl dynamically on smaller screens */
                            width: min(200px, 40vw) !important;
                            height: min(200px, 40vw) !important;
                            margin-bottom: 20px !important;
                        }
                        .controls-wrapper {
                            padding: 0 !important;
                        }
                        /* Ensure buttons wrap beautifully on tiny screens like iPhone SE */
                        .action-buttons {
                            flex-wrap: wrap;
                            justify-content: center;
                        }
                    }
                </style>
            </div>
        `;

 

// ... (end of your box.innerHTML string) ...
        
        // 1. Boot the Main Engine
        if(typeof window.initMusicEngine === 'function') window.initMusicEngine(); 
        
        // 2. Boot the Progress Loop
        if(typeof window.startProgressLoop === 'function') window.startProgressLoop(); 
        
        // 3. NEW: Boot the Playlist Listener specifically
        if(typeof window.startPlaylistListener === 'function') window.startPlaylistListener();
    
    }
    else if (viewName === 'tracker') {
        box.innerHTML = `
            <h1 class="view-title">Project Logistics</h1>
            <p class="view-subtitle">Tracking shared goals and development.</p>
            <div class="glass-widget" style="max-width: 450px;">
                <p class="widget-label">System: HamaraLabs</p>
                <div style="display: flex; justify-content: space-between; align-items: end;">
                    <h2 class="widget-value">75%</h2>
                    <p style="margin: 0; color: var(--text-faded); font-size: 13px;">Architecture Phase</p>
                </div>
                <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-top: 15px; overflow: hidden;">
                    <div style="width: 75%; height: 100%; background: #0a84ff; border-radius: 4px; transition: 1s ease-out;"></div>
                </div></div>`;}}
window.openMap = function(lat, lon, titleText) {
    if(lat === 0 || lon === 0) return alert("Waiting for coordinate lock...");
    document.getElementById('mapTitle').innerText = titleText;
    let mapUrl = `https://maps.google.com/maps?q=${lat},${lon}&t=m&z=14&output=embed&iwloc=near`;
    document.getElementById('mapFrameContainer').innerHTML = `
        <iframe width="100%" height="100%" frameborder="0" style="border:0; border-radius: 0 0 28px 28px;" src="${mapUrl}" allowfullscreen></iframe>`;
    document.getElementById('mapModal').classList.add('active');}
window.closeMap = function() {
    document.getElementById('mapModal').classList.remove('active');
    setTimeout(() => { document.getElementById('mapFrameContainer').innerHTML = ""; }, 400); }
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180; 
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return Math.round(R * c);}
window.executeLogout = async function() {
    setOnlineStatus(false);
    setTimeout(() => { signOut(auth).then(() => { 
            localStorage.removeItem("activeBridgeUser"); 
            window.location.href = '././index.html'; }); }, 200); }
async function saveVersionSnapshot(content) {
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/history`);
    push(historyRef, {content: content, author: currentUsername, timestamp: rtdbTime()});}
let originalContentBeforePreview = null;
window.toggleVersionHistory = function() {
    const popup = document.getElementById('historyPopup');
    if (!popup) return;
    popup.classList.toggle('active');
    if (popup.classList.contains('active')) {
        originalContentBeforePreview = sharedEditor.getContents();
        loadHistoryList();
        const closeOnOutsideClick = (e) => {
            if (!popup.contains(e.target) && e.target.id !== 'historyBtn') {
                cancelPreview(); // Snap back to current version on close
                popup.classList.remove('active');
                document.removeEventListener('mousedown', closeOnOutsideClick);
            }
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
    } else {
        cancelPreview();
    }
}

function loadHistoryList() {
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/history`);
    onValue(historyRef, (snap) => {
        const feed = document.getElementById('historyFeed');
        if (!feed) return;
        feed.innerHTML = "";

        if (!snap.exists()) {
            feed.innerHTML = "<div style='padding:20px; color:var(--text-faded); text-align:center;'>No history yet.</div>";
            return;
        }

        let versions = [];
        snap.forEach(child => { versions.push({ id: child.key, ...child.val() }); });

        versions.reverse().forEach(v => {
            const date = new Date(v.timestamp);
            feed.innerHTML += `
                <div class="history-item" id="ver-${v.id}" onclick="previewVersion('${v.id}')" style="cursor:pointer; padding:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:9px; color:var(--accent-blue); font-weight:700; text-transform:uppercase;">Snapshot</div>
                    <div style="font-size:13px; font-weight:500; color:white;">By ${v.author}</div>
                    <div style="font-size:11px; color:var(--text-faded);">${date.toLocaleDateString()} • ${date.toLocaleTimeString()}</div>
                    <div id="actions-${v.id}" style="display:none; margin-top:10px; gap:10px;">
                        <button class="action-btn" style="padding:5px 10px; font-size:10px; flex:1; background:#32d74b;" onclick="restoreVersion('${v.id}')">Confirm Restore</button>
                        <button class="action-btn" style="padding:5px 10px; font-size:10px; flex:1; background:rgba(255,255,255,0.1);" onclick="cancelPreview()">Cancel</button>
                    </div>
                </div>
            `;
        });
    });
}

window.previewVersion = async function(versionId) {
    // 1. Visually highlight the selected item
    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.remove('previewing');
        el.querySelector('[id^="actions-"]').style.display = 'none';
    });
    
    const item = document.getElementById(`ver-${versionId}`);
    item.classList.add('previewing');
    document.getElementById(`actions-${versionId}`).style.display = 'flex';

    const snap = await get(ref(rtdb, `bridges/${currentBridgeId}/history/${versionId}`));
    if (snap.exists()) {
        isProgrammaticUpdate = true;
        sharedEditor.setContents(snap.val().content);
        isProgrammaticUpdate = false;
        document.getElementById('notepadStatus').innerText = "👁️ Previewing Old Version...";
    }
}

window.cancelPreview = function() {
    if (originalContentBeforePreview) {
        isProgrammaticUpdate = true;
        sharedEditor.setContents(originalContentBeforePreview);
        isProgrammaticUpdate = false;
        document.getElementById('notepadStatus').innerText = "☁️ Synced";
    }
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('previewing'));
}

window.restoreVersion = async function(versionId) {
    const snap = await get(ref(rtdb, `bridges/${currentBridgeId}/history/${versionId}`));
    if (snap.exists()) {
        const versionData = snap.val();
        
        set(ref(rtdb, `bridges/${currentBridgeId}/canvasData`), {
            content: versionData.content,
            lastEditor: `${currentUsername} (Restored)`,
            typing: ""
        });

        logActivity(`restored a version from ${new Date(versionData.timestamp).toLocaleTimeString()}.`);
        originalContentBeforePreview = versionData.content; // Update current baseline
        window.toggleVersionHistory();
    }
}
function updatePartnerPresenceUI() {
    let statusText = document.getElementById('partnerStatusText'); // Sidebar
    let dot = document.querySelector('.pulse-dot'); // Sidebar Dot
    
    let mobileText = document.getElementById('mobileStatusText'); // Mobile Chip
    let mobileDot = document.getElementById('mobileDot'); // Mobile Dot

    let timeString = "Offline";
    if (!partnerIsOnline && partnerLastActive) {
        timeString = "Last seen " + calculateTimeAgo(new Date(partnerLastActive));
    }

    // Update Desktop Sidebar
    if (statusText && dot) {
        if (partnerIsOnline) {
            statusText.innerText = "Online";
            dot.style.background = '#32d74b'; dot.style.boxShadow = '0 0 10px #32d74b'; dot.style.animation = 'pulse 2s infinite';
        } else {
            statusText.innerText = timeString;
            dot.style.background = '#8e8e93'; dot.style.boxShadow = 'none'; dot.style.animation = 'none';
        }
    }

    // Update Mobile Header Chip
    if (mobileText && mobileDot) {
        if (partnerIsOnline) {
            mobileText.innerText = "Online";
            mobileDot.className = "status-dot-small online";
        } else {
            mobileText.innerText = timeString;
            mobileDot.className = "status-dot-small";
        }
    }
}
// ==========================================
// 12. GLOBAL UNREAD TRACKER
// ==========================================
function activateGlobalUpdateListener() {
    const canvasRef = ref(rtdb, `bridges/${currentBridgeId}/canvasData`);

    // This listener runs regardless of what page you are on
    onValue(canvasRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const lastEditor = data.lastEditor || "System";
            const lastEditTime = data.lastEditTime || 0;

            // Get your last read time
            const lastRead = localStorage.getItem(`lastRead_${currentBridgeId}`) || 0;

            // Elements
            const sidebarBadge = document.getElementById('sidebarUnreadBadge');
            const journalBadge = document.getElementById('unreadBadge'); // Might be null if tab closed
            const activeTab = document.querySelector('.nav-item.active');

            // Logic: If partner edited and I'm NOT currently looking at the SyncSpace
            const isLookingAtSyncSpace = activeTab && activeTab.innerText.includes("SyncSpace");

            if (lastEditor !== currentUsername && lastEditTime > lastRead) {
                if (!isLookingAtSyncSpace) {
                    // Show badge on Sidebar
                    if (sidebarBadge) sidebarBadge.classList.add('active');
                    // Show badge on Journal button (if rendered)
                    if (journalBadge) journalBadge.classList.add('active');
                }
            } else {
                // If I am the editor or I've read it, hide badges
                if (sidebarBadge) sidebarBadge.classList.remove('active');
                if (journalBadge) journalBadge.classList.remove('active');
            }
        }
    });
}
// ==========================================
// 12. 24-HOUR PULSE NOTE ENGINE
// ==========================================

let pulseNoteTimer;

window.handlePulseNoteUpdate = function() {
    const text = document.getElementById('pulseNoteInput').value;
    const status = document.getElementById('noteStatus');
    
    status.innerHTML = `<span style="font-size: 10px; color: #32d74b;">Saving...</span>`;

    clearTimeout(pulseNoteTimer);
    pulseNoteTimer = setTimeout(async () => {
        try {
            await set(ref(rtdb, `bridges/${currentBridgeId}/pulseNote`), {
                text: text,
                author: currentUsername,
                timestamp: rtdbTime() // Server-side time
            });
            status.innerHTML = ``;
        } catch (e) {
            status.innerHTML = `<span style="font-size: 10px; color: #ff3b30;">Error</span>`;
        }
    }, 800);
};
// ==========================================
// 12. DUAL-STACK BUBBLY PULSE NOTE ENGINE
// ==========================================

window.togglePulseTyper = function() {
    const typer = document.getElementById('pulseTyper');
    const btn = document.getElementById('noteTrigger');
    const isExpanded = typer.classList.toggle('expanded');
    
    // Hide/Show trigger button based on state
    btn.style.display = isExpanded ? 'none' : 'block';
    if(isExpanded) {
        document.getElementById('pulseNoteInput').focus();
    }
}

window.savePulseNote = async function() {
    const text = document.getElementById('pulseNoteInput').value;
    if(!text.trim()) return togglePulseTyper();

    // CRITICAL FIX: Save the note under YOUR specific UID
    await set(ref(rtdb, `bridges/${currentBridgeId}/pulseNotes/${currentUser.uid}`), {
        text: text,
        author: currentUsername,
        timestamp: rtdbTime()
    });

    togglePulseTyper();
}

window.deleteMyPulseNote = async function() {
    await set(ref(rtdb, `bridges/${currentBridgeId}/pulseNotes/${currentUser.uid}`), null);
    document.getElementById('pulseNoteInput').value = ""; // Clear the typer
}
function syncPulseNoteUI() {
    const notesRef = ref(rtdb, `bridges/${currentBridgeId}/pulseNotes`);
    
    onValue(notesRef, (snap) => {
        const display = document.getElementById('activeNoteDisplay');
        const trigger = document.getElementById('noteTrigger');
        const mobileBtn = document.getElementById('mobileNoteToggle'); // Grab the mobile button
        
        if (!display) return;

        display.innerHTML = ""; 

        // IF NO NOTES EXIST AT ALL
        if (!snap.exists()) {
            if(trigger) trigger.innerText = "+ Note";
            if(mobileBtn) {
                mobileBtn.classList.remove('has-notes');
                mobileBtn.innerHTML = "👀 View Notes";
            }
            return;
        }

        let myNoteExists = false;
        let totalActiveNotes = 0; // Keep track of unexpired notes

        snap.forEach((childSnap) => {
            const noteAuthorUid = childSnap.key;
            const data = childSnap.val();
            
            const noteAgeMs = Date.now() - data.timestamp;
            const expiryTime = 24 * 60 * 60 * 1000;

            if (noteAgeMs > expiryTime) {
                set(ref(rtdb, `bridges/${currentBridgeId}/pulseNotes/${noteAuthorUid}`), null);
                return;
            }

            totalActiveNotes++; // Count this note as active
            const hoursLeft = Math.round((expiryTime - noteAgeMs) / (1000 * 60 * 60));
            const isMine = noteAuthorUid === currentUser.uid;
            
            if (isMine) myNoteExists = true;

            const titleText = isMine ? `Your note` : `Note from ${data.author}`;
            const titleColor = isMine ? `var(--text-faded)` : `#0a84ff`;
            const deleteBtnHtml = isMine ? `<span onclick="deleteMyPulseNote()" style="cursor:pointer; color:rgba(255,255,255,0.3); font-size:12px; margin-left:10px; transition:0.2s;" onmouseover="this.style.color='#ff3b30'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">✕</span>` : ``;
            display.innerHTML += `
                <div class="floating-glass-note" style="margin-top: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 9px; color: ${titleColor}; font-weight: 800; text-transform: uppercase;">${titleText}</span>
                        <div style="display: flex; align-items: center;">
                            <span style="font-size: 9px; color: #ff6c0a; font-weight: 700;">${hoursLeft}h left</span>
                            ${deleteBtnHtml}
                        </div></div>
                    <p style="margin: 0; font-size: 14px; color: white; line-height: 1.4; font-weight: 400;">${data.text}</p>
                </div>`;});

        if(trigger) {
            trigger.innerText = myNoteExists ? "Update" : "+ Note";
        }

        if(mobileBtn) {
            if (totalActiveNotes > 0) {
                mobileBtn.classList.add('has-notes');
                if (!display.classList.contains('show-on-mobile')) {
                    // Cleaner, premium text
                    mobileBtn.innerHTML = `✨ ${totalActiveNotes} New Pulse${totalActiveNotes > 1 ? 's' : ''}`;
                }
            } else {
                mobileBtn.classList.remove('has-notes');
                mobileBtn.innerHTML = "View Notes";
            }
        }
    });
}
window.toggleMobileNotes = function() {
    const display = document.getElementById('activeNoteDisplay');
    const btn = document.getElementById('mobileNoteToggle');
    if (!display || !btn) return;

    // Toggle the visibility class
    const isShowing = display.classList.toggle('show-on-mobile');
    
    // Update the button text to match the state
    btn.innerHTML = isShowing ? "🙈 Hide Notes" : "👀 View Notes";
}
// ==========================================
// 15. DYNAMIC CLOUD MILESTONE ENGINE
// ==========================================

window.openMilestoneModal = function() {
    document.getElementById('milestoneModal').classList.add('active');
}

window.closeMilestoneModal = function() {
    document.getElementById('milestoneModal').classList.remove('active');
    // Clear inputs
    document.getElementById('msIcon').value = "";
    document.getElementById('msTitle').value = "";
    document.getElementById('msDate').value = "";
}

window.saveMilestone = async function() {
    const icon = document.getElementById('msIcon').value || "✨";
    const title = document.getElementById('msTitle').value;
    const date = document.getElementById('msDate').value; // Format: YYYY-MM-DD

    if(!title || !date) return alert("Please enter a title and date.");

    // Push new event to Firebase!
    const newMilestoneRef = push(ref(rtdb, `bridges/${currentBridgeId}/milestones`));
    await set(newMilestoneRef, {
        icon: icon,
        title: title,
        date: date,
        addedBy: currentUsername,
        timestamp: rtdbTime()
    });

    closeMilestoneModal();
}

window.deleteMilestone = async function(id) {
    if(confirm("Remove this milestone from the timeline?")) {
        await set(ref(rtdb, `bridges/${currentBridgeId}/milestones/${id}`), null);
    }
}

window.initMilestonesEngine = function() {
    const milestonesRef = ref(rtdb, `bridges/${currentBridgeId}/milestones`);

    onValue(milestonesRef, (snap) => {
        const carousel = document.getElementById('eventsCarousel');
        const counterEl = document.getElementById('daysTogetherCounter');
        if (!carousel) return;

        carousel.innerHTML = ""; // Clear board

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let events = [];
        let earliestDate = today; // To calculate total days together

        if (snap.exists()) {
            snap.forEach(child => {
                const data = child.val();
                events.push({ id: child.key, ...data });
                
                const evDate = new Date(data.date + 'T00:00:00'); // Force local midnight
                if (evDate < earliestDate) earliestDate = evDate;
            });
        }

        // 1. Update the Main "Days Together" Counter based on the oldest event
        if (counterEl && events.length > 0) {
            const daysTogether = Math.floor((today - earliestDate) / (1000 * 60 * 60 * 24));
            counterEl.innerText = daysTogether; // You can re-add the counting animation here if you prefer
        } else if (counterEl) {
            counterEl.innerText = "0";
        }

        // 2. Sort events chronologically
        events.sort((a, b) => new Date(a.date) - new Date(b.date));

        // 3. Render the Cards
        events.forEach(ev => {
            const evDate = new Date(ev.date + 'T00:00:00');
            const diffTime = evDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let timeString = "";
            let colorStyle = "";

            if (diffDays < 0) {
                timeString = `${Math.abs(diffDays)} Days Ago`;
                colorStyle = "color: white;";
            } else if (diffDays === 0) {
                timeString = "Today! 🎉";
                colorStyle = "color: #32d74b;"; 
            } else {
                timeString = `In ${diffDays} Days`;
                colorStyle = "color: #0a84ff;"; 
            }
            
            carousel.innerHTML += `
                <div class="event-pill" style="position: relative;">
                    <span onclick="deleteMilestone('${ev.id}')" style="position: absolute; top: 8px; right: 10px; font-size: 10px; cursor: pointer; color: rgba(255,255,255,0.2);">✕</span>
                    
                    <div class="event-icon">${ev.icon}</div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span class="event-title">${ev.title}</span>
                        <span class="event-time" style="${colorStyle}">${timeString}</span>
                    </div>
                </div>
            `;
        });

        carousel.innerHTML += `
            <div class="event-pill add-event-pill" onclick="openMilestoneModal()">
                <div style="font-size: 20px; margin-bottom: 5px;">+</div>
                <div class="event-title" style="color: #0a84ff;">Add Event</div>
            </div>
        `;});}
// ==========================================
// 16. FLAGSHIP SYNCHRONIZED MUSIC ENGINE 
// (Apple UI + Official YT API + Firebase Sync + Listen Together + Telemetry)
// ==========================================

// --- 1. MODAL UI CONTROLS ---
window.openDedicationModal = function() {
    const modal = document.getElementById('musicModal');
    if(modal) modal.classList.add('active');
}

window.closeDedicationModal = function() {
    const modal = document.getElementById('musicModal');
    if(modal) modal.classList.remove('active');
    
    document.getElementById('songSearchQuery').value = "";
    document.getElementById('dedicateTitle').value = "";
    document.getElementById('dedicateArtist').value = "";
    document.getElementById('dedicateMessage').value = "";
    document.getElementById('hiddenAlbumArtUrl').value = "";
    document.getElementById('hiddenYtId').value = "";
    
    const previewContainer = document.getElementById('artPreviewContainer');
    if(previewContainer) previewContainer.style.display = 'none';
}

// --- 2. ZERO-CLICK SEARCH ENGINE ---
// --- 2. SEARCH ENGINE (REBUILT FOR STABILITY) ---
window.searchSongMetadata = async function(btnElement) {
    const queryInput = document.getElementById('songSearchQuery');
    const query = queryInput ? queryInput.value : "";
    
    // Pro-fix: Use the passed element directly, or fallback to selector
    const searchBtn = btnElement || document.querySelector('button[onclick*="searchSongMetadata"]');
    
    const YOUTUBE_API_KEY = "AIzaSyDyU-K6yp6iNhpwF0GOfmHsnj8_qHMYhCo"; 
    
    if(!query) return alert("Type a song name first, bro!");
    
    // Set UI Loading state safely
    if (searchBtn) {
        searchBtn.innerHTML = "⏳ Scanning...";
        searchBtn.style.opacity = "0.7";
        searchBtn.disabled = true;
    }

    try {
        // STEP 1: Apple Metadata
        const appleRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
        const appleData = await appleRes.json();

        if(appleData.results && appleData.results.length > 0) {
            const track = appleData.results[0];
            const highResArt = track.artworkUrl100.replace('100x100bb', '500x500bb'); 
            
            // Safe DOM Injection
            const artImg = document.getElementById('previewArtImg');
            const titleInp = document.getElementById('dedicateTitle');
            const artistInp = document.getElementById('dedicateArtist');
            const hiddenArt = document.getElementById('hiddenAlbumArtUrl');
            const previewBox = document.getElementById('artPreviewContainer');

            if (artImg) artImg.src = highResArt;
            if (titleInp) titleInp.value = track.trackName;
            if (artistInp) artistInp.value = track.artistName;
            if (hiddenArt) hiddenArt.value = highResArt;

            // STEP 2: YouTube Audio Lock
            const audioQuery = `${track.trackName} ${track.artistName} lyric video`;
            const ytApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(audioQuery)}&type=video&videoEmbeddable=true&maxResults=1&key=${YOUTUBE_API_KEY}`;
            
            const ytRes = await fetch(ytApiUrl);
            const ytData = await ytRes.json();
            
            if (ytData.error) throw new Error(ytData.error.message);

            if (ytData.items && ytData.items.length > 0) {
                const hiddenYt = document.getElementById('hiddenYtId');
                if (hiddenYt) hiddenYt.value = ytData.items[0].id.videoId;
                if (previewBox) previewBox.style.display = 'flex';
                console.log("✅ Audio Lock Acquired via Official API");
            } else {
                alert("YouTube strictly blocked this song. Try another!");
            }
        } else {
            alert("Couldn't find that song on Apple Music.");
        }
    } catch (e) {
        console.error("Master Engine Error:", e);
        alert(`API Error: ${e.message || "Connection failed."}`);
    }

    // Always reset button state safely
    if (searchBtn) {
        searchBtn.innerHTML = "🔍 Search";
        searchBtn.style.opacity = "1";
        searchBtn.disabled = false;
    }
}// --- 3. FIREBASE SYNC & DISPATCH ---
// --- 3. FIREBASE SYNC, DISPATCH & PLAYLIST INDEXING ---
window.sendDedication = async function() {
    // 1. Precise DOM Extraction
    const title = document.getElementById('dedicateTitle')?.value;
    const artist = document.getElementById('dedicateArtist')?.value || "Unknown Artist";
    const message = document.getElementById('dedicateMessage')?.value;
    const albumArt = document.getElementById('hiddenAlbumArtUrl')?.value;
    const ytId = document.getElementById('hiddenYtId')?.value;

    // 2. Critical Validation
    if (!ytId || !albumArt) {
        return alert("Please search for a song first to lock the audio coordinates!");
    }

    // 3. Construct the Master Song Object
    const songObject = {
        title: title,
        artist: artist,
        albumArt: albumArt,
        ytId: ytId, 
        dedicatedBy: currentUsername,
        timestamp: Date.now() // Precise ms for playlist sorting
    };

    try {
        // A. Update the LIVE BROADCAST (Forces partner to sync)
        await set(ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`), {
            ...songObject,
            message: message,
            playbackState: 'paused',
            seekTime: 0,
            actionTimestamp: Date.now()
        });

        // B. Update the PERMANENT PLAYLIST (The Library)
        // We use the ytId as the key to prevent duplicate songs in the playlist
        await set(ref(rtdb, `bridges/${currentBridgeId}/music/playlist/${ytId}`), songObject);

        // C. Update the HISTORY FEED (The Log)
        await push(ref(rtdb, `bridges/${currentBridgeId}/music/history`), {
            ...songObject,
            serverTime: rtdbTime()
        });

        console.log("✅ Song Broadcasted & Saved to Bridge Playlist.");
        window.closeDedicationModal();

    } catch (error) {
        console.error("Firebase Sync Error:", error);
        alert("Failed to sync with the Bridge. Check your connection!");
    }
}
// --- 4. LIVE UI & FIREBASE LISTENER (CRASH-PROOF SYNC) ---
window.initMusicEngine = function() {
    const musicRef = ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`);
    
    onValue(musicRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();

        // A. SAFELY UPDATE THE MUSIC TAB UI
        const titleEl = document.getElementById('songTitle');
        const artistEl = document.getElementById('songArtist');
        const msgEl = document.getElementById('songMessage');
        const diskEl = document.getElementById('vinylDisk');
        const listenBtn = document.querySelector('.btn-listen'); 
        
        if (titleEl) {
            titleEl.innerText = data.title;
            artistEl.innerText = data.artist;
            msgEl.innerText = data.message ? `"${data.message}"\n— ${data.dedicatedBy}` : `Played by ${data.dedicatedBy}`;

            if (diskEl && data.albumArt) {
                diskEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url('${data.albumArt}')`;
                diskEl.style.backgroundSize = "cover";
                diskEl.style.backgroundPosition = "center";
            }

            if (listenBtn) {
                listenBtn.setAttribute('onclick', 'window.toggleMusicPlayback()');
                listenBtn.innerHTML = window.isAudioPlaying ? "⏸ Pause Sync" : "▶ Listen Sync";
                listenBtn.style.opacity = "1";
            }
        }

        // B. BACKGROUND AUDIO CUEING 
        if (window.ytAudioPlayer && typeof window.ytAudioPlayer.cueVideoById === 'function') {
            const currentUrl = window.ytAudioPlayer.getVideoUrl();
            if (!currentUrl || !currentUrl.includes(data.ytId)) {
                window.ytAudioPlayer.cueVideoById(data.ytId);
                if (!window.isAudioPlaying && typeof window.togglePlaybackUI === 'function') {
                    window.togglePlaybackUI(false); 
                }
            }
        }

        // C. THE MASTER SYNC INTERCEPTOR
        if (data.playbackState) {
            const isPlayingRemote = data.playbackState === 'playing';
            
            if (data.lastActionBy === currentUsername) {
                if (isPlayingRemote) {
                    if(window.ytAudioPlayer) window.ytAudioPlayer.playVideo();
                    if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(true);
                } else {
                    if(window.ytAudioPlayer) window.ytAudioPlayer.pauseVideo();
                    if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(false);
                }
            } else {
                window.pendingSyncTime = data.seekTime || 0;
                window.pendingSyncTimestamp = data.actionTimestamp || Date.now();
                window.pendingYtId = data.ytId; 

                if (data.isScrubbing && window.isAudioPlaying && window.ytAudioPlayer) {
                    const timePassed = (Date.now() - window.pendingSyncTimestamp) / 1000;
                    window.ytAudioPlayer.seekTo(window.pendingSyncTime + timePassed, true);
                    console.log(`📡 Partner scrubbed timeline. Auto-syncing to ${window.pendingSyncTime.toFixed(2)}s`);
                }

                if (isPlayingRemote && !window.isAudioPlaying) {
                    const joinTitle = document.getElementById('globalSyncJoinTitle');
                    if (joinTitle) joinTitle.innerText = `${data.lastActionBy} is listening`;
                    
                    const joinModal = document.getElementById('globalSyncJoinModal');
                    if (joinModal) joinModal.classList.add('active');

                } else if (!isPlayingRemote && window.isAudioPlaying) {
                    if(window.ytAudioPlayer) window.ytAudioPlayer.pauseVideo();
                    if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(false);
                }
            }
        }
    });

    // ⚡ ANTI-LAG FIX: History Feed DOM Thrashing
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/music/history`);
    onValue(historyRef, (snap) => {
        const feedEl = document.getElementById('historyFeedList');
        if (!feedEl) return;
        
        if (!snap.exists()) {
            feedEl.innerHTML = `<p style="color: var(--text-faded); font-size: 13px; text-align: center; margin-top: 20px;">No history yet. Start the playlist!</p>`;
            return;
        }
        
        let tracks = [];
        snap.forEach(child => { tracks.push(child.val()); });
        
        // ⚡ Batch the HTML into one string so the browser only paints ONCE instead of 50 times
        let batchHTML = "";
        tracks.reverse().forEach(track => {
            const dateStr = new Date(track.timestamp).toLocaleDateString();
            const artHtml = track.albumArt 
                ? `<img src="${track.albumArt}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">`
                : `<div style="width: 100%; height: 100%; border-radius: 10px; background: linear-gradient(135deg, #ff2a5f, #ff719a); display: flex; justify-content: center; align-items: center; font-size: 16px;">🎵</div>`;

            batchHTML += `
                <div class="history-track">
                    <div style="width: 45px; height: 45px; flex-shrink: 0;">${artHtml}</div>
                    <div style="flex: 1; overflow: hidden;">
                        <div style="font-size: 14px; font-weight: 700; color: white; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${track.title}</div>
                        <div style="font-size: 11px; color: var(--text-faded); margin-top: 2px;">${track.artist} • By ${track.dedicatedBy}</div>
                    </div>
                    <div style="font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 600;">${dateStr}</div>
                </div>
            `;
        });
        feedEl.innerHTML = batchHTML; // One single DOM update!
    });
}

// --- 5. PROGRESS BAR & TIMELINE SCRUBBING (ANTI-LAG 60FPS ENGINE) ---

window.progressAnimationFrame = null;
window.isRepeatOn = false;
let lastRenderedSecond = -1;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ⚡ ANTI-LAG FIX: Caching DOM elements so we don't search the page 60x a second
const progressCache = { currEl: null, totalEl: null, fillEl: null, dotEl: null };

window.startProgressLoop = function() {
    if (window.progressAnimationFrame) cancelAnimationFrame(window.progressAnimationFrame);
    
    // Cache once
    progressCache.currEl = document.getElementById('currentTimeDisplay');
    progressCache.totalEl = document.getElementById('totalTimeDisplay');
    progressCache.fillEl = document.getElementById('progressBarFill');
    progressCache.dotEl = document.getElementById('progressDot');
    
    function tick() {
        if (window.ytAudioPlayer && window.isAudioPlaying && typeof window.ytAudioPlayer.getCurrentTime === 'function') {
            const current = window.ytAudioPlayer.getCurrentTime();
            const total = window.ytAudioPlayer.getDuration();
            
            if (total > 0) {
                // Smooth visual updates
                const percent = (current / total) * 100;
                if (progressCache.fillEl) progressCache.fillEl.style.width = `${percent}%`;
                if (progressCache.dotEl) progressCache.dotEl.style.left = `${percent}%`;
                
                // Throttle text parsing to only 1 time per second (Saves massive CPU)
                const currentSecond = Math.floor(current);
                if (currentSecond !== lastRenderedSecond) {
                    if (progressCache.currEl) progressCache.currEl.innerText = formatTime(current);
                    if (progressCache.totalEl) progressCache.totalEl.innerText = formatTime(total);
                    lastRenderedSecond = currentSecond;
                }
            }
        }
        // Native 60FPS browser loop instead of clunky setInterval
        if (window.isAudioPlaying) {
            window.progressAnimationFrame = requestAnimationFrame(tick);
        }
    }
    
    window.progressAnimationFrame = requestAnimationFrame(tick);
}

window.stopProgressLoop = function() {
    if (window.progressAnimationFrame) cancelAnimationFrame(window.progressAnimationFrame);
}

window.scrubMusic = async function(event) {
    if (!window.ytAudioPlayer || typeof window.ytAudioPlayer.getDuration !== 'function') return;
    
    const container = document.getElementById('progressBarContainer');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width)); 
    
    const totalTime = window.ytAudioPlayer.getDuration();
    const seekToTime = totalTime * percent;
    
    window.ytAudioPlayer.seekTo(seekToTime, true);
    
    await update(ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`), {
        playbackState: window.isAudioPlaying ? 'playing' : 'paused',
        lastActionBy: currentUsername,
        seekTime: seekToTime,
        actionTimestamp: Date.now(),
        isScrubbing: true 
    });
}

window.toggleRepeat = function() {
    window.isRepeatOn = !window.isRepeatOn;
    const btn = document.getElementById('btnRepeat');
    if (btn) {
        btn.style.color = window.isRepeatOn ? '#ff2a5f' : 'var(--text-faded)';
        btn.style.textShadow = window.isRepeatOn ? '0 0 10px rgba(255,42,95,0.5)' : 'none';
    }
}

window.forceExactSync = function() {
    if (window.pendingSyncTime && window.pendingSyncTimestamp) {
        const timePassed = (Date.now() - window.pendingSyncTimestamp) / 1000;
        const exactTarget = window.pendingSyncTime + timePassed;
        if (window.ytAudioPlayer) window.ytAudioPlayer.seekTo(exactTarget, true);
        console.log(`🔄 Forced sync alignment to ${exactTarget.toFixed(2)}s`);
    }
}

// --- 6. THE GLOBAL SYNC MODAL & CALCULATION ENGINE ---

function initGlobalSyncModal() {
    if (!document.getElementById('globalSyncJoinModal')) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'globalSyncJoinModal';
        modalDiv.className = 'modal-overlay';
        modalDiv.style.zIndex = '99999'; 
        modalDiv.innerHTML = `
            <div class="premium-modal" style="text-align: center; max-width: 320px; padding: 40px 30px;">
                <div style="font-size: 50px; margin-bottom: 15px; animation: flagshipBreathe 3s infinite alternate;">🎧</div>
                <h3 id="globalSyncJoinTitle" style="margin-top:0; margin-bottom: 10px; color: white; font-weight: 800;">Partner is listening</h3>
                <p style="color: var(--text-faded); font-size: 13px; margin-bottom: 30px; line-height: 1.5;">Do you want to tune in and experience this track perfectly synced?</p>
                <div style="display: flex; gap: 10px;">
                    <button class="pro-btn btn-dedicate" style="flex: 1; justify-content: center; box-shadow: 0 10px 25px rgba(255, 42, 95, 0.4);" onclick="window.acceptSyncJoin()">Tune In</button>
                    <button class="pro-btn btn-listen" style="flex: 1; justify-content: center;" onclick="window.closeSyncJoinModal()">Later</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }
}
initGlobalSyncModal();

window.closeSyncJoinModal = function() {
    const modal = document.getElementById('globalSyncJoinModal');
    if (modal) modal.classList.remove('active');
}

window.acceptSyncJoin = function() {
    window.closeSyncJoinModal();
    try {
        if (window.ytAudioPlayer && typeof window.ytAudioPlayer.seekTo === 'function') {
            if (window.pendingYtId) {
                window.ytAudioPlayer.loadVideoById(window.pendingYtId);
            }
            const timePassedSincePlay = (Date.now() - window.pendingSyncTimestamp) / 1000;
            const exactTargetTime = window.pendingSyncTime + timePassedSincePlay;
            
            window.ytAudioPlayer.seekTo(exactTargetTime, true);
            window.ytAudioPlayer.playVideo();
            
            if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(true);
            console.log(`✅ Synced! Network drift compensated by ${timePassedSincePlay.toFixed(2)}s.`);
        }
    } catch (error) {
        console.error("Sync Engine Failed:", error);
    }
}

// --- 7. NETWORKED AUDIO ENGINE & YOUTUBE INIT ---
window.ytAudioPlayer = null;
window.isAudioPlaying = false;

function bootPersistentAudioEngine() {
    if (!document.getElementById('persistent-audio-bunker')) {
        const audioBunker = document.createElement('div');
        audioBunker.id = 'persistent-audio-bunker';
        audioBunker.style.cssText = 'position: absolute; top: -9999px; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
        audioBunker.innerHTML = '<div id="hiddenYtPlayer"></div>';
        document.body.appendChild(audioBunker);
    }
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
}

window.onYouTubeIframeAPIReady = function() {
    window.ytAudioPlayer = new YT.Player('hiddenYtPlayer', {
        height: '1', width: '1',
        host: 'https://www.youtube-nocookie.com', 
        playerVars: { 'autoplay': 0, 'controls': 0, 'playsinline': 1, 'origin': window.location.origin },
        events: {
            'onReady': function() { console.log("✅ Audio Engine Armed & Ready."); },
            'onStateChange': function(event) {
                if (event.data === YT.PlayerState.PLAYING) window.togglePlaybackUI(true);
                if (event.data === YT.PlayerState.PAUSED) window.togglePlaybackUI(false);
                if (event.data === YT.PlayerState.ENDED) {
                    if (window.isRepeatOn) {
                        window.ytAudioPlayer.seekTo(0);
                        window.ytAudioPlayer.playVideo();
                    } else {
                        window.togglePlaybackUI(false);
                    }
                }
            },
            'onError': function(e) {
                console.error("YouTube Error Code:", e.data);
                if (e.data === 150 || e.data === 101) alert("Track blocked by label. Try a different song.");
            }
        }
    });
}

// THE BROADCASTING PLAY BUTTON
window.toggleMusicPlayback = async function() {
    if (!window.ytAudioPlayer || typeof window.ytAudioPlayer.getPlayerState !== 'function') {
        return alert("The audio matrix is still booting up, give it 2 seconds...");
    }
    
    const playerState = window.ytAudioPlayer.getPlayerState();
    const isCurrentlyPlaying = (playerState === 1 || playerState === 3);
    const newState = isCurrentlyPlaying ? 'paused' : 'playing';
    
    const currentSeekTime = window.ytAudioPlayer.getCurrentTime() || 0;

    await update(ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`), {
        playbackState: newState,
        lastActionBy: currentUsername,
        seekTime: currentSeekTime,
        actionTimestamp: Date.now(),
        isScrubbing: false 
    });
}

window.togglePlaybackUI = function(isPlaying) {
    window.isAudioPlaying = isPlaying;
    const btn = document.querySelector('.btn-listen');
    if (btn) btn.innerHTML = isPlaying ? "⏸ Pause Sync" : "▶ Listen Sync";
    
    const eq = document.getElementById('liveEqBars');
    const disk = document.getElementById('vinylDisk');
    const sideEq = document.getElementById('sidebarMusicEq');
    const dot = document.getElementById('progressDot'); 
    
    if (isPlaying) {
        if (eq) eq.classList.add('playing');
        if (disk) disk.classList.add('playing');
        if (sideEq) sideEq.classList.add('playing');
        if(typeof window.startProgressLoop === 'function') window.startProgressLoop(); // ⚡ Kickstart GPU loop
        if (dot) dot.style.opacity = '1'; 
    } else {
        if (eq) eq.classList.remove('playing');
        if (disk) disk.classList.remove('playing');
        if (sideEq) sideEq.classList.remove('playing');
        if(typeof window.stopProgressLoop === 'function') window.stopProgressLoop(); // ⚡ Stop GPU loop
        if (dot) dot.style.opacity = '0';
    }
}

// Start the boot sequence
bootPersistentAudioEngine();

window.togglePlaylistContainer = function(btnElement) {
    const container = document.getElementById('playlistContainer');
    if (!container) return;

    const isActive = container.classList.contains('active');

    if (!isActive && btnElement) {
        const rect = btnElement.getBoundingClientRect();
        const parentRect = container.parentElement.getBoundingClientRect();
        
        const x = (rect.left + rect.width / 2) - parentRect.left;
        const y = (rect.top + rect.height / 2) - parentRect.top;

        container.style.transformOrigin = `${x}px ${y}px`;
        container.classList.add('active');
    } else {
        container.classList.remove('active');
    }
}

// --- 9. PLAYLIST ADDITION ENGINE ---
window.addToPlaylistOnly = async function() {
    const title = document.getElementById('dedicateTitle')?.value;
    const artist = document.getElementById('dedicateArtist')?.value;
    const albumArt = document.getElementById('hiddenAlbumArtUrl')?.value;
    const ytId = document.getElementById('hiddenYtId')?.value;

    if (!ytId || !albumArt) return alert("Search for a song first!");

    const finalSongData = {
        title: title,
        artist: artist,
        albumArt: albumArt,
        ytId: ytId,
        addedBy: currentUsername,
        timestamp: Date.now()
    };

    try {
        await set(ref(rtdb, `bridges/${currentBridgeId}/music/playlist/${ytId}`), finalSongData);
        
        const addBtn = document.querySelector('button[onclick*="addToPlaylistOnly"]');
        if(addBtn) {
            const originalIcon = addBtn.innerHTML;
            addBtn.innerHTML = "✅";
            addBtn.style.background = "rgba(46, 213, 115, 0.2)";
            addBtn.style.pointerEvents = "none"; 

            setTimeout(() => { 
                addBtn.innerHTML = originalIcon; 
                addBtn.style.background = "rgba(255,255,255,0.1)";
                addBtn.style.pointerEvents = "all";
            }, 2000);
        }
        
        console.log("📁 Success: Song added to playlist library.");
    } catch (e) {
        console.error("Playlist Sync Error:", e);
        alert("Database connection failed. Try again!");
    }
}

// --- 10. ROBUST PLAYLIST LIVE-FEED (WITH REMOVE OPTION) ---
window.startPlaylistListener = function() {
    const playlistRef = ref(rtdb, `bridges/${currentBridgeId}/music/playlist`);
    
    onValue(playlistRef, (snap) => {
        const listEl = document.getElementById('playlistItems');
        if (!listEl) return; 

        if (!snap.exists()) {
            listEl.innerHTML = `<p style="color:var(--text-faded); text-align:center; margin-top:60px;">Library is empty.</p>`;
            return;
        }

        let playlistArray = [];
        snap.forEach(child => {
            playlistArray.push({ id: child.key, ...child.val() });
        });

        // ⚡ ANTI-LAG FIX: Document Fragment batches all HTML changes into 1 rapid render
        listEl.innerHTML = "";
        const fragment = document.createDocumentFragment();

        playlistArray.reverse().forEach(song => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '12px';
            item.style.padding = '10px';
            item.style.marginBottom = '8px';
            item.style.borderRadius = '16px';
            item.style.background = 'rgba(255,255,255,0.03)';
            item.style.cursor = 'pointer';

            item.innerHTML = `
                <img src="${song.albumArt}" style="width: 42px; height: 42px; border-radius: 10px; object-fit: cover;" onclick='window.playFromPlaylist(${JSON.stringify(song)})'>
                
                <div style="flex: 1; overflow: hidden;" onclick='window.playFromPlaylist(${JSON.stringify(song)})'>
                    <div style="color: white; font-weight: 700; font-size: 13px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${song.title}</div>
                    <div style="color: var(--text-faded); font-size: 11px;">${song.artist}</div>
                </div>

                <button class="pro-btn" 
                        style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #ff4757; padding:0; display:flex; justify-content:center; align-items:center; border:none;" 
                        onclick="event.stopPropagation(); window.removeFromPlaylist('${song.id}')">
                    <span style="font-size: 14px;">🗑️</span>
                </button>
            `;
            fragment.appendChild(item);
        });
        
        listEl.appendChild(fragment); // Single execution paint!
    });
}

// ==========================================
// 11. PLAYLIST INTERACTION ENGINE (ROBUST)
// ==========================================

window.playFromPlaylist = async function(songData) {
    if (!songData || !songData.ytId) return console.error("Invalid Song Data");

    console.log("💿 Playlist Selection: " + songData.title);

    try {
        await update(ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`), {
            title: songData.title,
            artist: songData.artist,
            albumArt: songData.albumArt,
            ytId: songData.ytId,
            playbackState: 'playing', 
            lastActionBy: currentUsername,
            seekTime: 0,
            actionTimestamp: Date.now(),
            isHeartbeat: false,
            isScrubbing: false
        });

        if (typeof window.togglePlaylistContainer === 'function') {
            window.togglePlaylistContainer();
        }
    } catch (e) {
        console.error("Playback Sync Failed:", e);
    }
}

window.removeFromPlaylist = async function(songId) {
    if (!songId) return;

    const confirmed = confirm("Remove this track from the bridge library?");
    if (!confirmed) return;

    try {
        const songRef = ref(rtdb, `bridges/${currentBridgeId}/music/playlist/${songId}`);
        await remove(songRef);
        console.log("🗑️ Purged song ID: " + songId);
    } catch (e) {
        console.error("Purge Failed:", e);
        alert("Could not remove song. Check your connection.");
    }
}/// ==========================================
// REAL-TIME INTERACTION ENGINE (HUGS & TAPS)
// ==========================================

// 1. Sending the Pulse
window.triggerPulse = async function(type) {
    window.playPulseAnimation(type, null, false, Date.now()); // Show preview locally
    
    if (navigator.vibrate) navigator.vibrate(type === 'tap' ? 15 : [50, 100, 50]);

    try {
        if (typeof rtdb !== 'undefined' && currentBridgeId && currentUsername) {
            const pulseRef = ref(rtdb, `bridges/${currentBridgeId}/interactions`);
            await set(pulseRef, {
                type: type,
                from: currentUsername,
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.error("Pulse error:", e);
    }
};

// 2. Receiving the Pulse (The "Waiting Embrace" Upgrade)
window.initInteractionListener = function() {
    if (typeof rtdb === 'undefined' || !currentBridgeId) return;
    const pulseRef = ref(rtdb, `bridges/${currentBridgeId}/interactions`);
    
    onValue(pulseRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        // Ignore if we sent it ourselves
        if (data.from === currentUsername) return;

        // Get the timestamp of the last pulse this device actually watched
        const lastSeenPulse = parseInt(localStorage.getItem('lastSeenPulseTime') || '0');

        // If this pulse in the database is newer than the last one we saw...
        if (data.timestamp > lastSeenPulse) {
            
            // Mark it as "Seen" immediately so it doesn't loop on refresh
            localStorage.setItem('lastSeenPulseTime', data.timestamp.toString());

            // Determine if she was offline when you sent it (older than 30 seconds)
            const isMissed = (Date.now() - data.timestamp) > 30000;

            // Trigger the haptics and the visual effect, passing the exact timestamp
            if (navigator.vibrate) navigator.vibrate(data.type === 'tap' ? [30, 50, 30] : [100, 200, 100]);
            window.playPulseAnimation(data.type, data.from, isMissed, data.timestamp);
        }
    });
};
// 3. The Visual Effects & Cinematic Text Reveal (Time added to ALL scenarios)
window.playPulseAnimation = function(type, senderName, isMissed = false, timestamp = null) {
    if (document.querySelector('.pulse-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = `pulse-overlay ${type}`;
    
    // Determine the content dynamically
    let emoji = type === 'hug' ? '👻' : '👋';
    let actionText = '';
    
    // Format the time elegantly (e.g., "10:30 PM")
    // If no timestamp is provided (like a local click), use the exact current time
    const timeToUse = timestamp ? new Date(timestamp) : new Date();
    const timeString = timeToUse.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (senderName) {
        if (isMissed) {
            // THE WAITING EMBRACE: She opened the app later
            actionText = type === 'hug' 
                ? `${senderName} left a warm hug for you at ${timeString}...` 
                : `${senderName} tapped you at ${timeString}...`;
        } else {
            // REAL-TIME: She is staring at the screen right now
            actionText = type === 'hug' 
                ? `${senderName} hugged you tightly at ${timeString}...` 
                : `${senderName} is thinking of you at ${timeString}...`;
        }
    } else {
        // LOCAL SENDER PREVIEW: What you see when you click the button
        actionText = type === 'hug' 
            ? `Sending a warm hug at ${timeString}...` 
            : `Sending a gentle tap at ${timeString}...`;
    }
    
    // Inject the structured DOM
    overlay.innerHTML = `
        <div class="pulse-message">
            <div class="pulse-emoji">${emoji}</div>
            <div class="pulse-text-part">${actionText}</div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    // Ultra-smooth fade out to remove the overlay
    setTimeout(() => {
        overlay.style.transition = 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
        overlay.style.opacity = '0';
        overlay.style.backdropFilter = 'blur(0px)';
        
        // Remove from DOM after fade completes
        setTimeout(() => overlay.remove(), 1200);
    }, type === 'tap' ? 2500 : 4500); // Hugs last longer (4.5s)
};
// ==========================================
// 🚀 THE ULTIMATE REAL-TIME CHAT ENGINE
// ==========================================
// ==========================================
// 🌍 1. GLOBAL UNREAD & RECEIPT ENGINE
// ==========================================
window.activeMsgId = null;
window.activeMsgText = "";
window.partnerLastReadTime = 0;
let typingTimer;

// ==========================================
// 🌍 GLOBAL UNREAD & RECEIPT ENGINE
// ==========================================
window.initGlobalReceiptEngine = function() {
    if (typeof rtdb === 'undefined' || !currentBridgeId || !currentUsername) return;

    const msgsRef = ref(rtdb, `bridges/${currentBridgeId}/messages`);
    const myReadRef = ref(rtdb, `bridges/${currentBridgeId}/readReceipts/${currentUsername}`);
    const partnerReadRef = ref(rtdb, `bridges/${currentBridgeId}/readReceipts/${partnerUsername}`);

    // Listen to when she last read the chat
    onValue(partnerReadRef, (snap) => {
        window.partnerLastReadTime = snap.val() || 0;
        // Refresh feed if we are currently looking at it
        if (typeof window.refreshReadReceipts === 'function' && window.currentView === 'messages') {
            window.refreshReadReceipts();
        }
    });

    // Calculate Unread Badge in real-time
    onValue(myReadRef, (readSnap) => {
        const myLastRead = readSnap.val() || 0;

        onValue(msgsRef, (msgSnap) => {
            if (!msgSnap.exists()) return;
            let unreadCount = 0;
            
            msgSnap.forEach(child => {
                const msg = child.val();
                if (msg.sender !== currentUsername && msg.timestamp > myLastRead) {
                    unreadCount++;
                }
            });

            // Update Sidebar Badge (Make sure you have an element with id="messagesNavBadge" in your sidebar)
            const badge = document.getElementById('messagesNavBadge');
            if (badge) {
                if (unreadCount > 0 && window.currentView !== 'messages') {
                    badge.style.display = 'inline-block';
                    badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    });
};

// --- ⌚ INSTAGRAM TIME FORMATTER ---
window.getInstagramSeenText = function(readAtTime) {
    if (!readAtTime) return "";
    const diff = Date.now() - readAtTime;
    const mins = Math.floor(diff / 60000);
    
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    
    const days = Math.floor(hrs / 24);
    if (days === 1) return "yesterday";
    
    return `${days}d ago`;
};

// Execute global engine immediately
// window.initGlobalReceiptEngine(); // <-- Call this when Firebase initializes

// ==========================================
// 🚀 THE LOCAL CHAT ENGINE (SYNCSPACE)
// ==========================================
// ==========================================
// 🚀 2. THE LOCAL CHAT ENGINE (NOW WITH 0ms CACHE)
// ==========================================
// ==========================================
// 🚀 2. THE LOCAL CHAT ENGINE (NO-FLICKER EDITION)
// ==========================================
window.initChatEngine = function() {
    if (typeof rtdb === 'undefined' || !currentBridgeId || !currentUsername) return;

    const messagesRef = ref(rtdb, `bridges/${currentBridgeId}/messages`);
    const partnerTypingRef = ref(rtdb, `bridges/${currentBridgeId}/typing/${partnerUsername}`);
    const chatFeed = document.getElementById('chatFeed');
    const cacheKey = `syncspace_messages_${currentBridgeId}`;

    // 1. INSTANT CACHE RENDER (0ms Load Time)
    if (chatFeed) {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                const parsedCache = JSON.parse(cachedData);
                const sortedCache = Object.entries(parsedCache).sort((a, b) => a[1].timestamp - b[1].timestamp);
                
                let myLastMsgIndex = -1;
                for (let i = sortedCache.length - 1; i >= 0; i--) {
                    if (sortedCache[i][1].sender === currentUsername) {
                        myLastMsgIndex = i; break;
                    }
                }

                sortedCache.forEach(([msgId, msg], index) => {
                    renderMessage(msgId, msg, msg.sender === currentUsername, index === myLastMsgIndex);
                });
                
                chatFeed.scrollTo({ top: chatFeed.scrollHeight, behavior: 'auto' });
            } catch (e) {
                console.error("Failed to parse local cache:", e);
            }
        }
    }

    // 2. REAL-TIME FIREBASE LISTENER (Smart DOM Updates)
    onValue(messagesRef, (snapshot) => {
        const currentFeed = document.getElementById('chatFeed');
        if (!currentFeed) return;
        
        set(ref(rtdb, `bridges/${currentBridgeId}/readReceipts/${currentUsername}`), Date.now());

        if (snapshot.exists()) {
            const data = snapshot.val();
            localStorage.setItem(cacheKey, JSON.stringify(data));

            const sortedMsgs = Object.entries(data).sort((a, b) => a[1].timestamp - b[1].timestamp);
            const updates = {};
            let hasUnread = false;

            sortedMsgs.forEach(([msgId, msg]) => {
                if (msg.sender !== currentUsername && !msg.readAt) {
                    const now = Date.now();
                    updates[`${msgId}/readAt`] = now;
                    msg.readAt = now; 
                    hasUnread = true;
                }
            });

            if (hasUnread) {
                update(messagesRef, updates).catch(err => console.error("Receipt error:", err));
                localStorage.setItem(cacheKey, JSON.stringify(data)); 
            }

            let myLastMsgIndex = -1;
            for (let i = sortedMsgs.length - 1; i >= 0; i--) {
                if (sortedMsgs[i][1].sender === currentUsername) {
                    myLastMsgIndex = i; break;
                }
            }

            // ⚡ NO MORE WIPING THE DOM. Just loop and intelligently append/update.
            sortedMsgs.forEach(([msgId, msg], index) => {
                renderMessage(msgId, msg, msg.sender === currentUsername, index === myLastMsgIndex);
            });
            
            // ⚡ CLEANUP: If you unsent a message, we find it on screen and delete it
            Array.from(currentFeed.children).forEach(child => {
                const childMsgId = child.id.replace('msg-', '');
                if (!data[childMsgId]) {
                    child.style.transform = 'scale(0)';
                    child.style.opacity = '0';
                    setTimeout(() => child.remove(), 300); // Smooth exit animation
                }
            });

        } else {
            currentFeed.innerHTML = "";
            localStorage.removeItem(cacheKey);
        }
    });

    // --- REAL-TIME TYPING INDICATOR ---
    onValue(partnerTypingRef, (snapshot) => {
        const indicator = document.getElementById('typingIndicatorRow');
        const headerStatus = document.getElementById('headerTypingStatus');
        const onlineStatus = document.getElementById('headerOnlineStatus');
        
        const isTyping = snapshot.val() === true;
        if (indicator) indicator.style.display = isTyping ? 'flex' : 'none';
        if (headerStatus) headerStatus.style.display = isTyping ? 'flex' : 'none';
        if (onlineStatus) onlineStatus.style.display = isTyping ? 'none' : 'flex';
    });
};window.refreshReadReceipts = function() {
    const chatFeed = document.getElementById('chatFeed');
    if (!chatFeed) return;
    const messagesRef = ref(rtdb, `bridges/${currentBridgeId}/messages`);
    get(messagesRef).then((snapshot) => {
        if (snapshot.exists()) {
            chatFeed.innerHTML = "";
            const sortedMsgs = Object.entries(snapshot.val()).sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // ⚡ FIND THE LAST MESSAGE SENT BY ME (For refresh)
            let myLastMsgIndex = -1;
            for (let i = sortedMsgs.length - 1; i >= 0; i--) {
                if (sortedMsgs[i][1].sender === currentUsername) {
                    myLastMsgIndex = i;
                    break;
                }
            }

            sortedMsgs.forEach(([msgId, msg], index) => {
                const isMe = msg.sender === currentUsername;
                const isMyLastMessage = (index === myLastMsgIndex);
                renderMessage(msgId, msg, isMe, isMyLastMessage);
            });
            chatFeed.scrollTo({ top: chatFeed.scrollHeight, behavior: 'smooth' });
        }
    });
};

// --- TYPING BROADCASTER ---
window.handleTypingSignal = function() {
    const input = document.getElementById('chatInputMessage');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';

    if (typeof rtdb !== 'undefined' && currentBridgeId && currentUsername) {
        set(ref(rtdb, `bridges/${currentBridgeId}/typing/${currentUsername}`), true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            set(ref(rtdb, `bridges/${currentBridgeId}/typing/${currentUsername}`), false);
        }, 2000);
    }
};

// --- SEND MESSAGE FUNCTION ---
window.sendTextMessage = async function() {
    const input = document.getElementById('chatInputMessage');
    const text = input.value.trim();
    if (!text) return;

    const messagesRef = ref(rtdb, `bridges/${currentBridgeId}/messages`);
    const newMsgRef = push(messagesRef);

    try {
        await set(newMsgRef, {
            text: text,
            sender: currentUsername,
            timestamp: Date.now(),
            edited: false
        });
        
        input.value = "";
        input.style.height = 'auto';
        set(ref(rtdb, `bridges/${currentBridgeId}/typing/${currentUsername}`), false);
        set(ref(rtdb, `bridges/${currentBridgeId}/readReceipts/${currentUsername}`), Date.now()); 
        
        if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) {
        console.error("Send failed:", e);
    }
};
// --- 4. THE UI RENDERER (Now handles Images, Videos, and Voice Notes) ---
// --- 4. THE UI RENDERER (Smart DOM Reconciliation Engine) ---
function renderMessage(msgId, msg, isMe, isMyLastMessage) {
    // Hide messages older than your clear timestamp
    if (window.myChatClearedAt && msg.timestamp <= window.myChatClearedAt) return;

    const chatFeed = document.getElementById('chatFeed');
    if (!chatFeed) return;

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let statusTextHTML = "";

    if (isMe && isMyLastMessage) {
        if (msg.readAt) {
            const readDiffStr = window.getInstagramSeenText(msg.readAt);
            statusTextHTML = `<span style="margin-left: 6px; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.2); color: #32d74b; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; font-size: 9px;">Read ${readDiffStr}</span>`;
        } else {
            statusTextHTML = `<span style="margin-left: 6px; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.2); color: rgba(255, 255, 255, 0.6); font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; font-size: 9px;">Delivered</span>`;
        }
    }
    
    let mediaHTML = "";
    if (msg.mediaUrl) {
        if (msg.mediaType === 'image') {
            mediaHTML = `<img src="${msg.mediaUrl}" style="max-width: 100%; border-radius: 14px; margin-bottom: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer;" onclick="window.open(this.src, '_blank')">`;
        } else if (msg.mediaType === 'video') {
            mediaHTML = `<video src="${msg.mediaUrl}" controls style="max-width: 100%; border-radius: 14px; margin-bottom: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);"></video>`;
        } else if (msg.mediaType === 'audio') {
            mediaHTML = `<audio src="${msg.mediaUrl}" controls style="max-width: 100%; height: 35px; border-radius: 20px; outline: none; margin-bottom: 8px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)) ${isMe ? 'invert(1)' : ''};"></audio>`;
        }
    }
// ↩️ THE INSTA-STYLE REPLY SNIPPET
    let replyHTML = "";
    if (msg.replyTo) {
        replyHTML = `
            <div onclick="event.stopPropagation(); window.scrollToMessage('${msg.replyTo.id}')" 
                 style="background: rgba(0,0,0,0.15); border-left: 3px solid ${isMe ? 'rgba(255,255,255,0.7)' : '#ff2a5f'}; padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; font-size: 11px; cursor: pointer; transition: background 0.2s;">
                <strong style="color: ${isMe ? 'white' : '#ff2a5f'}; letter-spacing: 0.5px;">${msg.replyTo.sender}</strong><br>
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; max-width: 180px; opacity: 0.8;">${msg.replyTo.text}</span>
            </div>
        `;
    }

    let textHTML = msg.text ? `<span>${msg.text.replace(/`/g, '\\`').replace(/\${/g, '\\${')}</span>` : "";

    // ⚡ ADDED DATA-SWIPE TAGS FOR THE GESTURE ENGINE
    const innerContent = `
        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; max-width: 100%;">
            <div class="bubble ${isMe ? 'sent' : 'received'}" 
                 data-swipe-id="${msgId}" 
                 data-swipe-text="${msg.text ? msg.text.replace(/"/g, '&quot;').replace(/`/g, '\\`').replace(/\${/g, '\\${') : 'Media Attachment'}" 
                 data-swipe-sender="${msg.sender}"
                 onclick="window.activeMsgSender = '${msg.sender}'; window.openMessageMenu('${msgId}', \`${msg.text ? msg.text.replace(/`/g, '\\`').replace(/\${/g, '\\${') : ''}\`, ${isMe}, ${msg.timestamp})">
                ${replyHTML}
                ${mediaHTML}
                ${textHTML}
                ${msg.edited ? '<span style="font-size:10px; opacity:0.6; margin-left:6px; font-style:italic;">(edited)</span>' : ''}
                <div class="msg-time" style="display: flex; align-items: center; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; margin-top: 6px;">
                    ${time} ${statusTextHTML}
                </div>
            </div>
        </div>
    `;    // ⚡ CHECK IF MESSAGE ALREADY EXISTS ON SCREEN
    let existingRow = document.getElementById(`msg-${msgId}`);

    if (existingRow) {
        // Only update the DOM if the content actually changed (e.g. read receipt updated)
        if (existingRow.innerHTML !== innerContent) {
            existingRow.innerHTML = innerContent;
        }
    } else {
        // It's a brand new message, append it to the bottom!
        const row = document.createElement('div');
        row.id = `msg-${msgId}`; // Tag it with the Firebase ID
        row.className = `message-row ${isMe ? 'sent' : 'received'} animate-in`;
        row.innerHTML = innerContent;
        chatFeed.appendChild(row);
        
        // Only trigger smooth scroll when a NEW message physically arrives
        chatFeed.scrollTo({ top: chatFeed.scrollHeight, behavior: 'smooth' });
    }
}// --- 3D MENU INTERACTIONS ---
window.openMessageMenu = function(msgId, text, isSentByMe, timestamp) {
    if (navigator.vibrate) navigator.vibrate([20, 40]); 
    
    window.activeMsgId = msgId;
    window.activeMsgText = text;
    
    const overlay = document.getElementById('hapticMenuOverlay');
    const authorActions = document.getElementById('authorActions');
    const editBtn = document.getElementById('editBtn');

    if (isSentByMe) {
        authorActions.style.display = 'block';
        const fifteenMins = 900000;
        const isEditable = (Date.now() - timestamp) < fifteenMins;
        editBtn.style.display = isEditable ? 'flex' : 'none';
    } else {
        authorActions.style.display = 'none';
    }
    overlay.classList.add('active');
};

window.closeMessageMenu = function() {
    const overlay = document.getElementById('hapticMenuOverlay');
    if (overlay) overlay.classList.remove('active');
};

window.copySelectedMsg = function() {
    navigator.clipboard.writeText(window.activeMsgText);
    window.closeMessageMenu();
};

window.unsendSelectedMsg = async function() {
    if (!window.activeMsgId) return;
    const msgRef = ref(rtdb, `bridges/${currentBridgeId}/messages/${window.activeMsgId}`);
    await remove(msgRef);
    window.closeMessageMenu();
};

window.editSelectedMsg = function() {
    const input = document.getElementById('chatInputMessage');
    input.value = window.activeMsgText;
    input.focus();
    
    const sendBtn = document.querySelector('.send-core-btn');
    const originalOnClick = sendBtn.getAttribute('onclick');
    
    sendBtn.innerHTML = `✅`;
    const editId = window.activeMsgId; 
    
    sendBtn.onclick = async () => {
        const updatedText = input.value.trim();
        if (updatedText && updatedText !== window.activeMsgText) {
            const msgRef = ref(rtdb, `bridges/${currentBridgeId}/messages/${editId}`);
            await update(msgRef, { text: updatedText, edited: true });
        }
        input.value = "";
        sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        sendBtn.setAttribute('onclick', originalOnClick);
    };
    window.closeMessageMenu();
};
// ==========================================
// 🎙️ THE MEDIA & VOICE UPLOAD ENGINE
// ==========================================

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

window.handleMediaSelection = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Determine type
    let mediaType = 'image';
    if (file.type.startsWith('video/')) mediaType = 'video';

    await window.uploadMediaToFirebase(file, mediaType);
    event.target.value = ""; // Reset input
};
window.uploadMediaToFirebase = async function(file, mediaType) {
    if (typeof window.storage === 'undefined' || typeof window.sRef === 'undefined') {
        console.error("Firebase Storage is not initialized!");
        return;
    }

    // Safely grab UI elements (They might be null if we aren't on the Messages tab!)
    const progressContainer = document.getElementById('mediaUploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    
    if (progressContainer) progressContainer.style.display = 'flex';

    const uniqueName = `${Date.now()}_${file.name || 'voicenote.webm'}`;
    const storageReference = window.sRef(window.storage, `bridges/${currentBridgeId}/media/${uniqueName}`);

    const uploadTask = window.uploadBytesResumable(storageReference, file);

    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            // Only update UI if the elements actually exist on screen
            if (progressBar) progressBar.style.width = progress + '%';
            if (progressText) progressText.innerText = Math.round(progress) + '%';
        }, 
        (error) => {
            console.error("Upload failed:", error);
            if (progressContainer) progressContainer.style.display = 'none';
        }, 
        async () => {
            // Upload successful!
            const downloadURL = await window.getDownloadURL(uploadTask.snapshot.ref);
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
            
            const messagesRef = ref(rtdb, `bridges/${currentBridgeId}/messages`);
            await push(messagesRef, {
                text: mediaType === 'audio' && !file.name ? "" : "", // Auto-label recordings
                mediaUrl: downloadURL,
                mediaType: mediaType,
                sender: currentUsername,
                timestamp: Date.now(),
                edited: false
            });
        }
    );
};
// --- VOICE RECORDER CONTROLS ---
window.startVoiceRecord = async function() {
    if (isRecording) return;
    
    const btn = document.getElementById('voiceRecordBtn');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // standard web audio format
            if (audioBlob.size > 500) { // Make sure it's not an empty click
                await window.uploadMediaToFirebase(audioBlob, 'audio');
            }
            
            // Stop all microphone tracks to turn off the red browser light
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        
        // 🎨 UI: Make the mic button pulse red and scale up
        btn.style.background = 'rgba(255, 42, 95, 0.2)';
        btn.style.color = '#ff2a5f';
        btn.style.transform = 'scale(1.2)';
        btn.style.boxShadow = '0 0 15px rgba(255, 42, 95, 0.5)';
        if (navigator.vibrate) navigator.vibrate(20);

    } catch (err) {
        console.error("Microphone access denied:", err);
        alert("Please allow microphone access to send voice notes.");
    }
};

window.stopVoiceRecord = function() {
    if (!isRecording || !mediaRecorder) return;
    
    const btn = document.getElementById('voiceRecordBtn');
    
    mediaRecorder.stop();
    isRecording = false;
    
    // 🎨 UI: Return mic to original blue state
    btn.style.background = 'rgba(10, 132, 255, 0.15)';
    btn.style.color = '#0a84ff';
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = 'none';
    if (navigator.vibrate) navigator.vibrate(10);
};
// ==========================================
// 📞 FLAGSHIP WEBRTC CALLING ENGINE (ULTIMATE)
// ==========================================

window.peerConnection = null;
window.localStream = null;
window.remoteStream = null;
window.isCallActive = false;
window.isCallMuted = false;

// Timer & History Variables
window.callStartTime = 0;
window.callTimerInterval = null;
window.callDurationSeconds = 0;
window.currentCallId = null; 

// Recording Variables
window.callRecorder = null;
window.recordedCallChunks = [];
window.isRecordingCall = false;
window.audioContext = null;

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
window.initCallEngine = function() {
    if (typeof rtdb === 'undefined' || !currentBridgeId) return;

    const callRef = ref(rtdb, `bridges/${currentBridgeId}/call`);
    
    // 1. Listen for incoming live calls
    onValue(callRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.offer && data.caller !== currentUsername && !window.isCallActive) {
            window.callInitiator = data.caller; 
            window.callStartTime = data.timestamp;
            window.currentCallId = data.callId;
            showCallUI('Incoming Call...', true, data.caller);
        }
        if (!data && window.isCallActive) {
            handleRemoteHangup();
        }
    });

    // 2. 🔴 NEW: BACKGROUND MISSED CALL CALCULATOR
    const myHistoryReadRef = ref(rtdb, `bridges/${currentBridgeId}/callHistoryReadReceipts/${currentUsername}`);
    const callHistoryRef = ref(rtdb, `bridges/${currentBridgeId}/callHistory`);

    onValue(myHistoryReadRef, (readSnap) => {
        const myLastCheckedHistory = readSnap.val() || 0;

        onValue(callHistoryRef, (historySnap) => {
            let missedCount = 0;
            
            if (historySnap.exists()) {
                historySnap.forEach(child => {
                    const call = child.val();
                    // If she called me, it was missed (duration 0), AND it happened after I last opened the menu
                    if (call.caller !== currentUsername && call.duration === 0 && call.timestamp > myLastCheckedHistory) {
                        missedCount++;
                    }
                });
            }
            
            // Inject to the UI
            const badge = document.getElementById('missedCallBadge');
            if (badge) {
                if (missedCount > 0) {
                    badge.style.display = 'flex';
                    badge.innerText = missedCount > 9 ? '9+' : missedCount;
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    });
};window.startAudioCall = async function() {
    showCallUI('Calling...', false, partnerUsername);
    window.isCallActive = true;
    window.currentCallId = `call_${Date.now()}`;
    window.callInitiator = currentUsername;

    // ⚡ THE FIX: PRE-LOG THE CALL AS MISSED (DURATION 0) IMMEDIATELY
    set(ref(rtdb, `bridges/${currentBridgeId}/callHistory/${window.currentCallId}`), {
        caller: currentUsername,
        duration: 0,
        timestamp: Date.now()
    });

    try {
        window.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        document.getElementById('localAudio').srcObject = window.localStream;

        window.peerConnection = new RTCPeerConnection(servers);
        window.localStream.getTracks().forEach(track => window.peerConnection.addTrack(track, window.localStream));

        window.peerConnection.ontrack = (event) => {
            window.remoteStream = event.streams[0];
            document.getElementById('remoteAudio').srcObject = window.remoteStream;
            triggerCallConnectedUI();
        };

        window.peerConnection.onicecandidate = (event) => {
            if (event.candidate) push(ref(rtdb, `bridges/${currentBridgeId}/call/callerCandidates`), event.candidate.toJSON());
        };

        const offerDescription = await window.peerConnection.createOffer();
        await window.peerConnection.setLocalDescription(offerDescription);

        await set(ref(rtdb, `bridges/${currentBridgeId}/call`), {
            callId: window.currentCallId,
            offer: { type: offerDescription.type, sdp: offerDescription.sdp },
            caller: currentUsername,
            timestamp: Date.now()
        });

        onValue(ref(rtdb, `bridges/${currentBridgeId}/call/answer`), (snapshot) => {
            const answer = snapshot.val();
            if (answer && !window.peerConnection.currentRemoteDescription) {
                const answerDescription = new RTCSessionDescription(answer);
                window.peerConnection.setRemoteDescription(answerDescription);
            }
        });

        onChildAdded(ref(rtdb, `bridges/${currentBridgeId}/call/calleeCandidates`), (snapshot) => {
            window.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
        });

    } catch (error) {
        console.error("Call failed:", error);
        alert("Microphone access required.");
        hangUpCall();
    }
};
window.answerCall = async function() {
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('callStatusText').innerText = 'Connecting...';
    window.isCallActive = true;

    try {
        window.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        document.getElementById('localAudio').srcObject = window.localStream;

        window.peerConnection = new RTCPeerConnection(servers);
        window.localStream.getTracks().forEach(track => window.peerConnection.addTrack(track, window.localStream));

        window.peerConnection.ontrack = (event) => {
            window.remoteStream = event.streams[0];
            document.getElementById('remoteAudio').srcObject = window.remoteStream;
            triggerCallConnectedUI();
        };

        window.peerConnection.onicecandidate = (event) => {
            if (event.candidate) push(ref(rtdb, `bridges/${currentBridgeId}/call/calleeCandidates`), event.candidate.toJSON());
        };

        const callSnapshot = await get(ref(rtdb, `bridges/${currentBridgeId}/call`));
        const callData = callSnapshot.val();

        await window.peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
        const answerDescription = await window.peerConnection.createAnswer();
        await window.peerConnection.setLocalDescription(answerDescription);

        await set(ref(rtdb, `bridges/${currentBridgeId}/call/answer`), { type: answerDescription.type, sdp: answerDescription.sdp });

        onChildAdded(ref(rtdb, `bridges/${currentBridgeId}/call/callerCandidates`), (snapshot) => {
            window.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
        });

    } catch (error) {
        console.error("Answer failed:", error);
        hangUpCall();
    }
};

// --- ⏱️ CALL TIMER & UI UPDATES ---
function triggerCallConnectedUI() {
    document.getElementById('callStatusText').innerText = 'Connected 🎙️';
    document.getElementById('muteCallBtn').style.display = 'flex';
    document.getElementById('recordCallBtn').style.display = 'flex';
    document.getElementById('callTimerDisplay').style.display = 'block';
    
    window.callStartTime = Date.now();
    window.callDurationSeconds = 0;
    
    window.callTimerInterval = setInterval(() => {
        window.callDurationSeconds = Math.floor((Date.now() - window.callStartTime) / 1000);
        const mins = String(Math.floor(window.callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(window.callDurationSeconds % 60).padStart(2, '0');
        document.getElementById('callTimerDisplay').innerText = `${mins}:${secs}`;
    }, 1000);
}

// --- 🎛️ ADVANCED CONTROLS (Mute & Record) ---
window.toggleCallMute = function() {
    if (!window.localStream) return;
    window.isCallMuted = !window.isCallMuted;
    window.localStream.getAudioTracks()[0].enabled = !window.isCallMuted;
    
    const muteBtn = document.getElementById('muteCallBtn');
    muteBtn.classList.toggle('active', window.isCallMuted);
    muteBtn.innerText = window.isCallMuted ? '🔇' : '🎙️';
};
// --- 🎛️ ADVANCED CONTROLS (Recording) ---
window.toggleCallRecording = function() {
    const recordBtn = document.getElementById('recordCallBtn');
    const indicator = document.getElementById('recordingIndicator');

    if (window.isRecordingCall) {
        window.callRecorder.stop();
        window.isRecordingCall = false;
        recordBtn.classList.remove('active');
        indicator.style.display = 'none';
        return;
    }

    if (!window.localStream || !window.remoteStream) {
        alert("Both streams must be connected to record."); return;
    }

    window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const dest = window.audioContext.createMediaStreamDestination();
    
    const localSource = window.audioContext.createMediaStreamSource(window.localStream);
    const remoteSource = window.audioContext.createMediaStreamSource(window.remoteStream);
    
    localSource.connect(dest);
    remoteSource.connect(dest);

    window.callRecorder = new MediaRecorder(dest.stream);
    window.recordedCallChunks = [];

    window.callRecorder.ondataavailable = e => { if (e.data.size > 0) window.recordedCallChunks.push(e.data); };
    
    window.callRecorder.onstop = async () => {
        // ⚡ FIX: We package it securely and pass a fake name so it processes flawlessly
        const audioBlob = new Blob(window.recordedCallChunks, { type: 'audio/webm' });
        audioBlob.name = `Call_Recording_${Date.now()}.webm`; 
        await window.uploadMediaToFirebase(audioBlob, 'audio'); 
    };

    window.callRecorder.start();
    window.isRecordingCall = true;
    recordBtn.classList.add('active');
    indicator.style.display = 'block';
};

window.hangUpCall = function() {
    terminateCallNetwork();};
function handleRemoteHangup() {terminateCallNetwork();}
function terminateCallNetwork() {
    clearInterval(window.callTimerInterval);
    if (window.isRecordingCall) window.toggleCallRecording(); 
    if (window.currentCallId && window.callDurationSeconds > 0) {
        update(ref(rtdb, `bridges/${currentBridgeId}/callHistory/${window.currentCallId}`), {
            duration: window.callDurationSeconds});}
    if (window.peerConnection) window.peerConnection.close();
    if (window.localStream) window.localStream.getTracks().forEach(track => track.stop());
    if (typeof rtdb !== 'undefined' && currentBridgeId) remove(ref(rtdb, `bridges/${currentBridgeId}/call`));
    resetCallUI();}
function logCallHistory() {
    if (!currentBridgeId || !window.currentCallId || !window.callInitiator) return;
    const duration = window.callDurationSeconds || 0;
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/callHistory/${window.currentCallId}`);
    set(historyRef, {
        caller: window.callInitiator, 
        duration: duration,
        timestamp: window.callStartTime || Date.now()});}
function showCallUI(statusText, isIncoming, callerName) {
    const overlay = document.getElementById('activeCallOverlay');
    document.getElementById('callStatusText').innerText = statusText;
    document.getElementById('callPartnerName').innerText = callerName || partnerUsername;
    document.getElementById('answerCallBtn').style.display = isIncoming ? 'block' : 'none';
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);}
function resetCallUI() {
    const overlay = document.getElementById('activeCallOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 400);
    document.getElementById('muteCallBtn').style.display = 'none';
    document.getElementById('recordCallBtn').style.display = 'none';
    document.getElementById('callTimerDisplay').style.display = 'none';
    document.getElementById('callTimerDisplay').innerText = "00:00";
    window.isCallActive = false;
    window.peerConnection = null;
    window.localStream = null;
    window.remoteStream = null;
    window.isCallMuted = false;
    window.callDurationSeconds = 0;}
window.openCallHistory = function() {
    document.getElementById('callHistoryModal').classList.add('active');
    const list = document.getElementById('callHistoryList');
    list.innerHTML = `<p style="text-align:center; color: var(--text-faded);">Loading logs...</p>`;
    onValue(ref(rtdb, `bridges/${currentBridgeId}/callHistory`), (snapshot) => {
        if (!snapshot.exists()) {
            list.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-faded);">
                                <span style="font-size: 30px; display:block; margin-bottom: 10px;">📭</span>
                                No past calls found.
                              </div>`;
            return;}
        const historyArray = Object.entries(snapshot.val()).sort((a,b) => b[1].timestamp - a[1].timestamp);
        list.innerHTML = "";
        historyArray.forEach(([callKey, call]) => {
            const timeStr = new Date(call.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const mins = Math.floor(call.duration / 60);
            const secs = call.duration % 60;
            const durationStr = call.duration > 0 ? `${mins}m ${secs}s` : "";
            const isMeCaller = call.caller === currentUsername;
            let icon = ""; let color = ""; let displayType = "";
            if (call.duration === 0) {
            if (isMeCaller) {displayType = "Canceled"; icon = "🚫"; color = "rgba(255,255,255,0.5)";
            } else {displayType = "Missed"; icon = "❌"; color = "#ff3b30";}
            } else if (isMeCaller) {displayType = "Outgoing"; icon = "↗️"; color = "#0a84ff";} 
            else {displayType = "Incoming"; icon = "↙️"; color = "#32d74b";}
            list.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 20px;">${icon}</span>
                        <div><div style="font-size: 14px; font-weight: 600; color: ${color};">${displayType} Call</div>
                            <div style="font-size: 11px; color: var(--text-faded);">${timeStr}</div></div></div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-size: 13px; font-weight: 700; color: white;">${durationStr || displayType}</span>
                        <button class="icon-btn-pro" data-tip="Delete Record" style="width: 28px; height: 28px; background: rgba(255,59,48,0.1); color: #ff3b30; border-radius: 6px;" onclick="window.deleteCallLog('${callKey}')">🗑️</button>
                    </div></div>`;});});};
window.deleteCallLog = async function(callKey) {
    if (confirm("Delete this call record?")) {
        await remove(ref(rtdb, `bridges/${currentBridgeId}/callHistory/${callKey}`));
        if (navigator.vibrate) navigator.vibrate(10);}};
window.clearAllCallHistory = async function() {
    if (confirm("Are you sure you want to permanently clear the entire call history?")) {
        await remove(ref(rtdb, `bridges/${currentBridgeId}/callHistory`));
        if (navigator.vibrate) navigator.vibrate([10, 20]);}};
window.ytCinemaPlayer = null;
window.isCinemaPlayingLocally = false;
window.cinemaDriftThreshold = 1.5; 
window.currentCinemaMode = 'solo'; 
window.selectedYtData = null; 
window.isCinemaRemoteControl = false; 
window.latestCinemaData = null;
window.cinemaFirebaseListenerActive = false; 
window.YOUTUBE_API_KEY = "AIzaSyDyU-K6yp6iNhpwF0GOfmHsnj8_qHMYhCo"; 

// --- 0. HELPER FIXES ---
window.formatTheaterLayout = function(isShort) {
    const frame = document.getElementById('cinemaVideoFrame');
    if (frame) {
        if (isShort) frame.classList.add('is-short');
        else frame.classList.remove('is-short');
    }
};

// ==========================================
// 📡 THE SINGLE GLOBAL BRAIN (Replaces all previous listeners)
// ==========================================
window.bootTwinVisionMatrix = function() {
    if (typeof rtdb === 'undefined' || !currentBridgeId || window.cinemaFirebaseListenerActive) return;
    window.cinemaFirebaseListenerActive = true;

    const cinemaRef = ref(rtdb, `bridges/${currentBridgeId}/cinema/nowWatching`);
    
    onValue(cinemaRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        window.latestCinemaData = data;

        // 1. Ignore if WE are the ones who pressed the button
        if (data.lastActionBy === currentUsername) return;

        // 2. 🛡️ IF WE ARE NOT IN SYNC MODE: Show the Tune-In Modal
        if (window.currentCinemaMode !== 'sync') {
            if (data.playbackState === 'playing') {
                const joinModal = document.getElementById('cinemaSyncJoinModal');
                const joinTitle = document.getElementById('cinemaSyncJoinTitle');
                if (joinTitle) joinTitle.innerText = `${data.lastActionBy} started a Watch Party`;
                if (joinModal) joinModal.classList.add('active');
            }
            return; // 🛑 Stop here. Do not touch their local video player!
        }

        // 3. 🍿 IF WE ARE IN SYNC MODE: Perfectly mimic the partner's screen
        if (window.ytCinemaPlayer && typeof window.ytCinemaPlayer.loadVideoById === 'function') {
            
            window.isCinemaRemoteControl = true; // 🔒 Lock the Echo Chamber

            // Did the video change?
            const currentUrl = window.ytCinemaPlayer.getVideoUrl();
            if (data.ytId && (!currentUrl || !currentUrl.includes(data.ytId))) {
                window.ytCinemaPlayer.loadVideoById(data.ytId);
                window.formatTheaterLayout(data.isShort);
            }

            // Sync Timeline Physics
            const isPlayingRemote = data.playbackState === 'playing';
            const timePassed = isPlayingRemote ? (Date.now() - data.actionTimestamp) / 1000 : 0;
            const targetSeekTime = data.seekTime + timePassed;
            const localCurrentTime = window.ytCinemaPlayer.getCurrentTime() || 0;
            const drift = Math.abs(localCurrentTime - targetSeekTime);

            if (data.isScrubbing || drift > window.cinemaDriftThreshold) {
                window.ytCinemaPlayer.seekTo(targetSeekTime, true);
                if (typeof window.updateCinemaSyncStatus === 'function') window.updateCinemaSyncStatus('synced');
            }

            // Sync Play/Pause
            if (isPlayingRemote) {
                window.ytCinemaPlayer.playVideo();
                window.isCinemaPlayingLocally = true;
            } else {
                window.ytCinemaPlayer.pauseVideo();
                window.isCinemaPlayingLocally = false;
            }
            
            const btn = document.getElementById('cinemaPlayPauseBtn');
            if(btn) btn.innerText = window.isCinemaPlayingLocally ? "⏸️" : "▶️";

            // 🔓 Unlock the Echo Chamber after YouTube reacts
            setTimeout(() => { window.isCinemaRemoteControl = false; }, 500);
        }
    });
};

// --- 1. LOCAL PLAYER INITIALIZATION ---
window.initCinemaEngine = function() {
    const safeOrigin = window.location.hostname === '' ? 'http://localhost' : window.location.origin;

    if (window.YT && window.YT.Player && !window.ytCinemaPlayer) {
        window.ytCinemaPlayer = new YT.Player('ytCinemaPlayer', {
            height: '100%', width: '100%', 
            host: 'https://www.youtube-nocookie.com',
            playerVars: { 
                'autoplay': 0, 'controls': 1, 'rel': 0, 
                'modestbranding': 1, 'disablekb': 0, 
                'enablejsapi': 1, 'origin': safeOrigin
            },
            events: {
                'onReady': () => {
                    console.log("🍿 TwinVision Player Ready.");
                    // If they accepted an invite while the tab was loading, jump in immediately!
                    if (window.currentCinemaMode === 'sync' && window.latestCinemaData) {
                        const d = window.latestCinemaData;
                        window.isCinemaRemoteControl = true;
                        window.formatTheaterLayout(d.isShort);
                        window.ytCinemaPlayer.loadVideoById(d.ytId);
                        const timePassed = (Date.now() - d.actionTimestamp) / 1000;
                        window.ytCinemaPlayer.seekTo(d.seekTime + timePassed, true);
                        if (d.playbackState === 'playing') window.ytCinemaPlayer.playVideo();
                        setTimeout(() => { window.isCinemaRemoteControl = false; }, 1000);
                    }
                },
                'onStateChange': window.onCinemaStateChange,
                'onError': (e) => {
                    if (e.data === 150 || e.data === 101) alert("⚠️ Creator blocked embedding. Try another video!");
                }
            }
        });
    } else if (window.ytCinemaPlayer && window.ytCinemaPlayer.getIframe) {
        document.getElementById('ytCinemaPlayer').replaceWith(window.ytCinemaPlayer.getIframe());
    }
};

// --- 2. THE LOCAL ACTION CATCHER ---
window.onCinemaStateChange = function(event) {
    if (!currentBridgeId) return;

    if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) {
        window.isCinemaPlayingLocally = (event.data === YT.PlayerState.PLAYING);
        const btn = document.getElementById('cinemaPlayPauseBtn');
        if (btn) btn.innerText = window.isCinemaPlayingLocally ? "⏸️" : "▶️";
        
        const glow = document.getElementById('cinemaAmbientGlow');
        if (glow) {
            if (window.isCinemaPlayingLocally) glow.classList.add('active');
            else glow.classList.remove('active');
        }

        // 🛑 THE ECHO KILLER: Abort if Firebase pushed this button!
        if (window.isCinemaRemoteControl) return;

        // 📡 BROADCAST TO LAVANYA: Only if we are synced and WE clicked it!
        if (window.currentCinemaMode === 'sync') {
            update(ref(rtdb, `bridges/${currentBridgeId}/cinema/nowWatching`), {
                playbackState: window.isCinemaPlayingLocally ? 'playing' : 'paused',
                lastActionBy: currentUsername,
                seekTime: window.ytCinemaPlayer.getCurrentTime(),
                actionTimestamp: Date.now(),
                isScrubbing: false
            });
        }
    }
    if (event.data === YT.PlayerState.BUFFERING && window.currentCinemaMode === 'sync') {
        if(typeof window.updateCinemaSyncStatus === 'function') window.updateCinemaSyncStatus('buffering');
    }
};

// --- 3. UI CONTROLS & CONTEXT MENUS ---
window.openCinemaActionSheet = function(ytId, title, thumb, isShort) {
    window.selectedYtData = { ytId, title, thumb, isShort };
    document.getElementById('actionSheetTitle').innerText = title;
    const thumbEl = document.getElementById('actionSheetThumb');
    if (thumbEl) thumbEl.src = thumb; 
    document.getElementById('cinemaActionSheet').classList.add('active');
};

window.closeCinemaActionSheet = function() {
    const sheet = document.getElementById('cinemaActionSheet');
    if (sheet) sheet.classList.remove('active');
    window.selectedYtData = null;
};

window.executeCinemaAction = async function(action) {
    if (!window.selectedYtData) return;
    const { ytId, title, thumb, isShort } = window.selectedYtData;
    window.closeCinemaActionSheet();

    if (action === 'save') {
        await push(ref(rtdb, `bridges/${currentBridgeId}/cinema/watchLater`), {
            ytId, title, thumb, isShort, addedBy: currentUsername, timestamp: Date.now()
        });
        alert("Saved to Watch Later!");
        return;
    }

    push(ref(rtdb, `bridges/${currentBridgeId}/cinema/history`), {
        ytId, title, thumb, isShort, watchedBy: currentUsername, timestamp: Date.now()
    });

    document.getElementById('cinemaResultsGrid').style.display = 'none';
    document.getElementById('cinemaTheaterStage').style.display = 'flex';
    window.formatTheaterLayout(isShort);

    window.currentCinemaMode = action; // Set our mode!

    if (action === 'solo') {
        window.updateCinemaSyncStatus('solo');
        window.ytCinemaPlayer.loadVideoById(ytId);
        window.ytCinemaPlayer.playVideo();
    } else if (action === 'sync') {
        window.updateCinemaSyncStatus('synced');
        
        window.ytCinemaPlayer.loadVideoById(ytId);
        window.ytCinemaPlayer.playVideo(); 

        update(ref(rtdb, `bridges/${currentBridgeId}/cinema/nowWatching`), {
            ytId: ytId, videoTitle: title, playbackState: 'playing',
            lastActionBy: currentUsername, seekTime: 0, actionTimestamp: Date.now(), 
            isScrubbing: true, isShort: isShort
        });
    }
};

window.acceptCinemaJoin = function() {
    const modal = document.getElementById('cinemaSyncJoinModal');
    if (modal) modal.classList.remove('active');
    
    // 1. Lock into Sync mode IMMEDIATELY
    window.currentCinemaMode = 'sync'; 
    window.updateCinemaSyncStatus('synced');
    
    // 2. Force UI shift
    if (typeof loadView === 'function') loadView('cinema');
    
    setTimeout(() => {
        document.getElementById('cinemaResultsGrid').style.display = 'none';
        document.getElementById('cinemaTheaterStage').style.display = 'flex';
        
        // 3. Force catch-up if player is already built
        const d = window.latestCinemaData; 
        if (d && window.ytCinemaPlayer && typeof window.ytCinemaPlayer.loadVideoById === 'function') {
            window.isCinemaRemoteControl = true; 
            window.formatTheaterLayout(d.isShort);
            window.ytCinemaPlayer.loadVideoById(d.ytId);
            const timePassed = (Date.now() - d.actionTimestamp) / 1000;
            window.ytCinemaPlayer.seekTo(d.seekTime + timePassed, true);
            if (d.playbackState === 'playing') window.ytCinemaPlayer.playVideo();

            setTimeout(() => { window.isCinemaRemoteControl = false; }, 1000);
        }
    }, 400); // Slight delay for DOM rendering
};

window.updateCinemaSyncStatus = function(status) {
    const badge = document.getElementById('cinemaSyncStatus');
    const forceBtn = document.getElementById('cinemaForceSyncBtn');
    if (!badge) return;
    
    if (status === 'solo') {
        badge.innerHTML = `<span class="pulse-dot" style="background: #0a84ff;"></span> <span style="font-size: 12px; font-weight: 600;">Watching Solo</span>`;
        badge.style.background = 'rgba(255,255,255,0.05)'; badge.style.color = 'white';
        if(forceBtn) forceBtn.style.display = 'none';
    } else if (status === 'synced') {
        badge.innerHTML = `<span class="pulse-dot" style="background: #32d74b;"></span> <span style="font-size: 12px; font-weight: 600;">Synced </span>`;
        badge.style.background = 'rgba(50, 215, 75, 0.15)'; badge.style.color = '#32d74b';
        if(forceBtn) forceBtn.style.display = 'flex';
    } else if (status === 'buffering') {
        badge.innerHTML = `<span class="pulse-dot" style="background: #ff3b30;"></span> <span style="font-size: 12px; font-weight: 600;">Buffering (Desync)</span>`;
        badge.style.background = 'rgba(255, 59, 48, 0.15)'; badge.style.color = '#ff3b30';
    }
};

window.closeTheaterAndBrowse = function() {
    if (window.ytCinemaPlayer) window.ytCinemaPlayer.pauseVideo();
    window.currentCinemaMode = 'solo'; 
    document.getElementById('cinemaTheaterStage').style.display = 'none';
    document.getElementById('cinemaResultsGrid').style.display = 'grid';
};

window.toggleCinemaPlayback = function() {
    if (!window.ytCinemaPlayer) return;
    if (window.isCinemaPlayingLocally) window.ytCinemaPlayer.pauseVideo();
    else window.ytCinemaPlayer.playVideo();
};

window.forceCinemaSync = function() {
    if (!window.ytCinemaPlayer || window.currentCinemaMode !== 'sync') return;
    update(ref(rtdb, `bridges/${currentBridgeId}/cinema/nowWatching`), {
        playbackState: window.isCinemaPlayingLocally ? 'playing' : 'paused',
        lastActionBy: currentUsername,
        seekTime: window.ytCinemaPlayer.getCurrentTime(),
        actionTimestamp: Date.now(),
        isScrubbing: true
    });
    window.updateCinemaSyncStatus('synced');
};

// --- 4. DYNAMIC PILLS (HISTORY & SEARCH) ---
window.cinemaInterests = JSON.parse(localStorage.getItem('twinVisionInterests')) || [
    'For You', '📱 Shorts', 'Web Dev & CSS', 'IoT & Arduino Projects'
];

window.renderCinemaPills = function() {
    const container = document.getElementById('cinemaPills');
    if (!container) return;
    container.innerHTML = '';

    window.cinemaInterests.forEach((interest, index) => {
        let query = interest === 'For You' ? 'Trending Web Dev and Design UI UX' : interest;
        if (interest === '📱 Shorts') query = '#shorts trending';
        let pillClass = index === 0 ? 'cat-pill active' : 'cat-pill';
        if (interest === '📱 Shorts') pillClass += ' shorts';
        container.innerHTML += `<div class="${pillClass}" onclick="window.loadCinemaFeed(this, '${query}')">${interest}</div>`;
    });

    container.innerHTML += `<div class="cat-pill action-pill" onclick="window.fetchCinemaHistory(this, 'watchLater')">🔖 Watch Later</div>`;
    container.innerHTML += `<div class="cat-pill action-pill" onclick="window.fetchCinemaHistory(this, 'history')">🕒 History</div>`;
    container.innerHTML += `<div class="cat-pill action-pill" onclick="window.addNewInterest()" style="border-style: dashed;">+ Add Topic</div>`;
    
    if (container.children[0]) window.loadCinemaFeed(container.children[0], 'Trending Web Dev and Design UI UX');
};

window.addNewInterest = function() {
    const newTopic = prompt("Enter a new topic to follow:");
    if (newTopic && newTopic.trim() !== '') {
        window.cinemaInterests.push(newTopic.trim());
        localStorage.setItem('twinVisionInterests', JSON.stringify(window.cinemaInterests));
        window.renderCinemaPills();
    }
};

window.loadCinemaFeed = function(pillElement, query) {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pillElement.classList.add('active');
    window.searchYouTubeAPI(query);
};

window.fetchCinemaHistory = function(pillElement, type) {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pillElement.classList.add('active');
    
    const grid = document.getElementById('cinemaResultsGrid');
    document.getElementById('cinemaTheaterStage').style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: white;">Loading...</div>`;

    onValue(ref(rtdb, `bridges/${currentBridgeId}/cinema/${type}`), (snap) => {
        grid.innerHTML = ""; 
        if (!snap.exists()) {
            grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-faded);">No videos found here yet.</p>`;
            return;
        }

        let items = [];
        snap.forEach(child => items.push(child.val()));
        items.reverse(); 

        items.forEach(item => {
            const dateStr = new Date(item.timestamp).toLocaleDateString();
            grid.innerHTML += `
                <div class="yt-card" onclick="window.openCinemaActionSheet('${item.ytId}', \`${item.title.replace(/`/g, "")}\`, '${item.thumb}', ${item.isShort})">
                    <img src="${item.thumb}" class="yt-thumb ${item.isShort ? 'is-short' : ''}">
                    <div class="yt-info">
                        <div class="yt-title">${item.title}</div>
                        <div class="yt-channel">${type === 'history' ? `Watched by ${item.watchedBy} • ${dateStr}` : `Saved by ${item.addedBy}`}</div>
                    </div>
                </div>
            `;
        });
    }, { onlyOnce: true });
};

window.searchYouTubeAPI = async function(customQuery = null) {
    const query = customQuery || document.getElementById('cinemaSearchInput')?.value.trim();
    if (!query) return;

    const ytMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        const ytId = ytMatch[1];
        window.openCinemaActionSheet(ytId, "Shared Video Link", `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`, false);
        return;
    }

    const isShortsQuery = query.toLowerCase().includes('shorts');
    const grid = document.getElementById('cinemaResultsGrid');
    document.getElementById('cinemaTheaterStage').style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 100px 20px; color: white;"><span class="pulse-dot" style="width: 15px; height: 15px; background: #ff2a5f; margin: 0 auto 15px auto;"></span><h3 style="font-weight: 600;">Curating Feed...</h3></div>`;

    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${isShortsQuery ? 20 : 12}&q=${encodeURIComponent(query)}&type=video&key=${window.YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        
        grid.innerHTML = ""; 
        if (!data.items || data.items.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-faded);">No videos found.</p>`;
            return;
        }

        data.items.forEach(item => {
            const ytId = item.id.videoId;
            const title = item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            const channel = item.snippet.channelTitle;
            const thumbUrl = item.snippet.thumbnails.high.url;

            grid.innerHTML += `
                <div class="yt-card" onclick="window.openCinemaActionSheet('${ytId}', \`${title.replace(/`/g, "")}\`, '${thumbUrl}', ${isShortsQuery})">
                    <img src="${thumbUrl}" class="yt-thumb ${isShortsQuery ? 'is-short' : ''}">
                    <div class="yt-info">
                        <div class="yt-title">${title}</div>
                        <div class="yt-channel">${isShortsQuery ? '📱' : '📺'} ${channel}</div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("YouTube Search Failed:", error);
    }
};

// ⚡ AUTO-BOOT THE MATRIX
setTimeout(() => {
    if (typeof window.bootTwinVisionMatrix === 'function') window.bootTwinVisionMatrix();
}, 1500);

window.forceCinemaSync = function() {
    if (!window.ytCinemaPlayer || window.currentCinemaMode !== 'sync') return;
    update(ref(rtdb, `bridges/${currentBridgeId}/cinema/nowWatching`), {
        playbackState: window.isCinemaPlayingLocally ? 'playing' : 'paused',
        lastActionBy: currentUsername,
        seekTime: window.ytCinemaPlayer.getCurrentTime(),
        actionTimestamp: Date.now(),
        isScrubbing: true
    });
    updateCinemaSyncStatus('synced');
};
window.formatTheaterLayout = function(isShort) {
    const frame = document.getElementById('cinemaVideoFrame');
    if (frame) {
        if (isShort) frame.classList.add('is-short');
        else frame.classList.remove('is-short');
    }
};// ==========================================
// 🌟 GLOBAL CENTERED CONTEXT MENU 
// ==========================================
// ==========================================
// 🌟 GLOBAL CINEMA MODALS (ACTION SHEET & TUNE-IN)
// ==========================================
function initGlobalCinemaModals() {
    if (!document.getElementById('cinemaActionSheet')) {
        const modalsContainer = document.createElement('div');
        modalsContainer.innerHTML = `
            <style>
                .action-sheet-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.7); backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%);
                    z-index: 9999999; display: flex; justify-content: center; align-items: center;
                    opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s;
                }
                .action-sheet-overlay.active { opacity: 1; visibility: visible; }
                
                .premium-context-menu {
                    background: rgba(18, 18, 22, 0.85); width: 90%; max-width: 340px;
                    border-radius: 24px; overflow: hidden;
                    transform: scale(0.9) translateY(20px); opacity: 0; 
                    transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
                    border: 1px solid rgba(255,255,255,0.1); 
                    box-shadow: 0 40px 80px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.15);
                    display: flex; flex-direction: column; position: relative;
                }
                .action-sheet-overlay.active .premium-context-menu { transform: scale(1) translateY(0); opacity: 1; }
                
                .context-header { position: relative; height: 140px; width: 100%; overflow: hidden; }
                .context-thumb-bg { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.5) blur(3px); transform: scale(1.1); transition: all 0.5s ease; }
                .context-overlay { position: absolute; bottom: 0; left: 0; width: 100%; padding: 20px 15px 15px 15px; background: linear-gradient(to top, rgba(18, 18, 22, 1) 0%, rgba(18, 18, 22, 0.6) 60%, transparent 100%); box-sizing: border-box; }
                .context-title { color: white; font-size: 15px; font-weight: 600; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
                
                .context-close-btn { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%; color: white; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s; backdrop-filter: blur(10px); }
                .context-close-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
                
                .context-actions { padding: 10px; display: flex; flex-direction: column; gap: 4px; }
                .ctx-btn { width: 100%; padding: 14px 16px; background: transparent; border: none; color: #E8E8ED; font-size: 15px; font-weight: 500; border-radius: 14px; font-family: inherit; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: flex-start; gap: 14px; }
                .ctx-btn:hover { background: rgba(255,255,255,0.06); color: white; }
                .ctx-btn svg { width: 20px; height: 20px; opacity: 0.7; transition: opacity 0.2s; }
                .ctx-btn:hover svg { opacity: 1; }
                
                .ctx-btn.sync-primary { color: white; background: rgba(255,42,95,0.1); }
                .ctx-btn.sync-primary svg { color: #ff2a5f; opacity: 1; }
                .ctx-btn.sync-primary:hover { background: rgba(255,42,95,0.2); }
            </style>
            
            <div id="cinemaActionSheet" class="action-sheet-overlay" onclick="window.closeCinemaActionSheet()">
                <div class="premium-context-menu" onclick="event.stopPropagation()">
                    <div class="context-header">
                        <img id="actionSheetThumb" src="" class="context-thumb-bg">
                        <div class="context-overlay">
                            <h4 id="actionSheetTitle" class="context-title"></h4>
                        </div>
                        <button class="context-close-btn" onclick="window.closeCinemaActionSheet()">✕</button>
                    </div>
                    <div class="context-actions">
                        <button class="ctx-btn sync-primary" onclick="window.executeCinemaAction('sync')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            Watch together
                        </button>
                        <button class="ctx-btn" onclick="window.executeCinemaAction('solo')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Watch Solo
                        </button>
                        <button class="ctx-btn" onclick="window.executeCinemaAction('save')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                            Save for Later
                        </button>
                    </div>
                </div>
            </div>

            <div id="cinemaSyncJoinModal" class="action-sheet-overlay" onclick="window.closeSyncJoinModal()">
                <div class="premium-context-menu" style="text-align: center; padding: 40px 30px; align-items: center;" onclick="event.stopPropagation()">
                    <div style="font-size: 50px; margin-bottom: 15px; filter: drop-shadow(0 10px 20px rgba(255,42,95,0.4));">🍿</div>
                    <h3 id="cinemaSyncJoinTitle" style="margin-top:0; margin-bottom: 10px; color: white; font-weight: 700; font-size: 18px; line-height: 1.3;">.. is at the Cinema</h3>
                    <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 30px; line-height: 1.5;">Do you want to tune in and watch together?</p>
                    <div style="display: flex; gap: 12px; width: 100%;">
                        <button class="ctx-btn sync-primary" style="flex: 1; justify-content: center; font-weight: 600; border-radius: 12px;" onclick="window.acceptCinemaJoin()">Tune In</button>
                        <button class="ctx-btn" style="flex: 1; justify-content: center; background: rgba(255,255,255,0.1); border-radius: 12px;" onclick="window.closeSyncJoinModal()">Later</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalsContainer);
    }
}

// Logic to let user dismiss the tune-in modal
window.closeSyncJoinModal = function() {
    const modal = document.getElementById('cinemaSyncJoinModal');
    if (modal) modal.classList.remove('active');
};

// Boot them immediately
initGlobalCinemaModals();
// ==========================================
// 📸 TWINCALL V2: INSTAGRAM-TIER WEBRTC ENGINE
// ==========================================

window.igPeerConnection = null;
window.igLocalStream = null;
window.igRemoteStream = null;
window.isCallActive = false;
window.igListenerActive = false;

const rtcConfig = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

// --- 1. THE UI INJECTOR (FULL SCREEN IG STYLE) ---
window.initIGCallUI = function() {
    if (!document.getElementById('igCallScreen')) {
        const uiContainer = document.createElement('div');
        uiContainer.innerHTML = `
            <style>
                /* 💎 FULL SCREEN CALL UI (Premium One UI 9 / iOS Level) */
                .ig-call-overlay {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: #030305; z-index: 999999999; display: none; flex-direction: column;
                    font-family: 'Poppins', sans-serif; opacity: 0; transition: opacity 0.4s cubic-bezier(0.25, 1, 0.5, 1);
                }
                .ig-call-overlay.active { display: flex; opacity: 1; }
                
                .ig-video-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                .ig-remote-video { width: 100%; height: 100%; object-fit: cover; background: #0a0a0c; }
                
                .ig-local-video-wrapper {
                    position: absolute; top: 50px; right: 20px; width: 120px; height: 180px;
                    border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.8);
                    border: 1px solid rgba(255,255,255,0.15); z-index: 10; background: #111;
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .ig-local-video-wrapper:hover { transform: scale(1.03); }
                .ig-local-video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }

                /* 💎 GRADIENT SHADOWS & INFO */
                .ig-top-gradient {
                    position: absolute; top: 0; left: 0; width: 100%; height: 180px;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); z-index: 5; pointer-events: none;
                }
                .ig-bottom-gradient {
                    position: absolute; bottom: 0; left: 0; width: 100%; height: 250px;
                    background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); z-index: 5; pointer-events: none;
                }
                
                .ig-call-info {
                    position: absolute; top: 50px; left: 25px; z-index: 10; color: white;
                }
                .ig-call-name { font-size: 26px; font-weight: 600; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); letter-spacing: -0.5px; }
                .ig-call-status { font-size: 15px; color: rgba(255,255,255,0.7); margin: 2px 0 0 0; font-weight: 500; }

                /* 💎 CONTROLS BAR */
                .ig-controls {
                    position: absolute; bottom: 50px; left: 0; width: 100%;
                    display: flex; justify-content: center; align-items: center; gap: 30px; z-index: 10;
                }
                .ig-btn {
                    width: 60px; height: 60px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1);
                    display: flex; justify-content: center; align-items: center; font-size: 22px;
                    cursor: pointer; transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1); color: white;
                    background: rgba(255,255,255,0.15); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                }
                .ig-btn:hover { background: rgba(255,255,255,0.25); transform: translateY(-5px); box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                .ig-btn.end { background: #ff3b30; border: none; box-shadow: 0 10px 20px rgba(255,59,48,0.3); }
                .ig-btn.end:hover { background: #ff453a; box-shadow: 0 15px 30px rgba(255,59,48,0.5); }
                .ig-btn.muted { background: white; color: black; }

                /* 🔔 INCOMING CALL MODAL */
                .ig-incoming-modal {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(10, 10, 14, 0.95); backdrop-filter: blur(30px); z-index: 999999999; display: none;
                    flex-direction: column; justify-content: center; align-items: center;
                    font-family: 'Poppins', sans-serif; opacity: 0; transition: opacity 0.4s ease;
                }
                .ig-incoming-modal.active { display: flex; opacity: 1; }
                
                .ig-incoming-avatar {
                    width: 130px; height: 130px; border-radius: 50%; background: linear-gradient(135deg, #0a84ff, #ff2a5f);
                    display: flex; justify-content: center; align-items: center; font-size: 55px; color: white;
                    margin-bottom: 25px; animation: pulseAvatar 2s infinite alternate; box-shadow: 0 20px 40px rgba(10,132,255,0.3);
                }
                @keyframes pulseAvatar { 0% { transform: scale(1); } 100% { transform: scale(1.08); box-shadow: 0 25px 60px rgba(255,42,95,0.5); } }
                
                .ig-incoming-name { color: white; font-size: 32px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.5px; }
                .ig-incoming-text { color: rgba(255,255,255,0.5); font-size: 16px; margin: 0 0 60px 0; font-weight: 500; }
                
                .ig-incoming-actions { display: flex; gap: 50px; }
                .ig-action-btn {
                    width: 75px; height: 75px; border-radius: 50%; border: none; cursor: pointer;
                    display: flex; justify-content: center; align-items: center; font-size: 32px; color: white;
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .ig-action-btn.decline { background: #ff3b30; box-shadow: 0 15px 30px rgba(255,59,48,0.3); }
                .ig-action-btn.accept { background: #32d74b; box-shadow: 0 15px 30px rgba(50,215,75,0.3); animation: bounceAccept 2s infinite; }
                .ig-action-btn:hover { transform: translateY(-8px) scale(1.05); }
                @keyframes bounceAccept { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-12px); } 60% { transform: translateY(-6px); } }
            </style>

            <div id="igCallScreen" class="ig-call-overlay">
                <div class="ig-video-container">
                    <video id="igRemoteVideo" class="ig-remote-video" autoplay playsinline></video>
                </div>
                <div class="ig-local-video-wrapper">
                    <video id="igLocalVideo" class="ig-local-video" autoplay playsinline muted></video>
                </div>
                <div class="ig-top-gradient"></div>
                <div class="ig-bottom-gradient"></div>
                <div class="ig-call-info">
                    <h2 id="igCallName" class="ig-call-name">LOML</h2>
                    <p id="igCallStatus" class="ig-call-status">Connecting...</p>
                </div>
                <div class="ig-controls">
                    <button class="ig-btn" id="igToggleMic" onclick="window.toggleIGMic()">🎤</button>
                    <button class="ig-btn" id="igToggleCam" onclick="window.toggleIGCam()">📹</button>
                    <button class="ig-btn end" onclick="window.endIGCall(true)">📞</button>
                </div>
            </div>

            <div id="igIncomingScreen" class="ig-incoming-modal">
                <div class="ig-incoming-avatar">📹</div>
                <h2 id="igCallerName" class="ig-incoming-name">LoML</h2>
                <p class="ig-incoming-text">TwinCall Video & Audio</p>
                <div class="ig-incoming-actions">
                    <button class="ig-action-btn decline" onclick="window.endIGCall(true)">✕</button>
                    <button class="ig-action-btn accept" onclick="window.acceptIGCall()">📞</button>
                </div>
            </div>
        `;
        document.body.appendChild(uiContainer);
    }
};

// --- 2. THE HARDWARE ENGINE ---
window.startIGCamera = async function() {
    try {
        if (!navigator.mediaDevices) throw new Error("HTTPS required for camera access.");
        window.igLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const localVid = document.getElementById('igLocalVideo');
        if (localVid) localVid.srcObject = window.igLocalStream;
        
        document.getElementById('igCallScreen').classList.add('active');
        window.isCallActive = true;
        console.log("📸 Local Camera Active.");
    } catch (e) {
        console.error("Camera Error:", e);
        alert("⚠️ Camera Access Denied. You MUST test this on localhost or a secure HTTPS domain.");
        throw e;
    }
};

window.toggleIGMic = function() {
    if (!window.igLocalStream) return;
    const track = window.igLocalStream.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const btn = document.getElementById('igToggleMic');
        btn.classList.toggle('muted', !track.enabled);
        btn.innerText = track.enabled ? "🎤" : "🔇";
    }
};

window.toggleIGCam = function() {
    if (!window.igLocalStream) return;
    const track = window.igLocalStream.getVideoTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const btn = document.getElementById('igToggleCam');
        btn.classList.toggle('muted', !track.enabled);
        btn.innerText = track.enabled ? "📹" : "🚫";
    }
};

// --- 3. THE FIREBASE SWITCHBOARD ---
window.bootIGSwitchboard = async function() {
    if (window.igListenerActive || typeof rtdb === 'undefined' || !currentBridgeId) return;
    window.igListenerActive = true;
    
    console.log("📡 Booting WebRTC Switchboard...");
    const callRef = ref(rtdb, `bridges/${currentBridgeId}/videoCall`);

    // 🧹 Safe Sweeper: Clear our own stale calls
    try {
        const snap = await get(callRef);
        if (snap.exists() && snap.val().status === 'ringing' && snap.val().caller === currentUsername) {
            await remove(callRef);
            console.log("🧹 Cleared stale outgoing call.");
        }
    } catch(e) { console.error("Sweeper error:", e); }

    // 📡 Background Listener
    onValue(callRef, async (snap) => {
        const incomingScreen = document.getElementById('igIncomingScreen');
        
        if (!snap.exists()) {
            if (window.isCallActive) {
                console.log("☎️ Partner hung up.");
                window.endIGCall(false);
            }
            if (incomingScreen) incomingScreen.classList.remove('active');
            return;
        }

        const data = snap.val();

        // 🔔 Incoming Call
        if (data.status === 'ringing' && data.caller !== currentUsername && !window.isCallActive) {
            console.log("🔔 Ringing! Call from:", data.caller);
            document.getElementById('igCallerName').innerText = data.caller;
            if (incomingScreen) incomingScreen.classList.add('active');
        }

        // 🤝 Partner Answered Our Call
        if (data.status === 'connected' && data.answer && data.caller === currentUsername) {
            console.log("🤝 Partner accepted the call!");
            document.getElementById('igCallStatus').innerText = "Connected";
            
            if (window.igPeerConnection && !window.igPeerConnection.currentRemoteDescription) {
                try {
                    await window.igPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log("✅ WebRTC Remote Description Set.");
                } catch (e) { console.error("Error setting answer:", e); }
            }
        }
    });
};

// --- 4. STARTING A CALL (You -> Lavanya) ---
window.startIGCall = async function() {
    console.log("📞 Initiating call...");
    await window.startIGCamera();
    
    document.getElementById('igCallName').innerText = "LOML";
    document.getElementById('igCallStatus').innerText = "Ringing...";

    window.igPeerConnection = new RTCPeerConnection(rtcConfig);
    window.igRemoteStream = new MediaStream();
    document.getElementById('igRemoteVideo').srcObject = window.igRemoteStream;

    // Add local tracks to WebRTC
    window.igLocalStream.getTracks().forEach(t => window.igPeerConnection.addTrack(t, window.igLocalStream));

    // Catch remote tracks
    window.igPeerConnection.ontrack = (e) => {
        console.log("🎥 Received remote video track!");
        e.streams[0].getTracks().forEach(t => window.igRemoteStream.addTrack(t));
    };

    // Gather network routes (ICE Candidates)
    window.igPeerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            push(ref(rtdb, `bridges/${currentBridgeId}/videoCall/callerIce`), e.candidate.toJSON());
        }
    };

    // Create & Send Offer
    const offer = await window.igPeerConnection.createOffer();
    await window.igPeerConnection.setLocalDescription(offer);

    await set(ref(rtdb, `bridges/${currentBridgeId}/videoCall`), {
        caller: currentUsername,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp }
    });

    // Listen for Lavanya's network routes
    onChildAdded(ref(rtdb, `bridges/${currentBridgeId}/videoCall/receiverIce`), (snap) => {
        if (snap.exists() && window.igPeerConnection) {
            window.igPeerConnection.addIceCandidate(new RTCIceCandidate(snap.val())).catch(e => console.error(e));
        }
    });
};

// --- 5. ANSWERING A CALL (Lavanya -> You) ---
window.acceptIGCall = async function() {
    console.log("✅ Accepting call...");
    document.getElementById('igIncomingScreen').classList.remove('active');
    await window.startIGCamera();
    
    const callSnap = await get(ref(rtdb, `bridges/${currentBridgeId}/videoCall`));
    if (!callSnap.exists()) return;
    const callData = callSnap.val();

    document.getElementById('igCallName').innerText = callData.caller;
    document.getElementById('igCallStatus').innerText = "Connected";

    window.igPeerConnection = new RTCPeerConnection(rtcConfig);
    window.igRemoteStream = new MediaStream();
    document.getElementById('igRemoteVideo').srcObject = window.igRemoteStream;

    window.igLocalStream.getTracks().forEach(t => window.igPeerConnection.addTrack(t, window.igLocalStream));

    window.igPeerConnection.ontrack = (e) => {
        console.log("🎥 Received remote video track!");
        e.streams[0].getTracks().forEach(t => window.igRemoteStream.addTrack(t));
    };

    window.igPeerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            push(ref(rtdb, `bridges/${currentBridgeId}/videoCall/receiverIce`), e.candidate.toJSON());
        }
    };

    // Accept Offer & Send Answer
    await window.igPeerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
    const answer = await window.igPeerConnection.createAnswer();
    await window.igPeerConnection.setLocalDescription(answer);

    await update(ref(rtdb, `bridges/${currentBridgeId}/videoCall`), {
        status: 'connected',
        answer: { type: answer.type, sdp: answer.sdp }
    });

    // Listen for Caller's network routes
    onChildAdded(ref(rtdb, `bridges/${currentBridgeId}/videoCall/callerIce`), (snap) => {
        if (snap.exists() && window.igPeerConnection) {
            window.igPeerConnection.addIceCandidate(new RTCIceCandidate(snap.val())).catch(e => console.error(e));
        }
    });
};

// --- 6. HANG UP ---
window.endIGCall = async function(broadcast = true) {
    console.log("🛑 Ending call...");
    window.isCallActive = false;
    
    if (window.igLocalStream) {
        window.igLocalStream.getTracks().forEach(t => t.stop());
        window.igLocalStream = null;
    }
    if (window.igPeerConnection) {
        window.igPeerConnection.close();
        window.igPeerConnection = null;
    }
    
    document.getElementById('igCallScreen').classList.remove('active');
    document.getElementById('igIncomingScreen').classList.remove('active');
    
    if (document.getElementById('igLocalVideo')) document.getElementById('igLocalVideo').srcObject = null;
    if (document.getElementById('igRemoteVideo')) document.getElementById('igRemoteVideo').srcObject = null;

    if (broadcast && currentBridgeId) {
        try { await remove(ref(rtdb, `bridges/${currentBridgeId}/videoCall`)); } catch(e){}
    }
};

// ⚡ AUTO BOOTLOADER
window.initIGCallUI(); // Inject the UI into the DOM

// Poll until the user is logged in, then boot the background listener
const bootIGInterval = setInterval(() => {
    if (typeof currentBridgeId !== 'undefined' && currentBridgeId !== null) {
        if (typeof window.bootIGSwitchboard === 'function') window.bootIGSwitchboard();
        clearInterval(bootIGInterval);
    }
}, 1000);