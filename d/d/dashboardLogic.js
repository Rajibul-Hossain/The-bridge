// ==========================================
// 1. FIREBASE IMPORTS (Hybrid Setup)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, onSnapshot as firestoreSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, get, push, onDisconnect, serverTimestamp as rtdbTime, update, remove} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
else if (viewName === 'music') {
        box.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: auto; padding: 20px;">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding: 0 5px; flex-shrink: 0;">
                    <div style="flex: 1;">
                        <h1 class="view-title" style="text-transform: none; margin: 0; font-size: clamp(24px, 5vw, 32px);">TwinTunes</h1>
                        <p class="view-subtitle" style="margin: 2px 0 0 0; opacity: 0.7;">Your synchronized musical universe.</p>
                    </div>
                    
                    <button class="pro-btn" 
                            style="padding: 10px 16px; border-radius: 20px; font-size: 13px; color: white; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 8px; flex-shrink: 0;" 
                            onclick="window.togglePlaylistContainer(this)">
                        <span style="font-size: 16px;">📁</span> Playlist
                    </button>
                </div>

                <div class="music-page-grid" style="flex: 1; display: grid; grid-template-columns: 1fr 320px; gap: 20px; min-height: 0; align-items: center;">
                    
                    <div class="main-player-panel" style="height: 100%; max-height: 650px; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; background: rgba(255,255,255,0.03); border-radius: 35px; border: 1px solid rgba(255,255,255,0.05); padding: 30px;">
                        
                        <div id="liveEqBars" class="top-right-eq" style="position: absolute; top: 25px; right: 25px;">
                            <div class="live-bar"></div><div class="live-bar"></div><div class="live-bar"></div><div class="live-bar"></div>
                        </div>

                        <div id="vinylDisk" class="giant-album-art" style="width: min(240px, 50vh); height: min(240px, 50vh); margin-bottom: 30px;"></div>
                        
                        <div style="z-index: 1; text-align: center; width: 100%; max-width: 450px;">
                            <h2 id="songTitle" style="font-size: clamp(28px, 6vw, 38px); font-weight: 800; margin: 0; color: white; letter-spacing: -1px; text-shadow: 0 4px 15px rgba(0,0,0,0.5);">Loading...</h2>
                            <p id="songArtist" style="font-size: 16px; color: #ff2a5f; font-weight: 600; margin: 5px 0 20px 0; text-transform: uppercase; letter-spacing: 1.5px;"></p>
                            
                            <div style="background: rgba(0,0,0,0.4); padding: 15px 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 25px; backdrop-filter: blur(10px);">
                                <p id="songMessage" style="font-size: 14px; color: #e0e0e0; font-style: italic; margin: 0; line-height: 1.6;"></p>
                            </div>

                            <div class="playback-controller" style="width: 100%; max-width: 400px; margin: 0 auto;">
                                <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-faded); margin-bottom: 8px; font-family: 'Poppins', sans-serif;">
                                    <span id="currentTimeDisplay">0:00</span>
                                    <span id="totalTimeDisplay">0:00</span>
                                </div>
                                
                                <div id="progressBarContainer" style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; position: relative; margin-bottom: 25px;" onclick="window.scrubMusic(event)">
                                    <div id="progressBarFill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ff2a5f, #ff719a); border-radius: 10px; transition: width 0.1s linear; box-shadow: 0 0 10px rgba(255,42,95,0.5);"></div>
                                    <div id="progressDot" style="position: absolute; top: -3px; left: 0%; width: 12px; height: 12px; background: white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity 0.2s;"></div>
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 5px;">
                                    <button id="btnRepeat" style="background:none; border:none; color: var(--text-faded); font-size: 18px; cursor: pointer;" onclick="window.toggleRepeat()" title="Repeat Song">🔁 </button>
                                    
                                    <div style="display: flex; gap: 12px;">
                                        <button class="pro-btn btn-listen" style="padding: 12px 22px; border-radius: 30px; font-size: 13px; font-weight: 700;" onclick="window.toggleMusicPlayback()">▶ Play Sync</button>
                                        <button class="pro-btn btn-dedicate" style="padding: 12px 18px; border-radius: 30px; font-size: 13px;" onclick="window.openDedicationModal()">Add Music</button>
                                    </div>

                                    <button style="background:none; border:none; color: var(--text-faded); font-size: 18px; cursor: pointer;" onclick="window.forceExactSync()" title="Force Sync">🔄</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="music-history-panel" style="height: 100%; max-height: 650px; background: rgba(255,255,255,0.02); border-radius: 30px; border: 1px solid rgba(255,255,255,0.05); padding: 25px; display: flex; flex-direction: column;">
                        <h3 style="margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-faded); font-weight: 700;">Recent Dedications</h3>
                        <div id="historyFeedList" class="history-feed" style="flex: 1; overflow-y: auto;"></div>
                    </div>
                </div>

                <div id="musicModal" class="modal-overlay">
                    <div class="premium-modal" style="width: 90%; max-width: 400px;">
                        <h3 style="margin-top:0; margin-bottom: 20px; color: white;">Add a Song</h3>
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <input type="text" id="songSearchQuery" class="premium-input" style="flex: 1;" placeholder="Search for a song...">
                            <button class="pro-btn" style="padding: 10px 15px; background: rgba(255,42,95,0.15); color: #ff2a5f; border-radius: 14px; box-shadow: none;" onclick="window.searchSongMetadata(this)">🔍 Search</button>
                        </div>
                        <div id="artPreviewContainer" style="display: none; align-items: center; gap: 15px; background: rgba(0,0,0,0.4); padding: 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; backdrop-filter: blur(10px);">
                            <img id="previewArtImg" src="" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover;">
                            <div style="flex: 1; display: flex; flex-direction: column; overflow: auto;">
                                <input type="text" id="dedicateTitle" class="premium-input" style="background: transparent; border: none; padding: 0; font-size: 14px; font-weight: 700; color: white; margin-bottom: 2px; box-shadow: none;" readonly>
                                <input type="text" id="dedicateArtist" class="premium-input" style="background: transparent; border: none; padding: 0; font-size: 11px; color: var(--text-faded); box-shadow: none;" readonly>
                            </div>
                            <button class="pro-btn" style="width: 35px; height: 35px; border-radius: 50%; padding: 0; background: rgba(255,255,255,0.1); display: flex; justify-content: center;" title="Add to Playlist" onclick="window.addToPlaylistOnly()">
                                <span style="font-size: 18px;">➕</span>
                            </button>
                            <input type="hidden" id="hiddenAlbumArtUrl">
                            <input type="hidden" id="hiddenYtId">
                        </div>
                        <div class="input-group">
                            <label style="font-size: 12px; color: var(--text-faded);">Your Message</label>
                            <input type="text" id="dedicateMessage" class="premium-input" placeholder="Say something sweet...">
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 25px;">
                            <button class="pro-btn btn-dedicate" style="flex: 1; justify-content: center; padding: 12px;" onclick="window.sendDedication()">Send & Play</button>
                            <button class="pro-btn btn-listen" style="width: 60px; justify-content: center; padding: 12px;" onclick="window.closeDedicationModal()">✕</button>
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
                            <button class="pro-btn" style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255,42,95,0.15); color: #ff2a5f; padding: 0;" onclick="window.togglePlaylistContainer(); window.openDedicationModal();">➕</button>
                            <button class="pro-btn btn-listen" style="width: 38px; height: 38px; border-radius: 50%; justify-content: center; padding: 0;" onclick="window.togglePlaylistContainer()">✕</button>
                        </div>
                    </div>
                    <div id="playlistItems" class="playlist-scroll-area"></div>
                </div>

                <style>
                    .morphing-playlist {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) scale(0);
                        width: 92%;
                        max-width: 380px;
                        height: 75%;
                        max-height: 520px;
                        background: rgba(20, 20, 25, 0.95);
                        backdrop-filter: blur(30px) saturate(180%);
                        -webkit-backdrop-filter: blur(30px) saturate(180%);
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        border-radius: 32px;
                        z-index: 3000;
                        padding: 25px;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
                        opacity: 0;
                        visibility: hidden;
                        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                        pointer-events: none;
                    }

                    .morphing-playlist.active {
                        opacity: 1;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(1);
                        pointer-events: all;
                    }

                    .playlist-scroll-area {
                        height: calc(100% - 70px);
                        overflow-y: auto;
                        padding-right: 5px;
                    }

                    .playlist-scroll-area::-webkit-scrollbar { width: 3px; }
                    .playlist-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
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
        <iframe width="100%" height="100%" frameborder="0" style="border:0; border-radius: 0 0 28px 28px;" src="${mapUrl}" allowfullscreen></iframe>`;
    
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
                // We pressed play/scrubbed. Don't popup, just act locally.
                if (isPlayingRemote) {
                    if(window.ytAudioPlayer) window.ytAudioPlayer.playVideo();
                    if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(true);
                } else {
                    if(window.ytAudioPlayer) window.ytAudioPlayer.pauseVideo();
                    if(typeof window.togglePlaybackUI === 'function') window.togglePlaybackUI(false);
                }
            } else {
                // PARTNER PRESSED PLAY, PAUSE, OR SCRUBBED
                window.pendingSyncTime = data.seekTime || 0;
                window.pendingSyncTimestamp = data.actionTimestamp || Date.now();
                window.pendingYtId = data.ytId; 

                // ⚡ NEW: Scrub Interceptor 
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

    // History Feed logic
    const historyRef = ref(rtdb, `bridges/${currentBridgeId}/music/history`);
    onValue(historyRef, (snap) => {
        const feedEl = document.getElementById('historyFeedList');
        if (!feedEl) return;
        feedEl.innerHTML = "";
        if (!snap.exists()) {
            feedEl.innerHTML = `<p style="color: var(--text-faded); font-size: 13px; text-align: center; margin-top: 20px;">No history yet. Start the playlist!</p>`;
            return;
        }
        let tracks = [];
        snap.forEach(child => { tracks.push(child.val()); });
        tracks.reverse().forEach(track => {
            const dateStr = new Date(track.timestamp).toLocaleDateString();
            const artHtml = track.albumArt 
                ? `<img src="${track.albumArt}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">`
                : `<div style="width: 100%; height: 100%; border-radius: 10px; background: linear-gradient(135deg, #ff2a5f, #ff719a); display: flex; justify-content: center; align-items: center; font-size: 16px;">🎵</div>`;

            feedEl.innerHTML += `
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
    });
}

