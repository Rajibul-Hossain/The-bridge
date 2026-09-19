import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ref, onValue, set, push, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase';

function Overview({ partnerStatus, partnerIsOnline, myLocation, partnerLocation, partnerUsername }) {
  const { currentUser, currentUsername, bridgeId } = useAuth();

  const [distanceStr, setDistanceStr] = useState("Calculating...");
  const [pulseNoteExpanded, setPulseNoteExpanded] = useState(false);
  const [pulseNoteText, setPulseNoteText] = useState("");
  const [activeNotes, setActiveNotes] = useState([]);
  const [showMobileNotes, setShowMobileNotes] = useState(false);

  const [milestones, setMilestones] = useState([]);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [msIcon, setMsIcon] = useState("❤️");
  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [daysTogether, setDaysTogether] = useState(0);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapData, setMapData] = useState({ lat: 0, lon: 0, title: '' });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
  };

  useEffect(() => {
    if (myLocation.lat !== 0 && partnerLocation.lat !== 0) {
      setDistanceStr(calculateDistance(myLocation.lat, myLocation.lon, partnerLocation.lat, partnerLocation.lon) + " km");
    }
  }, [myLocation, partnerLocation]);

  useEffect(() => {
    if (!bridgeId) return;

    // Pulse Notes Sync
    const notesRef = ref(rtdb, `bridges/${bridgeId}/pulseNotes`);
    const unsubNotes = onValue(notesRef, (snap) => {
      const notesArray = [];
      if (snap.exists()) {
        snap.forEach((childSnap) => {
          const data = childSnap.val();
          const noteAgeMs = Date.now() - data.timestamp;
          const expiryTime = 24 * 60 * 60 * 1000;
          if (noteAgeMs > expiryTime) {
            set(ref(rtdb, `bridges/${bridgeId}/pulseNotes/${childSnap.key}`), null);
          } else {
            notesArray.push({ uid: childSnap.key, ...data, expiryTime, noteAgeMs });
          }
        });
      }
      setActiveNotes(notesArray);
    });

    // Milestones Sync
    const milestonesRef = ref(rtdb, `bridges/${bridgeId}/milestones`);
    const unsubMilestones = onValue(milestonesRef, (snap) => {
        let events = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let earliestDate = today;

        if (snap.exists()) {
            snap.forEach(child => {
                const data = child.val();
                events.push({ id: child.key, ...data });
                const evDate = new Date(data.date + 'T00:00:00');
                if (evDate < earliestDate) earliestDate = evDate;
            });
        }

        if (events.length > 0) {
            setDaysTogether(Math.floor((today - earliestDate) / (1000 * 60 * 60 * 24)));
        } else {
            setDaysTogether(0);
        }

        events.sort((a, b) => new Date(a.date) - new Date(b.date));
        setMilestones(events);
    });

    return () => {
      unsubNotes();
      unsubMilestones();
    };
  }, [bridgeId]);

  const savePulseNote = async () => {
    if (!pulseNoteText.trim()) return setPulseNoteExpanded(false);
    await set(ref(rtdb, `bridges/${bridgeId}/pulseNotes/${currentUser.uid}`), {
        text: pulseNoteText,
        author: currentUsername,
        timestamp: serverTimestamp()
    });
    setPulseNoteExpanded(false);
  };

  const deleteMyPulseNote = async () => {
    await set(ref(rtdb, `bridges/${bridgeId}/pulseNotes/${currentUser.uid}`), null);
    setPulseNoteText("");
  };

  const saveMilestone = async () => {
    if (!msTitle || !msDate) return alert("Please enter a title and date.");
    const newMilestoneRef = push(ref(rtdb, `bridges/${bridgeId}/milestones`));
    await set(newMilestoneRef, {
        icon: msIcon || "✨",
        title: msTitle,
        date: msDate,
        addedBy: currentUsername,
        timestamp: serverTimestamp()
    });
    setIsMilestoneModalOpen(false);
    setMsIcon("❤️");
    setMsTitle("");
    setMsDate("");
  };

  const deleteMilestone = async (id) => {
    if(window.confirm("Remove this milestone from the timeline?")) {
        await set(ref(rtdb, `bridges/${bridgeId}/milestones/${id}`), null);
    }
  };

  const triggerPulse = async (type) => {
    if (navigator.vibrate) navigator.vibrate(type === 'tap' ? 15 : [50, 100, 50]);
    playPulseAnimation(type, null, false, Date.now()); // Local preview

    try {
        const pulseRef = ref(rtdb, `bridges/${bridgeId}/interactions`);
        await set(pulseRef, {
            type: type,
            from: currentUsername,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Pulse error:", e);
    }
  };

  // Helper for pulse animation (creates DOM nodes temporarily)
  const playPulseAnimation = (type, senderName, isMissed = false, timestamp = null) => {
    if (document.querySelector('.pulse-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = `pulse-overlay ${type}`;
    let emoji = type === 'hug' ? '👻' : '👋';
    let actionText = '';
    const timeToUse = timestamp ? new Date(timestamp) : new Date();
    const timeString = timeToUse.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (senderName) {
        actionText = type === 'hug'
            ? `${senderName} ${isMissed ? 'left a warm hug for you at' : 'hugged you tightly at'} ${timeString}...`
            : `${senderName} ${isMissed ? 'tapped you at' : 'is thinking of you at'} ${timeString}...`;
    } else {
        actionText = type === 'hug' ? `Sending a warm hug at ${timeString}...` : `Sending a gentle tap at ${timeString}...`;
    }

    overlay.innerHTML = `
        <div class="pulse-message">
            <div class="pulse-emoji">${emoji}</div>
            <div class="pulse-text-part">${actionText}</div>
        </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.transition = 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
        overlay.style.opacity = '0';
        overlay.style.backdropFilter = 'blur(0px)';
        setTimeout(() => overlay.remove(), 1200);
    }, type === 'tap' ? 2500 : 4500);
  };

  const openMap = (lat, lon, title) => {
    if (lat === 0 || lon === 0) return alert("Waiting for coordinate lock...");
    setMapData({ lat, lon, title });
    setMapModalOpen(true);
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Pulse Hub */}
        <div className="pulse-hub">
            <button data-tip="Send a Tap" className="pro-btn" style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }} onClick={() => triggerPulse('tap')}>
                <span style={{ fontSize: '18px' }}>👋</span>
            </button>
            <button data-tip="Send a Hug" className="pro-btn" style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,42,95,0.1)', border: '1px solid rgba(255,42,95,0.2)', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }} onClick={() => triggerPulse('hug')}>
                <span style={{ fontSize: '18px' }}>👻</span>
            </button>
        </div>

        {/* Note System */}
        <div className="note-system-anchor">
            {!pulseNoteExpanded && (
                <button id="noteTrigger" className="note-trigger-btn" onClick={() => setPulseNoteExpanded(true)}>
                    {activeNotes.some(n => n.uid === currentUser.uid) ? "Update" : "+ Note"}
                </button>
            )}
            <button
                id="mobileNoteToggle"
                className={`mobile-note-toggle-btn ${activeNotes.length > 0 ? 'has-notes' : ''}`}
                onClick={() => setShowMobileNotes(!showMobileNotes)}
            >
                {activeNotes.length > 0 && !showMobileNotes ? `✨ ${activeNotes.length} New Pulse${activeNotes.length > 1 ? 's' : ''}` : (showMobileNotes ? "🙈 Hide Notes" : "👀 View Notes")}
            </button>

            <div id="pulseTyper" className={`bubbly-typer ${pulseNoteExpanded ? 'expanded' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#0a84ff', fontWeight: 700 }}>NEW NOTE</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-faded)' }}>24H Auto-Delete</span>
                </div>
                <textarea
                    id="pulseNoteInput"
                    className="premium-textarea"
                    placeholder="What's on your mind?..."
                    value={pulseNoteText}
                    onChange={(e) => setPulseNoteText(e.target.value)}
                />
                <div className="typer-controls">
                    <button className="typer-btn btn-primary" onClick={savePulseNote}>Save Note</button>
                    <button className="typer-btn btn-secondary" style={{ width: '44px' }} onClick={() => setPulseNoteExpanded(false)}>✕</button>
                </div>
            </div>

            <div id="activeNoteDisplay" className={showMobileNotes ? 'show-on-mobile' : ''}>
                {activeNotes.map((note) => {
                    const isMine = note.uid === currentUser.uid;
                    const hoursLeft = Math.round((note.expiryTime - note.noteAgeMs) / (1000 * 60 * 60));
                    return (
                        <div key={note.uid} className="floating-glass-note" style={{ marginTop: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '9px', color: isMine ? 'var(--text-faded)' : '#0a84ff', fontWeight: 800, textTransform: 'uppercase' }}>
                                    {isMine ? 'Your note' : `Note from ${note.author}`}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ fontSize: '9px', color: '#ff6c0a', fontWeight: 700 }}>{hoursLeft}h left</span>
                                    {isMine && (
                                        <span onClick={deleteMyPulseNote} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginLeft: '10px', transition: '0.2s' }} onMouseOver={(e) => e.target.style.color='#ff3b30'} onMouseOut={(e) => e.target.style.color='rgba(255,255,255,0.3)'}>✕</span>
                                    )}
                                </div>
                            </div>
                            <p style={{ margin: 0, fontSize: '14px', color: 'white', lineHeight: 1.4, fontWeight: 400 }}>{note.text}</p>
                        </div>
                    );
                })}
            </div>
        </div>

        <h1 className="view-title" style={{ textTransform: 'none', paddingRight: '120px' }}>{getGreeting()}, <span style={{ textTransform: 'capitalize' }}>{currentUsername}</span></h1>
        <p className="view-subtitle">Live telemetry synchronization.</p>

        {/* Widget Grid */}
        <div className="widget-grid" style={{ marginTop: '30px' }}>
            <div className="glass-widget">
                <p className="widget-label">DISTANCE</p>
                <h2 className="widget-value">{distanceStr}</h2>
                <p style={{ fontSize: '12px', color: '#32d74b', marginTop: '5px', fontWeight: 600 }}>Bridge Active</p>
            </div>

            <div className="glass-widget clickable-widget" onClick={() => openMap(myLocation.lat, myLocation.lon, `My Node: ${myLocation.city}`)}>
                <p className="widget-label" style={{ textTransform: 'uppercase' }}>{myLocation.city}</p>
                <h2 className="widget-value">{myLocation.temp}°C</h2>
            </div>

            <div className="glass-widget clickable-widget" style={{ borderColor: 'rgba(10, 132, 255, 0.3)' }} onClick={() => openMap(partnerLocation.lat, partnerLocation.lon, `${partnerUsername} is in ${partnerLocation.city}`)}>
                <p className="widget-label" style={{ color: '#0a84ff', textTransform: 'uppercase' }}>{partnerUsername}: {partnerLocation.city}</p>
                <h2 className="widget-value">{partnerLocation.temp}°C</h2>
            </div>

            <div className="milestone-widget">
                <div className="journey-header">
                    <div>
                        <p style={{ fontSize: '11px', color: '#ff2a5f', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>The Journey</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <h2 className="mega-number">{daysTogether}</h2>
                            <span style={{ fontSize: '14px', color: 'var(--text-faded)', fontWeight: 500 }}>Days</span>
                        </div>
                    </div>
                </div>
                <div id="eventsCarousel" className="events-carousel">
                    {milestones.map(ev => {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const evDate = new Date(ev.date + 'T00:00:00');
                        const diffTime = evDate - today;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        let timeString = "";
                        let colorStyle = "";

                        if (diffDays < 0) { timeString = `${Math.abs(diffDays)} Days Ago`; colorStyle = "white"; }
                        else if (diffDays === 0) { timeString = "Today! 🎉"; colorStyle = "#32d74b"; }
                        else { timeString = `In ${diffDays} Days`; colorStyle = "#0a84ff"; }

                        return (
                            <div key={ev.id} className="event-pill" style={{ position: 'relative' }}>
                                <span onClick={() => deleteMilestone(ev.id)} style={{ position: 'absolute', top: '8px', right: '10px', fontSize: '10px', cursor: 'pointer', color: 'rgba(255,255,255,0.2)' }}>✕</span>
                                <div className="event-icon">{ev.icon}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span className="event-title">{ev.title}</span>
                                    <span className="event-time" style={{ color: colorStyle }}>{timeString}</span>
                                </div>
                            </div>
                        )
                    })}
                    <div className="event-pill add-event-pill" onClick={() => setIsMilestoneModalOpen(true)}>
                        <div style={{ fontSize: '20px', marginBottom: '5px' }}>+</div>
                        <div className="event-title" style={{ color: '#0a84ff' }}>Add Event</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Milestone Modal */}
        <div id="milestoneModal" className={`modal-overlay ${isMilestoneModalOpen ? 'active' : ''}`}>
            <div className="premium-modal">
                <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'white' }}>Add Milestone</h3>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div className="input-group" style={{ width: '75px' }}>
                        <label>Emoji</label>
                        <input type="text" className="premium-input" placeholder="❤️" maxLength="2" style={{ textAlign: 'center', fontSize: '20px', padding: '8px' }} value={msIcon} onChange={e => setMsIcon(e.target.value)} />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>Event Title</label>
                        <input type="text" className="premium-input" placeholder="e.g. First Date" value={msTitle} onChange={e => setMsTitle(e.target.value)} />
                    </div>
                </div>
                <div className="input-group">
                    <label>Date</label>
                    <input type="date" className="premium-input" value={msDate} onChange={e => setMsDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                    <button className="typer-btn btn-primary" onClick={saveMilestone}>Save to Timeline</button>
                    <button className="typer-btn btn-secondary" style={{ width: '70px' }} onClick={() => setIsMilestoneModalOpen(false)}>❌</button>
                </div>
            </div>
        </div>

        {/* Map Modal */}
        <div id="mapModal" className={`glass-modal ${mapModalOpen ? 'active' : ''}`}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3 id="mapTitle">{mapData.title}</h3>
                    <button className="close-btn" onClick={() => setMapModalOpen(false)}>×</button>
                </div>
                <div id="mapFrameContainer" className="map-container">
                    {mapModalOpen && (
                         <iframe width="100%" height="100%" frameBorder="0" style={{ border:0, borderRadius: '0 0 28px 28px' }} src={`https://maps.google.com/maps?q=${mapData.lat},${mapData.lon}&t=m&z=14&output=embed&iwloc=near`} allowFullScreen></iframe>
                    )}
                </div>
            </div>
        </div>

    </div>
  );
}

export default Overview;
