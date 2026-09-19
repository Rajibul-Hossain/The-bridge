import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ref, onValue, set, push, get, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase';

function SyncSpace({ partnerUsername, partnerIsOnline, setHasUnreadJournal }) {
  const { currentUser, currentUsername, bridgeId, partnerUid } = useAuth();

  const editorRef = useRef(null);
  const quillInstance = useRef(null);
  const cursorModule = useRef(null);

  const [notepadStatus, setNotepadStatus] = useState("☁️ Synced");
  const [typingIndicator, setTypingIndicator] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);

  const [originalContentBeforePreview, setOriginalContentBeforePreview] = useState(null);
  const [previewingVersion, setPreviewingVersion] = useState(null);

  const isProgrammaticUpdate = useRef(false);
  const typingIndicatorTimer = useRef(null);
  const typingTimer = useRef(null);
  const textCursorFlagTimer = useRef(null);

  // Helper: Log Activity
  const logActivity = (actionText) => {
    push(ref(rtdb, `bridges/${bridgeId}/timeline`), {
      user: currentUsername,
      action: actionText,
      timestamp: serverTimestamp()
    });
  };

  // Helper: Save version
  const saveVersionSnapshot = (content) => {
    const historyRef = ref(rtdb, `bridges/${bridgeId}/history`);
    push(historyRef, { content: content, author: currentUsername, timestamp: serverTimestamp() });
  };

  useEffect(() => {
    if (!bridgeId) return;

    // Timeline sync
    const unsubTimeline = onValue(ref(rtdb, `bridges/${bridgeId}/timeline`), (snap) => {
      let events = [];
      if (snap.exists()) {
        snap.forEach((child) => { events.push({ id: child.key, ...child.val() }); });
      }
      if (events.length > 50) events = events.slice(events.length - 50);
      setTimelineEvents(events.reverse());
    });

    return () => unsubTimeline();
  }, [bridgeId]);

  useEffect(() => {
    if (!editorRef.current || !bridgeId) return;

    if (!quillInstance.current) {
      quillInstance.current = new window.Quill(editorRef.current, {
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

      cursorModule.current = quillInstance.current.getModule('cursors');
      cursorModule.current.createCursor(partnerUid, partnerUsername, '#0a84ff');

      // Fetch initial data
      get(ref(rtdb, `bridges/${bridgeId}/canvasData`)).then((snap) => {
        if (snap.exists() && snap.val().content) {
          isProgrammaticUpdate.current = true;
          quillInstance.current.setContents(snap.val().content, 'silent');
          isProgrammaticUpdate.current = false;
        }
      });

      // Cursor listener
      quillInstance.current.on('selection-change', function(range, oldRange, source) {
        if (source === 'user' && range) {
          set(ref(rtdb, `bridges/${bridgeId}/textCursors/${currentUser.uid}`), range);
        }
      });

      // Text change listener
      quillInstance.current.on('text-change', function(delta, oldDelta, source) {
        if (source === 'user' && !isProgrammaticUpdate.current) {
          setNotepadStatus("Saving...");
          set(ref(rtdb, `bridges/${bridgeId}/canvasData/typing`), currentUsername);

          clearTimeout(typingIndicatorTimer.current);
          typingIndicatorTimer.current = setTimeout(() => {
            set(ref(rtdb, `bridges/${bridgeId}/canvasData/typing`), "");
          }, 1500);

          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => {
            const fullContent = quillInstance.current.getContents();
            set(ref(rtdb, `bridges/${bridgeId}/canvasData`), {
              content: fullContent,
              lastEditor: currentUsername,
              lastEditTime: serverTimestamp(),
              typing: ""
            });
            localStorage.setItem(`lastRead_${bridgeId}`, Date.now());
            logActivity("edited the canvas.");
            saveVersionSnapshot(fullContent);
          }, 1000);
        }
      });

      logActivity("opened the SyncSpace.");

      // Clear badge
      localStorage.setItem(`lastRead_${bridgeId}`, Date.now());
      setHasUnreadJournal(false);
    }

    // Canvas Data Listener (Incoming changes)
    const unsubCanvas = onValue(ref(rtdb, `bridges/${bridgeId}/canvasData`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const remoteContent = data.content;
        const lastEditor = data.lastEditor || "System";
        const activeTypist = data.typing || "";

        if (activeTypist && activeTypist !== currentUsername) {
          setTypingIndicator(`${activeTypist} is typing...`);
        } else {
          setTypingIndicator("");
        }

        setNotepadStatus(`☁️ Synced • Last edit by ${lastEditor}`);

        if (quillInstance.current && lastEditor !== currentUsername && remoteContent) {
          isProgrammaticUpdate.current = true;
          quillInstance.current.setContents(remoteContent, 'silent');
          isProgrammaticUpdate.current = false;
        }
      }
    });

    // Partner Cursor Listener
    const unsubCursor = onValue(ref(rtdb, `bridges/${bridgeId}/textCursors/${partnerUid}`), (snap) => {
      if (snap.exists() && cursorModule.current) {
        const range = snap.val();
        cursorModule.current.moveCursor(partnerUid, range);
        cursorModule.current.toggleFlag(partnerUid, true);
        clearTimeout(textCursorFlagTimer.current);
        textCursorFlagTimer.current = setTimeout(() => {
          if (cursorModule.current) cursorModule.current.toggleFlag(partnerUid, false);
        }, 2000);
      } else if (cursorModule.current) {
        cursorModule.current.removeCursor(partnerUid);
      }
    });

    return () => {
      unsubCanvas();
      unsubCursor();
      set(ref(rtdb, `bridges/${bridgeId}/textCursors/${currentUser.uid}`), null);
    };
  }, [bridgeId, partnerUid, partnerUsername, currentUsername, currentUser.uid]);

  // Figma Mouse Engine
  const [partnerMouse, setPartnerMouse] = useState(null);
  const mouseThrottleTimer = useRef(0);

  useEffect(() => {
    if (!bridgeId) return;

    const unsubPartnerMouse = onValue(ref(rtdb, `bridges/${bridgeId}/mousePointers/${partnerUid}`), (snap) => {
      if (snap.exists()) {
        setPartnerMouse(snap.val());
      } else {
        setPartnerMouse(null);
      }
    });

    const handleMouseMove = (e) => {
      const editorDiv = document.querySelector('.notion-page');
      if (editorDiv) {
        const now = Date.now();
        if (now - mouseThrottleTimer.current > 50) {
          mouseThrottleTimer.current = now;
          const rect = editorDiv.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const xPercent = (e.clientX - rect.left) / rect.width;
            const yPercent = (e.clientY - rect.top) / rect.height;
            set(ref(rtdb, `bridges/${bridgeId}/mousePointers/${currentUser.uid}`), { x: xPercent, y: yPercent });
          } else {
            set(ref(rtdb, `bridges/${bridgeId}/mousePointers/${currentUser.uid}`), null);
          }
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      unsubPartnerMouse();
      document.removeEventListener('mousemove', handleMouseMove);
      set(ref(rtdb, `bridges/${bridgeId}/mousePointers/${currentUser.uid}`), null);
    };
  }, [bridgeId, partnerUid, currentUser.uid]);

  // Version History
  useEffect(() => {
    if (isHistoryOpen) {
      setOriginalContentBeforePreview(quillInstance.current.getContents());
      const unsubHistory = onValue(ref(rtdb, `bridges/${bridgeId}/history`), (snap) => {
        let versions = [];
        if (snap.exists()) {
          snap.forEach(child => { versions.push({ id: child.key, ...child.val() }); });
        }
        setHistoryEvents(versions.reverse());
      });
      return () => unsubHistory();
    } else {
      if (originalContentBeforePreview && quillInstance.current) {
          isProgrammaticUpdate.current = true;
          quillInstance.current.setContents(originalContentBeforePreview);
          isProgrammaticUpdate.current = false;
          setNotepadStatus("☁️ Synced");
      }
      setPreviewingVersion(null);
    }
  }, [isHistoryOpen, bridgeId]);

  const previewVersion = async (versionId) => {
    setPreviewingVersion(versionId);
    const snap = await get(ref(rtdb, `bridges/${bridgeId}/history/${versionId}`));
    if (snap.exists()) {
      isProgrammaticUpdate.current = true;
      quillInstance.current.setContents(snap.val().content);
      isProgrammaticUpdate.current = false;
      setNotepadStatus("👁️ Previewing Old Version...");
    }
  };

  const cancelPreview = () => {
    if (originalContentBeforePreview) {
      isProgrammaticUpdate.current = true;
      quillInstance.current.setContents(originalContentBeforePreview);
      isProgrammaticUpdate.current = false;
      setNotepadStatus("☁️ Synced");
    }
    setPreviewingVersion(null);
  };

  const restoreVersion = async (versionId) => {
    const snap = await get(ref(rtdb, `bridges/${bridgeId}/history/${versionId}`));
    if (snap.exists()) {
      const versionData = snap.val();
      set(ref(rtdb, `bridges/${bridgeId}/canvasData`), {
        content: versionData.content,
        lastEditor: `${currentUsername} (Restored)`,
        typing: ""
      });
      logActivity(`restored a version from ${new Date(versionData.timestamp).toLocaleTimeString()}.`);
      setOriginalContentBeforePreview(versionData.content);
      setIsHistoryOpen(false);
    }
  };

  return (
    <div className="journal-layout" style={{ position: 'relative' }}>
      <div className="canvas-container">
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 className="view-title" style={{ margin: 0, fontSize: '28px' }}>SyncSpace</h1>
              <div className="mobile-status-chip">
                <div id="mobileDot" className={`status-dot-small ${partnerIsOnline ? 'online' : ''}`}></div>
                <span id="mobileStatusText" style={{ fontSize: '11px', color: 'var(--text-faded)' }}>{partnerIsOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <p id="notepadStatus" style={{ margin: 0, fontSize: '13px', color: 'var(--text-faded)' }}>{notepadStatus}</p>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button className="action-btn" style={{ margin: 0, padding: '4px 12px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'white' }} onClick={() => setIsHistoryOpen(!isHistoryOpen)}>📜 History</button>
              </div>

              <div className={`history-popup ${isHistoryOpen ? 'active' : ''}`}>
                <div className="timeline-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px' }}>
                  <span>Version History</span>
                  <span onClick={() => setIsHistoryOpen(false)} style={{ cursor: 'pointer', fontSize: '18px' }}>×</span>
                </div>
                <div className="history-feed-container">
                  {historyEvents.length === 0 ? (
                    <div style={{ padding: '20px', color: 'var(--text-faded)', textAlign: 'center' }}>No history yet.</div>
                  ) : (
                    historyEvents.map(v => {
                      const date = new Date(v.timestamp);
                      const isPreviewing = previewingVersion === v.id;
                      return (
                        <div key={v.id} className={`history-item ${isPreviewing ? 'previewing' : ''}`} onClick={() => previewVersion(v.id)} style={{ cursor: 'pointer', padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ fontSize: '9px', color: 'var(--accent-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Snapshot</div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'white' }}>By {v.author}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-faded)' }}>{date.toLocaleDateString()} • {date.toLocaleTimeString()}</div>
                          {isPreviewing && (
                            <div style={{ display: 'flex', marginTop: '10px', gap: '10px' }}>
                              <button className="action-btn" style={{ padding: '5px 10px', fontSize: '10px', flex: 1, background: '#32d74b' }} onClick={(e) => { e.stopPropagation(); restoreVersion(v.id); }}>Confirm Restore</button>
                              <button className="action-btn" style={{ padding: '5px 10px', fontSize: '10px', flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={(e) => { e.stopPropagation(); cancelPreview(); }}>Cancel</button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className={`typing-indicator ${typingIndicator ? 'active' : ''}`}>{typingIndicator}</p>
        </div>
        <div className="notion-page" style={{ position: 'relative' }}>
          <div ref={editorRef} id="editorCore"></div>
          {partnerMouse && (
              <div className="mouse-pointer" style={{ position: 'absolute', top: 0, left: 0, display: 'flex', transform: `translate(${partnerMouse.x * 100}%, ${partnerMouse.y * 100}%)` }}>
                 <svg viewBox="0 0 16 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.38316 1.48911C1.04944 0.988457 1.45524 0.315904 2.05285 0.380755L14.7761 1.76184C15.3526 1.82442 15.5401 2.55938 15.0886 2.98687L11.5303 6.35565C11.3323 6.54316 11.2339 6.81432 11.2678 7.085L12.5645 17.4361C12.6366 18.0121 12.0163 18.4206 11.4965 18.1408L5.34149 14.8276C5.10189 14.6986 4.81524 14.7171 4.59103 14.8761L0.640954 17.6756C0.180016 18.0023 -0.428789 17.5857 -0.347573 17.0097L1.38316 1.48911Z" fill="#0a84ff" stroke="white" strokeWidth="1.5"/>
                 </svg>
                 <div className="mouse-name-tag">{partnerUsername}</div>
              </div>
          )}
        </div>
      </div>

      <div className="timeline-panel">
        <div className="timeline-header">Activity Feed</div>
        <div className="timeline-feed">
          {timelineEvents.length === 0 ? (
            <p style={{ color: 'var(--text-faded)', fontSize: '12px' }}>No activity yet.</p>
          ) : (
            timelineEvents.map(ev => {
              const isPartner = ev.user !== currentUsername;
              const timeStr = new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={ev.id} className={`timeline-event ${isPartner ? 'partner' : ''}`}>
                  <div><b>{ev.user}</b> {ev.action}</div>
                  <div className="timeline-time">{timeStr}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default SyncSpace;