// --- 5. PROGRESS BAR & TIMELINE SCRUBBING ---

window.progressInterval = null;
window.isRepeatOn = false;

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

window.startProgressLoop = function() {
    if (window.progressInterval) clearInterval(window.progressInterval);
    
    window.progressInterval = setInterval(() => {
        if (window.ytAudioPlayer && window.isAudioPlaying && typeof window.ytAudioPlayer.getCurrentTime === 'function') {
            const current = window.ytAudioPlayer.getCurrentTime();
            const total = window.ytAudioPlayer.getDuration();
            
            const currEl = document.getElementById('currentTimeDisplay');
            const totalEl = document.getElementById('totalTimeDisplay');
            const fillEl = document.getElementById('progressBarFill');
            const dotEl = document.getElementById('progressDot');
            
            if (currEl) currEl.innerText = formatTime(current);
            if (totalEl) totalEl.innerText = formatTime(total);
            
            if (total > 0 && fillEl && dotEl) {
                const percent = (current / total) * 100;
                fillEl.style.width = `${percent}%`;
                dotEl.style.left = `${percent}%`;
            }
        }
    }, 100);
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
                // ⚡ NEW: Repeat Engine Catch
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
        if(typeof window.startProgressLoop === 'function') window.startProgressLoop(); // ⚡ Kickstart progress bar
        if (dot) dot.style.opacity = '1'; 
    } else {
        if (eq) eq.classList.remove('playing');
        if (disk) disk.classList.remove('playing');
        if (sideEq) sideEq.classList.remove('playing');
        if (window.progressInterval) clearInterval(window.progressInterval); // ⚡ Stop progress bar
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
        
        // Calculate the button position relative to the center of the screen
        const x = (rect.left + rect.width / 2) - parentRect.left;
        const y = (rect.top + rect.height / 2) - parentRect.top;

        // Origin logic needs to be precise for the compact pop
        container.style.transformOrigin = `${x}px ${y}px`;
        container.classList.add('active');
    } else {
        container.classList.remove('active');
    }
}
// --- 9. PLAYLIST ADDITION ENGINE ---
// --- 9. PLAYLIST ADDITION ENGINE (CORRECTED) ---

