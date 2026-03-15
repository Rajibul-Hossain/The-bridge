// ==========================================
// 1. FIREBASE IMPORTS (Hybrid Setup)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, onSnapshot as firestoreSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, get, push, onDisconnect, serverTimestamp as rtdbTime } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDEbvPzoahjdt0w5s2SF7Usn3ZnOxF2v38",
    authDomain: "ever-us.firebaseapp.com",
    databaseURL: "https://ever-us-default-rtdb.firebaseio.com", 
    projectId: "ever-us",
    storageBucket: "ever-us.firebasestorage.app",
    messagingSenderId: "925623567345",
    appId: "1:925623567345:web:10c9d1e5873a4df7983a50",
    measurementId: "G-6E4K45TWLV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 

// Register the Text Cursor Module globally
Quill.register('modules/cursors', QuillCursors);

// ==========================================
// 2. GLOBAL APP STATE
// ==========================================
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

// ==========================================
// 3. SECURE LOGIN & INITIALIZATION
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const myDoc = await getDoc(doc(db, "users", user.uid));
            if (myDoc.exists()) {
                currentUsername = myDoc.data().username; 
                currentBridgeId = myDoc.data().bridgeId; 
                partnerUid = myDoc.data().partnerUid; 
                
                if (!currentBridgeId || !partnerUid) {
                    window.location.href = 'nexus.html';
                    return;
                }
                
                const partnerDoc = await getDoc(doc(db, "users", partnerUid));
                if (partnerDoc.exists()) {
                    partnerUsername = partnerDoc.data().username;
                }
                activateGlobalUpdateListener(); 

            // Reveal the UI
            document.getElementById('loadingCore').style.display = 'none'; 
            document.getElementById('appShell').style.display = 'flex';
            window.loadView('overview');

                // Boot up all engines
                activatePresenceEngine(); 
                activateLiveCanvas(); 
                activateTelemetry(); 
                activateTimeline();
                activateFigmaMouseEngine();
                
                document.getElementById('loadingCore').style.display = 'none'; 
                document.getElementById('appShell').style.display = 'flex';
                window.loadView('overview');
            }
        } catch (error) { 
            console.error("Init Error:", error);
            alert("Error connecting to bridge."); 
        }
    } else { 
        window.location.href = 'index.html'; 
    }
});

// ==========================================
// 4. BULLETPROOF PRESENCE ENGINE
// ==========================================
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

let typingTimer;
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
            
            // Force the Name Flag to pop up
            cursorModule.toggleFlag(partnerUid, true);
            
            // Fade the name flag after 2 seconds of them not moving
            clearTimeout(window.textCursorFlagTimer);
            window.textCursorFlagTimer = setTimeout(() => {
                if (cursorModule) cursorModule.toggleFlag(partnerUid, false);
            }, 2000);

        } else if (cursorModule) {
            // Remove cursor if they leave the tab
            cursorModule.removeCursor(partnerUid);
        }
    });
}

window.initQuillEditor = function() {
    sharedEditor = new Quill('#editorCore', {
        theme: 'snow',
        placeholder: `A shared Workspace notepad... Type Anything you want and make it visible automatically`,
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
            isProgrammaticUpdate = false;
        }
    });

    sharedEditor.on('selection-change', function(range, oldRange, source) {
        if (source === 'user' && range) {
            set(ref(rtdb, `bridges/${currentBridgeId}/textCursors/${currentUser.uid}`), range);
        }
    });

