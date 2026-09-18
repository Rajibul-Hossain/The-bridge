import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { ref, onValue, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, rtdb, db } from '../firebase';
import { useAuth } from '../context/AuthContext';

import Overview from '../components/Overview';
import SyncSpace from '../components/SyncSpace';
import Cinema from '../components/Cinema';
import Messages from '../components/Messages';
import TwinTunes from '../components/TwinTunes';
import Tracker from '../components/Tracker';

// Tooltip component (since DOM manipulation was used)
function Tooltip({ text, x, y, visible }) {
  if (!visible) return null;
  return (
    <div
      id="global-master-tooltip"
      className="active"
      style={{
        left: x,
        top: y,
      }}
    >
      {text}
    </div>
  );
}

function Dashboard() {
  const { currentUser, currentUsername, bridgeId, partnerUid } = useAuth();
  const navigate = useNavigate();

  const [activeView, setActiveView] = useState('overview');
  const [partnerStatus, setPartnerStatus] = useState('Securing Node...');
  const [partnerIsOnline, setPartnerIsOnline] = useState(false);
  const [partnerUsername, setPartnerUsername] = useState('Loading...');

  // Tooltip state
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [hasUnreadJournal, setHasUnreadJournal] = useState(false);
  const [partnerLocation, setPartnerLocation] = useState({ city: "Tracking...", temp: "--", lat: 0, lon: 0 });
  const [myLocation, setMyLocation] = useState({ city: "Locating...", temp: "--", lat: 0, lon: 0 });

  useEffect(() => {
    // Global Tooltip logic
    const handleMouseOver = (e) => {
      const target = e.target.closest('[data-tip]');
      if (target) {
        const text = target.getAttribute('data-tip');
        const rect = target.getBoundingClientRect();
        setTooltip({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top,
          visible: true,
        });
      }
    };
    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-tip]');
      if (target) {
        setTooltip((prev) => ({ ...prev, visible: false }));
      }
    };
    const handleMouseDown = () => {
      setTooltip((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !bridgeId || !partnerUid) return;

    // Fetch Partner Username
    const unsubPartner = onSnapshot(doc(db, "users", partnerUid), (snap) => {
      if (snap.exists()) {
        setPartnerUsername(snap.data().username);
        if (snap.data().telemetry) {
          setPartnerLocation(snap.data().telemetry);
        }
      }
    });

    // Presence engine
    const myRef = ref(rtdb, `presence/${currentUser.uid}`);
    const setOnlineStatus = (isOnline) => {
      if (isOnline) {
        set(myRef, { isOnline: true, lastActive: serverTimestamp() });
        onDisconnect(myRef).set({ isOnline: false, lastActive: serverTimestamp() });
      } else {
        set(myRef, { isOnline: false, lastActive: serverTimestamp() });
      }
    };

    const unsubConnected = onValue(ref(rtdb, '.info/connected'), (snap) => {
      if (snap.val() === true) setOnlineStatus(true);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') setOnlineStatus(true);
      else setOnlineStatus(false);
    };

    const handleBeforeUnload = () => setOnlineStatus(false);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    const unsubPartnerPresence = onValue(ref(rtdb, `presence/${partnerUid}`), (snap) => {
      if (snap.exists()) {
        const isOnline = snap.val().isOnline;
        const lastActive = snap.val().lastActive;
        setPartnerIsOnline(isOnline);
        if (isOnline) {
          setPartnerStatus("Online");
        } else {
          const calculateTimeAgo = (date) => {
            const secs = Math.floor((new Date() - date) / 1000);
            if (secs < 30) return "just now";
            let interval = secs / 86400; if (interval > 1) return Math.floor(interval) + "d ago";
            interval = secs / 3600; if (interval > 1) return Math.floor(interval) + "h ago";
            interval = secs / 60; if (interval > 1) return Math.floor(interval) + "m ago";
            return "just now";
          };
          setPartnerStatus(lastActive ? "Last seen " + calculateTimeAgo(new Date(lastActive)) : "Offline");
        }
      }
    });

    // Telemetry fetch
    const fetchWeather = async (lat, lon) => {
        try {
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const geoData = await geoRes.json();
            const city = geoData.city || geoData.locality || "Unknown Node";

            const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const weatherData = await weatherRes.json();

            const loc = { city: city, temp: weatherData.current_weather.temperature, lat: lat, lon: lon };
            setMyLocation(loc);

            // Note: In a real app we might not want to update firestore every render,
            // but replicating logic. Wait until needed.
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

    // Global Unread Receipts (Messages)
    const msgsRef = ref(rtdb, `bridges/${bridgeId}/messages`);
    const myReadRef = ref(rtdb, `bridges/${bridgeId}/readReceipts/${currentUsername}`);

    const unsubMyRead = onValue(myReadRef, (readSnap) => {
      const myLastRead = readSnap.val() || 0;
      onValue(msgsRef, (msgSnap) => {
        if (!msgSnap.exists()) return;
        let count = 0;
        msgSnap.forEach(child => {
          const msg = child.val();
          if (msg.sender !== currentUsername && msg.timestamp > myLastRead) {
            count++;
          }
        });
        setUnreadMessagesCount(count);
      });
    });

    // Global Unread Receipts (SyncSpace Canvas)
    const canvasRef = ref(rtdb, `bridges/${bridgeId}/canvasData`);
    const unsubCanvas = onValue(canvasRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const lastEditor = data.lastEditor || "System";
            const lastEditTime = data.lastEditTime || 0;
            const lastRead = localStorage.getItem(`lastRead_${bridgeId}`) || 0;

            if (lastEditor !== currentUsername && lastEditTime > lastRead) {
                setHasUnreadJournal(true);
            } else {
                setHasUnreadJournal(false);
            }
        }
    });

    return () => {
      unsubPartner();
      unsubConnected();
      unsubPartnerPresence();
      unsubMyRead();
      unsubCanvas();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentUser, bridgeId, partnerUid, currentUsername]);


  const executeLogout = async () => {
    try {
      const myRef = ref(rtdb, `presence/${currentUser.uid}`);
      await set(myRef, { isOnline: false, lastActive: serverTimestamp() });
      await signOut(auth);
      localStorage.removeItem("activeBridgeUser");
      navigate('/');
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const renderView = () => {
    switch(activeView) {
      case 'overview':
        return <Overview partnerStatus={partnerStatus} partnerIsOnline={partnerIsOnline} myLocation={myLocation} partnerLocation={partnerLocation} partnerUsername={partnerUsername} />;
      case 'journal':
        return <SyncSpace partnerUsername={partnerUsername} partnerIsOnline={partnerIsOnline} setHasUnreadJournal={setHasUnreadJournal} />;
      case 'cinema':
        return <Cinema partnerUsername={partnerUsername} />;
      case 'messages':
        return <Messages partnerUsername={partnerUsername} partnerIsOnline={partnerIsOnline} setUnreadMessagesCount={setUnreadMessagesCount} />;
      case 'music':
        return <TwinTunes partnerUsername={partnerUsername} />;
      case 'tracker':
        return <Tracker />;
      default:
        return <Overview partnerStatus={partnerStatus} partnerIsOnline={partnerIsOnline} myLocation={myLocation} partnerLocation={partnerLocation} partnerUsername={partnerUsername} />;
    }
  };

  if (!currentUser || !bridgeId || !partnerUid) {
      return (
        <div id="loadingCore" style={{color: 'white', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100vh', background: 'black'}}>
            <h1 style={{fontSize: '50px', animation: 'pulse 1.5s infinite'}}>📡</h1>
            <p style={{color: '#8e8e93'}}>Decrypting Bridge Payload...</p>
        </div>
      )
  }

  return (
    <div className="app-background">
      <div className="app-shell" id="appShell">
        <nav className="glass-sidebar">
          <div className="sidebar-header">
            <div className="status-indicator">
              <span className="pulse-dot" style={{ background: partnerIsOnline ? '#32d74b' : '#8e8e93', boxShadow: partnerIsOnline ? '0 0 10px #32d74b' : 'none', animation: partnerIsOnline ? 'pulse 2s infinite' : 'none' }}></span>
              <span id="partnerStatusText">{partnerStatus}</span>
            </div>
          </div>

          <div className="nav-menu">
            <button data-tip="Loving can hurt" className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')}>✨ Overview</button>
            <button data-tip="Take collaborative notes" className={`nav-item ${activeView === 'journal' ? 'active' : ''}`} onClick={() => setActiveView('journal')}>
              📓 SyncSpace
              <div id="sidebarUnreadBadge" className={`sidebar-badge ${hasUnreadJournal && activeView !== 'journal' ? 'active' : ''}`}></div>
            </button>
            <button data-tip="Watch Something together" className={`nav-item ${activeView === 'cinema' ? 'active' : ''}`} onClick={() => setActiveView('cinema')}> 🎞️ Cinema</button>
            <button className={`nav-item ${activeView === 'tracker' ? 'active' : ''}`} onClick={() => setActiveView('tracker')}>⏳ Logistics</button>
            <button data-tip="Have unlimited chats" className={`nav-item ${activeView === 'messages' ? 'active' : ''}`} onClick={() => setActiveView('messages')}>
              💬 Messages
              <span id="messagesNavBadge" style={{ display: unreadMessagesCount > 0 && activeView !== 'messages' ? 'inline-block' : 'none', background: '#ff2a5f', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', marginLeft: 'auto', fontWeight: 'bold' }}>
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            </button>
            <button data-tip="Special Moments" className="nav-item" onClick={() => alert('Vault Firebase Storage coming soon!')}>🔒 The Vault</button>
            <button data-tip="Play music together" className={`nav-item ${activeView === 'music' ? 'active' : ''}`} onClick={() => setActiveView('music')} style={{ display: 'flex', alignItems: 'center' }}>
              <div className="sidebar-eq" id="sidebarMusicEq">
                <div className="s-bar"></div><div className="s-bar"></div><div className="s-bar"></div>
              </div>
              TwinTunes
            </button>
          </div>

          <div className="sidebar-footer">
            <button className="logout-btn" onClick={executeLogout}>🚪 Disconnect</button>
          </div>
        </nav>

        <main id="mainAppContent" className="dynamic-content-area">
          {renderView()}
        </main>
      </div>
      <Tooltip text={tooltip.text} x={tooltip.x} y={tooltip.y} visible={tooltip.visible} />
    </div>
  );
}

export default Dashboard;