window.addToPlaylistOnly = async function() {
    // 1. Extract values with Optional Chaining for safety
    const title = document.getElementById('dedicateTitle')?.value;
    const artist = document.getElementById('dedicateArtist')?.value;
    const albumArt = document.getElementById('hiddenAlbumArtUrl')?.value;
    const ytId = document.getElementById('hiddenYtId')?.value;

    // 2. Critical Check
    if (!ytId || !albumArt) return alert("Search for a song first!");

    // 3. Define the data object
    const finalSongData = {
        title: title,
        artist: artist,
        albumArt: albumArt,
        ytId: ytId,
        addedBy: currentUsername,
        timestamp: Date.now()
    };

    try {
        // ⚡ FIX: We are now using finalSongData correctly here
        await set(ref(rtdb, `bridges/${currentBridgeId}/music/playlist/${ytId}`), finalSongData);
        
        // 4. Premium Visual Feedback
        const addBtn = document.querySelector('button[onclick*="addToPlaylistOnly"]');
        if(addBtn) {
            const originalIcon = addBtn.innerHTML;
            addBtn.innerHTML = "✅";
            addBtn.style.background = "rgba(46, 213, 115, 0.2)";
            addBtn.style.pointerEvents = "none"; // Prevent double-clicks

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
}// --- 10. ROBUST PLAYLIST LIVE-FEED (WITH REMOVE OPTION) ---
window.startPlaylistListener = function() {
    const playlistRef = ref(rtdb, `bridges/${currentBridgeId}/music/playlist`);
    
    onValue(playlistRef, (snap) => {
        const listEl = document.getElementById('playlistItems');
        if (!listEl) return; 

        listEl.innerHTML = "";

        if (!snap.exists()) {
            listEl.innerHTML = `<p style="color:var(--text-faded); text-align:center; margin-top:60px;">Library is empty.</p>`;
            return;
        }

        let playlistArray = [];
        snap.forEach(child => {
            playlistArray.push({ id: child.key, ...child.val() });
        });

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
            listEl.appendChild(item);
        });
    });
}
// --- 11. PLAYLIST DELETION ENGINE ---