// ==========================================
    // BROADCAST MY TEXT EDITS (Sync & Versioning)
    // ==========================================
    sharedEditor.on('text-change', function(delta, oldDelta, source) {
        if (source === 'user' && !isProgrammaticUpdate) {
            
            // 1. UI Update: Set local status to "Saving"
            const statusEl = document.getElementById('notepadStatus');
            if (statusEl) statusEl.innerText = "Saving...";

            // 2. Presence: Broadcast "Typing..." status to Partner
            set(ref(rtdb, `bridges/${currentBridgeId}/canvasData/typing`), currentUsername);
            
            // 3. Presence: Clear typing status after 1.5s of silence
            clearTimeout(typingIndicatorTimer);
            typingIndicatorTimer = setTimeout(() => {
                set(ref(rtdb, `bridges/${currentBridgeId}/canvasData/typing`), "");
            }, 1500);

            // 4. Persistence: Debounce the heavy rich-text save (1 second threshold)
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                const fullContent = sharedEditor.getContents(); 
                const timestamp = rtdbTime(); // Get the high-precision server time

                // Update the Main Sync Node
                set(ref(rtdb, `bridges/${currentBridgeId}/canvasData`), {
                    content: fullContent, 
                    lastEditor: currentUsername, 
                    lastEditTime: timestamp, // CRITICAL for unread detection
                    typing: ""
                });

                // Update my local "Last Read" so I don't notify myself of my own edit
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
            <div style="position: relative; width: 100%; min-height: 100%; display: flex; flex-direction: column;">
                
                <div class="note-system-anchor">
                    <button id="noteTrigger" class="note-trigger-btn" onclick="togglePulseTyper()">+ Note</button>
                    
                    <button id="mobileNoteToggle" class="mobile-note-toggle-btn" onclick="toggleMobileNotes()">👀 View Notes</button>
                    
                    <div id="pulseTyper" class="bubbly-typer">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 11px; color: #0a84ff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">New Note</span>
                            <span style="font-size: 10px; color: var(--text-faded);">24H Auto-Delete</span>
                        </div>
                        
                        <textarea id="pulseNoteInput" class="premium-textarea" placeholder="What's on your mind?..."></textarea>
                        
                        <div class="typer-controls">
                            <button class="typer-btn btn-primary" onclick="savePulseNote()">Save Note</button>
                            <button class="typer-btn btn-secondary" style="width: 44px;" onclick="togglePulseTyper()">✕</button>
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
                        
                        <div id="eventsCarousel" class="events-carousel">
                            </div>
                    </div>
                </div>

                <div id="milestoneModal" class="modal-overlay">
                    <div class="premium-modal">
                        <h3 style="margin-top:0; margin-bottom: 20px; color: white; font-family: 'Poppins', sans-serif;">Add Milestone</h3>
                        
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
                            <input type="date" id="msDate" class="premium-input" style="color-scheme: dark;">
                        </div>

                        <div style="display: flex; gap: 10px; margin-top: 25px;">
                            <button class="typer-btn btn-primary" onclick="saveMilestone()">Save to Timeline</button>
                            <button class="typer-btn btn-secondary" style="width: 70px;" onclick="closeMilestoneModal()">❌</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        // Start the Engines
        syncPulseNoteUI();
        initMilestonesEngine(); // Switched to the new Firebase Cloud Engine
    }else if (viewName === 'journal') {
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
                </div>
            </div>
        `;
    }
}

// ==========================================
// 10. MAPS, MATH, & LOGOUT UTILITIES
// ==========================================
window.openMap = function(lat, lon, titleText) {
    if(lat === 0 || lon === 0) return alert("Waiting for coordinate lock...");
    
    document.getElementById('mapTitle').innerText = titleText;
    let mapUrl = `https://maps.google.com/maps?q=${lat},${lon}&t=m&z=14&output=embed&iwloc=near`;
    
    document.getElementById('mapFrameContainer').innerHTML = `
        <iframe width="100%" height="100%" frameborder="0" style="border:0; border-radius: 0 0 28px 28px;" src="${mapUrl}" allowfullscreen></iframe>
    `;
    
    document.getElementById('mapModal').classList.add('active');
}

window.closeMap = function() {
    document.getElementById('mapModal').classList.remove('active');
    setTimeout(() => { document.getElementById('mapFrameContainer').innerHTML = ""; }, 400); 
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180; 
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return Math.round(R * c);
}

window.executeLogout = async function() {
    setOnlineStatus(false);
    setTimeout(() => { 
        signOut(auth).then(() => { 
            localStorage.removeItem("activeBridgeUser"); 
            window.location.href = 'index.html'; 
        }); 
    }, 200); 
}
// ==========================================
// 11. VERSION HISTORY & SNAPSHOTS
// ==========================================

async function saveVersionSnapshot(content) {
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/history`);
    // We use push() to create a unique entry for every version
    push(historyRef, {
        content: content,
        author: currentUsername,
        timestamp: rtdbTime()
    });
}
// ==========================================
// 11. VERSION HISTORY ENGINE (Expanded)
// ==========================================

// ==========================================
// 11. VERSION HISTORY & PREVIEW ENGINE
// ==========================================

let originalContentBeforePreview = null;

window.toggleVersionHistory = function() {
    const popup = document.getElementById('historyPopup');
    if (!popup) return;

    popup.classList.toggle('active');

    if (popup.classList.contains('active')) {
        // Save current state so we can go back if they cancel the preview
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

    // 2. Load the content into the editor (Programmatically, so it doesn't sync to Lavanya yet)
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
        
        // Push to main sync node (This updates Lavanya's screen too)
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
    // Allows you to delete your own note early without touching Lavanya's
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

        // 4. Always add the "Add Event" button at the end of the carousel
        carousel.innerHTML += `
            <div class="event-pill add-event-pill" onclick="openMilestoneModal()">
                <div style="font-size: 20px; margin-bottom: 5px;">+</div>
                <div class="event-title" style="color: #0a84ff;">Add Event</div>
            </div>
        `;
    });
}