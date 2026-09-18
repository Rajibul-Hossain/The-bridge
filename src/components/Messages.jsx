import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ref, onValue, set, update, push, remove, onChildAdded, onDisconnect, get } from 'firebase/database';
import { ref as sRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { rtdb, storage } from '../firebase';

const rtcConfig = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
};

function Messages({ partnerUsername, partnerIsOnline, setUnreadMessagesCount }) {
  const { currentUsername, currentUser, bridgeId } = useAuth();

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ show: false, percent: 0 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [replyData, setReplyData] = useState(null);

  const [menuData, setMenuData] = useState({ show: false, msgId: null, text: '', sender: '', isMe: false, timestamp: 0 });

  // Call Engine State
  const [callState, setCallState] = useState({
      isActive: false, statusText: '', partnerName: '',
      isIncoming: false, showAnswerBtn: false, duration: 0,
      isMuted: false, isRecording: false, isVideo: false
  });
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [editMessageId, setEditMessageId] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [missedCalls, setMissedCalls] = useState(0);

  const chatFeedRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);
  const callTimerInterval = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const currentCallId = useRef(null);
  const callInitiator = useRef(null);
  const callStartTime = useRef(0);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getInstagramSeenText = (readAtTime) => {
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

  // --- 1. CHAT ENGINE ---
  useEffect(() => {
    if (!bridgeId) return;

    const msgsRef = ref(rtdb, `bridges/${bridgeId}/messages`);

    // Initial fetch from local storage for fast render
    const cacheKey = `syncspace_messages_${bridgeId}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const parsedCache = JSON.parse(cachedData);
            const sortedCache = Object.entries(parsedCache).map(([id, msg]) => ({id, ...msg})).sort((a, b) => a.timestamp - b.timestamp);
            setMessages(sortedCache);
            setTimeout(() => {
                if (chatFeedRef.current) chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
            }, 100);
        } catch (e) { console.error("Cache error", e); }
    }

    const unsubMsgs = onValue(msgsRef, (snapshot) => {
        set(ref(rtdb, `bridges/${bridgeId}/readReceipts/${currentUsername}`), Date.now());

        if (snapshot.exists()) {
            const data = snapshot.val();
            localStorage.setItem(cacheKey, JSON.stringify(data));
            const sortedMsgs = Object.entries(data).map(([id, msg]) => ({id, ...msg})).sort((a, b) => a.timestamp - b.timestamp);

            let hasUnread = false;
            const updates = {};
            sortedMsgs.forEach(msg => {
                if (msg.sender !== currentUsername && !msg.readAt) {
                    const now = Date.now();
                    updates[`${msg.id}/readAt`] = now;
                    msg.readAt = now;
                    hasUnread = true;
                }
            });

            if (hasUnread) {
                update(msgsRef, updates).catch(console.error);
                localStorage.setItem(cacheKey, JSON.stringify(data));
            }

            setMessages(sortedMsgs);
            setTimeout(() => {
                if (chatFeedRef.current) chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
            }, 100);
        } else {
            setMessages([]);
            localStorage.removeItem(cacheKey);
        }
    });

    const unsubTyping = onValue(ref(rtdb, `bridges/${bridgeId}/typing/${partnerUsername}`), (snap) => {
        setIsTyping(snap.val() === true);
    });

    return () => {
        unsubMsgs();
        unsubTyping();
        setUnreadMessagesCount(0); // clear global badge when on messages tab
    };
  }, [bridgeId, currentUsername, partnerUsername, setUnreadMessagesCount]);

  const handleInputChange = (e) => {
      setInputValue(e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

      set(ref(rtdb, `bridges/${bridgeId}/typing/${currentUsername}`), true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
          set(ref(rtdb, `bridges/${bridgeId}/typing/${currentUsername}`), false);
      }, 2000);
  };

  const sendMessage = async () => {
    const text = inputValue.trim();
    if (!text && !replyData) return;

    const newMsgRef = push(ref(rtdb, `bridges/${bridgeId}/messages`));
    const msgData = {
        text: text,
        sender: currentUsername,
        timestamp: Date.now(),
        edited: false
    };

    if (replyData) {
        msgData.replyTo = {
            id: replyData.id,
            text: replyData.text,
            sender: replyData.sender
        };
    }

    try {
        await set(newMsgRef, msgData);
        setInputValue('');
        setReplyData(null);
        set(ref(rtdb, `bridges/${bridgeId}/typing/${currentUsername}`), false);
        set(ref(rtdb, `bridges/${bridgeId}/readReceipts/${currentUsername}`), Date.now());
        if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) { console.error(e); }
  };

  const clearMyChat = async () => {
      if (window.confirm("Clear all messages? This deletes them on your screen only.")) {
          await set(ref(rtdb, `bridges/${bridgeId}/clearedAt/${currentUsername}`), Date.now());
          if (navigator.vibrate) navigator.vibrate([20, 30]);
          setMessages([]); // optimistic clear
      }
  };

  const uploadMedia = async (file, type) => {
      setUploadProgress({ show: true, percent: 0 });
      const uniqueName = `${Date.now()}_${file.name || 'voicenote.webm'}`;
      const storageRef = sRef(storage, `bridges/${bridgeId}/media/${uniqueName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snap) => setUploadProgress({ show: true, percent: (snap.bytesTransferred / snap.totalBytes) * 100 }),
        (err) => { console.error(err); setUploadProgress({ show: false, percent: 0 }); },
        async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setUploadProgress({ show: false, percent: 0 });
            await push(ref(rtdb, `bridges/${bridgeId}/messages`), {
                text: "", mediaUrl: downloadURL, mediaType: type,
                sender: currentUsername, timestamp: Date.now(), edited: false
            });
        }
      );
  };

  const startVoiceRecord = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder.current = new MediaRecorder(stream);
          audioChunks.current = [];

          mediaRecorder.current.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
          mediaRecorder.current.onstop = async () => {
              const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
              if (audioBlob.size > 500) await uploadMedia(audioBlob, 'audio');
              stream.getTracks().forEach(track => track.stop());
          };
          mediaRecorder.current.start();
          if (navigator.vibrate) navigator.vibrate(20);
      } catch (e) { console.error(e); alert("Mic access denied"); }
  };

  const stopVoiceRecord = () => {
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          mediaRecorder.current.stop();
          if (navigator.vibrate) navigator.vibrate(10);
      }
  };

  // --- 2. MENU ACTIONS ---
  const handleMenuAction = async (action) => {
      const { msgId, text } = menuData;
      setMenuData({ ...menuData, show: false });

      if (action === 'copy') navigator.clipboard.writeText(text);
      if (action === 'unsend') await remove(ref(rtdb, `bridges/${bridgeId}/messages/${msgId}`));
      if (action === 'reply') {
          setReplyData({ id: msgId, text: text || "Media Attachment", sender: menuData.sender });
          document.getElementById('chatInputMessage').focus();
      }
      if (action === 'edit') {
          setInputValue(text);
          // For simplicity in React, we'll store edit mode in state instead of replacing onclick
          // Note: Implementing true edit logic here:
          const handleEditSend = async () => {
              const newText = document.getElementById('chatInputMessage').value.trim();
              if (newText && newText !== text) {
                  await update(ref(rtdb, `bridges/${bridgeId}/messages/${msgId}`), { text: newText, edited: true });
              }
              setInputValue('');
              document.getElementById('sendBtnIcon').style.display = 'block';
              document.getElementById('editCheckIcon').style.display = 'none';
          };

          document.getElementById('sendBtnIcon').style.display = 'none';
          document.getElementById('editCheckIcon').style.display = 'block';
          document.getElementById('mainSendBtn').onclick = handleEditSend;
      }
  };

  // --- 3. CALL ENGINE (AUDIO) ---
  useEffect(() => {
    if (!bridgeId) return;

    const callRef = ref(rtdb, `bridges/${bridgeId}/call`);
    const unsubCall = onValue(callRef, (snap) => {
        const data = snap.val();
        if (data && data.offer && data.caller !== currentUsername && !callState.isActive) {
            callInitiator.current = data.caller;
            callStartTime.current = data.timestamp;
            currentCallId.current = data.callId;
            setCallState(prev => ({ ...prev, isActive: true, statusText: 'Incoming Call...', partnerName: data.caller, isIncoming: true, showAnswerBtn: true, isVideo: !!data.isVideo }));
        }
        if (!data && callState.isActive && !callState.isVideo) {
            terminateCall();
        }
    });

    const myHistoryRef = ref(rtdb, `bridges/${bridgeId}/callHistoryReadReceipts/${currentUsername}`);
    const callHistRef = ref(rtdb, `bridges/${bridgeId}/callHistory`);

    const unsubMyHistRead = onValue(myHistoryRef, (readSnap) => {
        const myLastChecked = readSnap.val() || 0;
        onValue(callHistRef, (histSnap) => {
            let missed = 0;
            if (histSnap.exists()) {
                histSnap.forEach(child => {
                    const call = child.val();
                    if (call.caller !== currentUsername && call.duration === 0 && call.timestamp > myLastChecked) {
                        missed++;
                    }
                });
            }
            setMissedCalls(missed);
        });
    });

    return () => { unsubCall(); unsubMyHistRead(); };
  }, [bridgeId, currentUsername, callState.isActive, callState.isVideo]);

  const startAudioCall = async () => {
    setCallState(prev => ({ ...prev, isActive: true, statusText: 'Calling...', partnerName: partnerUsername, isIncoming: false, showAnswerBtn: false, isVideo: false }));
    currentCallId.current = `call_${Date.now()}`;
    callInitiator.current = currentUsername;

    set(ref(rtdb, `bridges/${bridgeId}/callHistory/${currentCallId.current}`), {
        caller: currentUsername, duration: 0, timestamp: Date.now()
    });

    try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        document.getElementById('localAudio').srcObject = localStream.current;

        peerConnection.current = new RTCPeerConnection(rtcConfig);
        localStream.current.getTracks().forEach(t => peerConnection.current.addTrack(t, localStream.current));

        peerConnection.current.ontrack = (e) => {
            remoteStream.current = e.streams[0];
            document.getElementById('remoteAudio').srcObject = remoteStream.current;
            triggerCallConnectedUI();
        };

        peerConnection.current.onicecandidate = (e) => {
            if (e.candidate) push(ref(rtdb, `bridges/${bridgeId}/call/callerCandidates`), e.candidate.toJSON());
        };

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        await set(ref(rtdb, `bridges/${bridgeId}/call`), {
            callId: currentCallId.current, offer: { type: offer.type, sdp: offer.sdp },
            caller: currentUsername, timestamp: Date.now()
        });

        onValue(ref(rtdb, `bridges/${bridgeId}/call/answer`), (snap) => {
            const answer = snap.val();
            if (answer && !peerConnection.current.currentRemoteDescription) {
                peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        onChildAdded(ref(rtdb, `bridges/${bridgeId}/call/calleeCandidates`), (snap) => {
            peerConnection.current.addIceCandidate(new RTCIceCandidate(snap.val()));
        });
    } catch (e) { console.error(e); alert("Mic required"); terminateCall(); }
  };

  const answerCall = async () => {
      setCallState(prev => ({ ...prev, showAnswerBtn: false, statusText: 'Connecting...' }));

      try {
          const callSnap = await get(ref(rtdb, `bridges/${bridgeId}/call`));
          if (!callSnap.exists()) return terminateCall();
          const callData = callSnap.val();

          const isVideo = callData.isVideo === true;
          setCallState(prev => ({ ...prev, isVideo }));

          localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
          if(isVideo) {
             document.getElementById('localVideo').srcObject = localStream.current;
          } else {
             document.getElementById('localAudio').srcObject = localStream.current;
          }

          peerConnection.current = new RTCPeerConnection(rtcConfig);
          localStream.current.getTracks().forEach(t => peerConnection.current.addTrack(t, localStream.current));

          peerConnection.current.ontrack = (e) => {
              remoteStream.current = e.streams[0];
              if(isVideo) {
                  document.getElementById('remoteVideo').srcObject = remoteStream.current;
              } else {
                  document.getElementById('remoteAudio').srcObject = remoteStream.current;
              }
              triggerCallConnectedUI();
          };

          peerConnection.current.onicecandidate = (e) => {
              if (e.candidate) push(ref(rtdb, `bridges/${bridgeId}/call/calleeCandidates`), e.candidate.toJSON());
          };

          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);

          await set(ref(rtdb, `bridges/${bridgeId}/call/answer`), { type: answer.type, sdp: answer.sdp });

          onChildAdded(ref(rtdb, `bridges/${bridgeId}/call/callerCandidates`), (snap) => {
              if(peerConnection.current) peerConnection.current.addIceCandidate(new RTCIceCandidate(snap.val()));
          });
      } catch (e) { console.error(e); terminateCall(); }
  };

  const triggerCallConnectedUI = () => {
      setCallState(prev => ({ ...prev, statusText: 'Connected 🎙️' }));
      callStartTime.current = Date.now();
      callTimerInterval.current = setInterval(() => {
          setCallState(prev => ({ ...prev, duration: Math.floor((Date.now() - callStartTime.current) / 1000) }));
      }, 1000);
  };


  const startVideoCall = async () => {
      setCallState(prev => ({ ...prev, isActive: true, statusText: 'Connecting...', partnerName: partnerUsername, isIncoming: false, showAnswerBtn: false, isVideo: true }));
      currentCallId.current = `call_${Date.now()}`;
      callInitiator.current = currentUsername;

      set(ref(rtdb, `bridges/${bridgeId}/callHistory/${currentCallId.current}`), {
          caller: currentUsername, duration: 0, timestamp: Date.now()
      });

      try {
          localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          document.getElementById('localVideo').srcObject = localStream.current;

          peerConnection.current = new RTCPeerConnection(rtcConfig);
          localStream.current.getTracks().forEach(t => peerConnection.current.addTrack(t, localStream.current));

          peerConnection.current.ontrack = (e) => {
              remoteStream.current = e.streams[0];
              document.getElementById('remoteVideo').srcObject = remoteStream.current;
              triggerCallConnectedUI();
          };

          peerConnection.current.onicecandidate = (e) => {
              if (e.candidate) push(ref(rtdb, `bridges/${bridgeId}/call/callerCandidates`), e.candidate.toJSON());
          };

          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);

          await set(ref(rtdb, `bridges/${bridgeId}/call`), {
              callId: currentCallId.current,
              offer: { type: offer.type, sdp: offer.sdp },
              caller: currentUsername,
              timestamp: Date.now(),
              isVideo: true
          });

          onValue(ref(rtdb, `bridges/${bridgeId}/call/answer`), (snap) => {
              const answer = snap.val();
              if (answer && peerConnection.current && !peerConnection.current.currentRemoteDescription) {
                  peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
              }
          });

          onChildAdded(ref(rtdb, `bridges/${bridgeId}/call/calleeCandidates`), (snap) => {
              if(peerConnection.current) peerConnection.current.addIceCandidate(new RTCIceCandidate(snap.val()));
          });

      } catch (e) { console.error(e); alert("Camera required"); terminateCall(); }
  };

  const toggleCallMute = () => {
      if (!localStream.current) return;
      const isMuted = !callState.isMuted;
      localStream.current.getAudioTracks()[0].enabled = !isMuted;
      setCallState(prev => ({ ...prev, isMuted }));
  };

  const toggleCallRecording = () => {
      if (!callState.isRecording) {
          if (!remoteStream.current) return alert("No remote audio to record.");

          // Mixed stream if we want to record both
          const mixedStream = new MediaStream([
              ...localStream.current.getAudioTracks(),
              ...remoteStream.current.getAudioTracks()
          ]);

          mediaRecorder.current = new MediaRecorder(mixedStream);
          recordedChunks.current = [];

          mediaRecorder.current.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunks.current.push(e.data);
          };

          mediaRecorder.current.onstop = () => {
              const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = url;
              a.download = `call_recording_${Date.now()}.webm`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
          };

          mediaRecorder.current.start();
          setCallState(prev => ({ ...prev, isRecording: true }));
      } else {
          if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
              mediaRecorder.current.stop();
          }
          setCallState(prev => ({ ...prev, isRecording: false }));
      }
  };

  const terminateCall = () => {
      clearInterval(callTimerInterval.current);
      if (currentCallId.current && callState.duration > 0) {
          update(ref(rtdb, `bridges/${bridgeId}/callHistory/${currentCallId.current}`), { duration: callState.duration });
      }
      if (peerConnection.current) peerConnection.current.close();
      if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
      remove(ref(rtdb, `bridges/${bridgeId}/call`)).catch(console.error);

      setCallState({ isActive: false, statusText: '', partnerName: '', isIncoming: false, showAnswerBtn: false, duration: 0, isMuted: false, isRecording: false, isVideo: false });
  };

  const openCallHistory = () => {
      setShowCallHistory(true);
      set(ref(rtdb, `bridges/${bridgeId}/callHistoryReadReceipts/${currentUsername}`), Date.now());
      onValue(ref(rtdb, `bridges/${bridgeId}/callHistory`), (snap) => {
          if (snap.exists()) {
              const histArray = Object.entries(snap.val()).map(([id, data]) => ({id, ...data})).sort((a,b) => b.timestamp - a.timestamp);
              setCallHistory(histArray);
          } else setCallHistory([]);
      }, { onlyOnce: true });
  };

  // Check cleared status
  const [myClearedAt, setMyClearedAt] = useState(0);
  useEffect(() => {
      if(bridgeId) {
          onValue(ref(rtdb, `bridges/${bridgeId}/clearedAt/${currentUsername}`), snap => {
              setMyClearedAt(snap.val() || 0);
          });
      }
  }, [bridgeId, currentUsername]);


  return (
    <div className="chat-wrapper">
      {/* HEADER */}
      <div className="chat-header-godtier">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="avatar-godtier">👻</div>
          <div className="header-text-group">
            <h2 className="chat-title-pro">{partnerUsername}</h2>
            {isTyping ? (
              <p className="chat-status-typing">
                  Typing <span className="status-dot"></span><span className="status-dot"></span><span className="status-dot"></span>
              </p>
            ) : (
              <p className="chat-status-typing" style={{ color: partnerIsOnline ? '#32d74b' : 'var(--text-faded)' }}>
                  {partnerIsOnline ? 'Connected' : 'Offline'}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="icon-btn-pro" data-tip="Clear Chat for Me" style={{ background: 'transparent', color: '#ff3b30' }} onClick={clearMyChat}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
          <button className="icon-btn-pro" data-tip="Call History" style={{ background: 'transparent', color: 'white', position: 'relative' }} onClick={openCallHistory}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span style={{ display: missedCalls > 0 ? 'flex' : 'none', position: 'absolute', top: '-5px', right: '-5px', background: '#ff3b30', color: 'white', fontSize: '10px', fontWeight: 800, width: '16px', height: '16px', borderRadius: '50%', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 10px rgba(255,59,48,0.5)', fontFamily: "'Poppins', sans-serif" }}>{missedCalls}</span>
          </button>
          <button className="icon-btn-pro" data-tip="Start Audio Call" style={{ background: 'transparent', color: 'white' }} onClick={startAudioCall}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </button>
          <button className="icon-btn-pro" data-tip="Video Call" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff', border: '1px solid rgba(10, 132, 255, 0.3)', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={startVideoCall}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
              <polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>
        </div>
      </div>

      {/* FEED */}
      <div className="chat-feed" id="chatFeed" ref={chatFeedRef}>
        {messages.filter(m => m.timestamp > myClearedAt).map((msg, index) => {
            const isMe = msg.sender === currentUsername;
            const isMyLast = isMe && (index === messages.length - 1 || messages.slice(index + 1).every(m => m.sender !== currentUsername));

            return (
                <div key={msg.id} className={`message-row ${isMe ? 'sent' : 'received'} animate-in`}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                        <div className={`bubble ${isMe ? 'sent' : 'received'}`}
                             onClick={() => setMenuData({ show: true, msgId: msg.id, text: msg.text || "Media", sender: msg.sender, isMe, timestamp: msg.timestamp })}>

                            {msg.replyTo && (
                                <div onClick={(e) => { e.stopPropagation(); document.getElementById(`msg-${msg.replyTo.id}`)?.scrollIntoView({behavior: 'smooth'}) }}
                                     style={{ background: 'rgba(0,0,0,0.15)', borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.7)' : '#ff2a5f'}`, padding: '8px 10px', borderRadius: '8px', marginBottom: '6px', fontSize: '11px', cursor: 'pointer' }}>
                                    <strong style={{ color: isMe ? 'white' : '#ff2a5f', letterSpacing: '0.5px' }}>{msg.replyTo.sender}</strong><br/>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '180px', opacity: 0.8 }}>{msg.replyTo.text}</span>
                                </div>
                            )}

                            {msg.mediaUrl && (
                                msg.mediaType === 'image' ? <img src={msg.mediaUrl} style={{ maxWidth: '100%', borderRadius: '14px', marginBottom: '8px' }} onClick={() => window.open(msg.mediaUrl, '_blank')} alt="attachment" /> :
                                msg.mediaType === 'video' ? <video src={msg.mediaUrl} controls style={{ maxWidth: '100%', borderRadius: '14px', marginBottom: '8px' }}></video> :
                                msg.mediaType === 'audio' ? <audio src={msg.mediaUrl} controls style={{ maxWidth: '100%', height: '35px', borderRadius: '20px', outline: 'none', marginBottom: '8px', filter: `drop-shadow(0 4px 10px rgba(0,0,0,0.3)) ${isMe ? 'invert(1)' : ''}` }}></audio> : null
                            )}

                            {msg.text && <span>{msg.text}</span>}
                            {msg.edited && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px', fontStyle: 'italic' }}>(edited)</span>}

                            <div className="msg-time" style={{ display: 'flex', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: '6px' }}>
                                {formatTime(msg.timestamp)}
                                {isMe && isMyLast && (
                                    <span style={{ marginLeft: '6px', paddingLeft: '6px', borderLeft: '1px solid rgba(255,255,255,0.2)', color: msg.readAt ? '#32d74b' : 'rgba(255, 255, 255, 0.6)', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', fontSize: '9px' }}>
                                        {msg.readAt ? `Read ${getInstagramSeenText(msg.readAt)}` : 'Delivered'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
      </div>

      {/* INPUT AREA */}
      <div style={{ position: 'absolute', bottom: '24px', left: '20px', right: '20px', zIndex: 100, display: 'flex', flexDirection: 'column' }}>

        {uploadProgress.show && (
            <div style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: '10px', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${uploadProgress.percent}%`, height: '100%', background: '#32d74b', transition: 'width 0.2s' }}></div>
                </div>
                <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>{Math.round(uploadProgress.percent)}%</span>
            </div>
        )}

        {replyData && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(10px)' }}>
                <div style={{ flex: 1, overflow: 'hidden', borderLeft: '3px solid #ff2a5f', paddingLeft: '10px' }}>
                    <span style={{ color: '#ff2a5f', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Replying to {replyData.sender}</span>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyData.text}</p>
                </div>
                <button className="icon-btn-pro" style={{ width: '25px', height: '25px', background: 'rgba(255,255,255,0.1)' }} onClick={() => setReplyData(null)}>✕</button>
            </div>
        )}

        <div className="input-godtier" style={{ borderTopLeftRadius: replyData ? 0 : '40px', borderTopRightRadius: replyData ? 0 : '40px' }}>
            <button className="icon-btn-pro" data-tip="Emojis" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
            </button>

            <button data-tip="Attach Media" className="icon-btn-pro" onClick={() => fileInputRef.current.click()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </button>
            <input type="file" ref={fileInputRef} accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => { if(e.target.files[0]) uploadMedia(e.target.files[0], e.target.files[0].type.startsWith('video/') ? 'video' : 'image') }} />

            <textarea id="chatInputMessage" className="chat-textarea" placeholder="iMessage..." rows="1" value={inputValue} onChange={handleInputChange} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('mainSendBtn').click(); } }}></textarea>

            <button data-tip="Hold to Record" className="icon-btn-pro" style={{ background: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff', transition: 'all 0.2s ease' }} onMouseDown={startVoiceRecord} onMouseUp={stopVoiceRecord} onMouseLeave={stopVoiceRecord}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </button>

            <button id="mainSendBtn" data-tip={editMessageId ? "Edit Message" : "Send Message"} className="send-core-btn" onClick={sendMessage}>
                {editMessageId ? (
                    <span id="editCheckIcon" style={{ display: 'block' }}>✅</span>
                ) : (
                    <svg id="sendBtnIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                )}
            </button>
        </div>
      </div>

      {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '85px', left: '20px', background: 'rgba(20,20,25,0.95)', backdropFilter: 'blur(25px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '15px', zIndex: 100, boxShadow: '0 15px 30px rgba(0,0,0,0.6)', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {['😂','❤️','😍','🥺','🔥','✨','👻','💀','👀','🙏','😊','😭'].map(em => (
                  <button key={em} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer' }} onClick={() => { setInputValue(prev => prev + em); setShowEmojiPicker(false); document.getElementById('chatInputMessage').focus(); }}>{em}</button>
              ))}
          </div>
      )}


      {/* CALL OVERLAY */}
      <div id="activeCallOverlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: callState.isVideo ? '#030305' : 'rgba(10, 10, 15, 0.9)', backdropFilter: callState.isVideo ? 'none' : 'blur(50px) saturate(200%)', zIndex: 9999999, display: callState.isActive ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Poppins', sans-serif" }}>

        {/* Hidden Audio Elements for Voice calls */}
        <audio id="localAudio" autoPlay muted></audio>
        <audio id="remoteAudio" autoPlay></audio>

        {callState.isVideo && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                <video id="remoteVideo" autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#0a0a0c' }}></video>
                <div style={{ position: 'absolute', top: '50px', right: '20px', width: '120px', height: '180px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.15)', zIndex: 10, background: '#111' }}>
                    <video id="localVideo" autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}></video>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '180px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)', zIndex: 5, pointerEvents: 'none' }}></div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '250px', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', zIndex: 5, pointerEvents: 'none' }}></div>
            </div>
        )}

        <div style={{ marginBottom: '40px', position: 'absolute', top: '10%', zIndex: 10, left: callState.isVideo ? '25px' : 'auto', textAlign: callState.isVideo ? 'left' : 'center' }}>
            <h2 style={{ color: 'white', fontSize: callState.isVideo ? '26px' : '28px', fontWeight: callState.isVideo ? 600 : 700, margin: callState.isVideo ? '0' : '0 0 5px 0', textShadow: callState.isVideo ? '0 2px 10px rgba(0,0,0,0.5)' : 'none' }}>{callState.isVideo ? callState.partnerName : callState.statusText}</h2>
            <p style={{ color: callState.isVideo ? 'rgba(255,255,255,0.7)' : '#ff2a5f', fontSize: callState.isVideo ? '15px' : '16px', fontWeight: callState.isVideo ? 500 : 600, margin: callState.isVideo ? '2px 0 0 0' : '0 0 15px 0', textTransform: callState.isVideo ? 'none' : 'uppercase', letterSpacing: callState.isVideo ? 'normal' : '2px' }}>{callState.isVideo ? callState.statusText : callState.partnerName}</p>
            {callState.duration > 0 && !callState.isVideo && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px', fontWeight: 500 }}>{String(Math.floor(callState.duration/60)).padStart(2, '0')}:{String(callState.duration%60).padStart(2, '0')}</span>
                </div>
            )}
        </div>

        {!callState.isVideo && (
            <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: 'linear-gradient(135deg, #2a2a30, #121215)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '65px', boxShadow: '0 0 50px rgba(255, 42, 95, 0.3)', border: '2px solid rgba(255,42,95,0.5)', position: 'relative', animation: 'pulseCall 2s infinite alternate', zIndex: 10 }}>👻</div>
        )}

        <div style={{ position: 'absolute', bottom: callState.isVideo ? '50px' : '10%', display: 'flex', gap: callState.isVideo ? '30px' : '20px', background: callState.isVideo ? 'none' : 'rgba(255,255,255,0.05)', padding: callState.isVideo ? '0' : '15px 25px', borderRadius: callState.isVideo ? '0' : '40px', border: callState.isVideo ? 'none' : '1px solid rgba(255,255,255,0.1)', backdropFilter: callState.isVideo ? 'none' : 'blur(20px)', zIndex: 10 }}>
            {callState.showAnswerBtn && (
                <button style={{ width: '60px', height: '60px', borderRadius: '50%', border: 'none', background: '#32d74b', color: 'white', fontSize: '24px', cursor: 'pointer' }} onClick={answerCall}>📞</button>
            )}
            {callState.duration > 0 && (
                <>
                    <button className={`call-action-btn ${callState.isMuted ? 'active' : ''}`} onClick={toggleCallMute}>{callState.isMuted ? '🔇' : '🎤'}</button>
                    {!callState.isVideo && <button className={`call-action-btn ${callState.isRecording ? 'active' : ''}`} onClick={toggleCallRecording} style={{ background: callState.isRecording ? 'red' : '' }}>⏺️</button>}
                </>
            )}
            <button style={{ width: '60px', height: '60px', borderRadius: '50%', border: 'none', background: '#ff3b30', color: 'white', fontSize: '24px', cursor: 'pointer', boxShadow: callState.isVideo ? '0 10px 20px rgba(255,59,48,0.3)' : 'none' }} onClick={terminateCall}>📞</button>
        </div>
      </div>


      {/* CALL HISTORY MODAL */}
      <div className={`glass-modal ${showCallHistory ? 'active' : ''}`}>
        <div className="modal-content" style={{ maxWidth: '400px', padding: '25px' }}>
            <div className="modal-header" style={{ marginBottom: '20px' }}>
                <h3 style={{ margin:0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>⏱️ Call History</h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button className="pro-btn" style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(255, 59, 48, 0.15)', color: '#ff3b30', borderRadius: '8px', border: '1px solid rgba(255,59,48,0.3)' }} onClick={async () => { if(window.confirm("Clear all?")) await remove(ref(rtdb, `bridges/${bridgeId}/callHistory`)); }}>Clear All</button>
                    <button className="close-btn" onClick={() => setShowCallHistory(false)}>×</button>
                </div>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '5px' }}>
                {callHistory.length === 0 ? (
                     <div style={{ textAlign:'center', padding: '30px', color: 'var(--text-faded)' }}><span style={{ fontSize: '30px', display:'block', marginBottom: '10px' }}>📭</span>No past calls found.</div>
                ) : (
                    callHistory.map(call => {
                        const timeStr = new Date(call.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        const mins = Math.floor(call.duration / 60);
                        const secs = call.duration % 60;
                        const durationStr = call.duration > 0 ? `${mins}m ${secs}s` : "";
                        const isMeCaller = call.caller === currentUsername;
                        let icon, color, displayType;
                        if (call.duration === 0) {
                            if (isMeCaller) { displayType = "Canceled"; icon = "🚫"; color = "rgba(255,255,255,0.5)"; }
                            else { displayType = "Missed"; icon = "❌"; color = "#ff3b30"; }
                        } else if (isMeCaller) { displayType = "Outgoing"; icon = "↗️"; color = "#0a84ff"; }
                        else { displayType = "Incoming"; icon = "↙️"; color = "#32d74b"; }

                        return (
                            <div key={call.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '20px' }}>{icon}</span>
                                    <div><div style={{ fontSize: '14px', fontWeight: 600, color: color }}>{displayType} Call</div><div style={{ fontSize: '11px', color: 'var(--text-faded)' }}>{timeStr}</div></div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{durationStr || displayType}</span>
                                    <button className="icon-btn-pro" style={{ width: '28px', height: '28px', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', borderRadius: '6px' }} onClick={async () => await remove(ref(rtdb, `bridges/${bridgeId}/callHistory/${call.id}`))}>🗑️</button>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
      </div>

      {/* MESSAGE CONTEXT MENU */}
      <div className={`haptic-overlay-pro ${menuData.show ? 'active' : ''}`} onClick={() => setMenuData({...menuData, show: false})}>
          <div className="menu-3d" onClick={e => e.stopPropagation()}>
              <button className="haptic-btn-pro" onClick={() => handleMenuAction('reply')}>Reply to Message</button>
              <button className="haptic-btn-pro" onClick={() => handleMenuAction('copy')}>Copy Text</button>
              {menuData.isMe && (Date.now() - menuData.timestamp < 900000) && (
                  <button className="haptic-btn-pro" onClick={() => handleMenuAction('edit')}>Edit Message</button>
              )}
              {menuData.isMe && (
                  <button className="haptic-btn-pro danger" onClick={() => handleMenuAction('unsend')}>Undo Send</button>
              )}
          </div>
      </div>

      <style>{`
          @keyframes pulseCall { 0% { transform: scale(1); box-shadow: 0 0 20px rgba(255, 42, 95, 0.3); } 100% { transform: scale(1.05); box-shadow: 0 0 70px rgba(255, 42, 95, 0.7), 0 0 120px rgba(255, 42, 95, 0.2); } }
          .call-action-btn { width: 60px; height: 60px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.1); color: white; font-size: 20px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: center; align-items: center; }
          .call-action-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-3px); }
          .call-action-btn.active { background: white; color: black; box-shadow: 0 0 20px rgba(255,255,255,0.5); }
      `}</style>
    </div>
  );
}

export default Messages;