window.removeFromPlaylist = async function(songId) {
    // 1. Professional Confirmation (Optional but recommended)
    if (!confirm("Remove this song from the bridge library?")) return;

    try {
        // 2. Remove from Firebase
        const songRef = ref(rtdb, `bridges/${currentBridgeId}/music/playlist/${songId}`);
        await remove(songRef);
        
        console.log(`🗑️ Track ${songId} purged from library.`);
    } catch (e) {
        console.error("Deletion failed:", e);
        alert("Couldn't remove the song. Try again!");
    }
}// ==========================================
// 11. PLAYLIST INTERACTION ENGINE (ROBUST)
// ==========================================

// --- PLAY TRIGGER ---
window.playFromPlaylist = async function(songData) {
    if (!songData || !songData.ytId) return console.error("Invalid Song Data");

    console.log("💿 Playlist Selection: " + songData.title);

    try {
        // Broadcast the selection to the partner via nowPlaying
        await update(ref(rtdb, `bridges/${currentBridgeId}/music/nowPlaying`), {
            title: songData.title,
            artist: songData.artist,
            albumArt: songData.albumArt,
            ytId: songData.ytId,
            playbackState: 'playing', // Auto-play on selection
            lastActionBy: currentUsername,
            seekTime: 0,
            actionTimestamp: Date.now(),
            isHeartbeat: false,
            isScrubbing: false
        });

        // Close drawer for a premium transition
        if (typeof window.togglePlaylistContainer === 'function') {
            window.togglePlaylistContainer();
        }
    } catch (e) {
        console.error("Playback Sync Failed:", e);
    }
}

// --- REMOVE TRIGGER ---
window.removeFromPlaylist = async function(songId) {
    if (!songId) return;

    // Professional UI Confirmation
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
}