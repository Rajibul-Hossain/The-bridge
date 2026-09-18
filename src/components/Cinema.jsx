import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ref, onValue, update, push } from 'firebase/database';
import { rtdb } from '../firebase';

const YOUTUBE_API_KEY = "AIzaSyDyU-K6yp6iNhpwF0GOfmHsnj8_qHMYhCo";

function Cinema({ partnerUsername }) {
  const { currentUsername, bridgeId } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [interests, setInterests] = useState(JSON.parse(localStorage.getItem('twinVisionInterests')) || [
    'For You', '📱 Shorts', 'Web Dev & CSS', 'IoT & Arduino Projects'
  ]);
  const [activePill, setActivePill] = useState('For You');

  const [mode, setMode] = useState('browse'); // browse, solo, sync
  const [historyType, setHistoryType] = useState(null); // 'history', 'watchLater', null
  const [historyItems, setHistoryItems] = useState([]);

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinModalData, setJoinModalData] = useState(null);

  const [syncStatus, setSyncStatus] = useState('Watching Solo');
  const [isPlayingLocally, setIsPlayingLocally] = useState(false);

  const playerRef = useRef(null);
  const ytPlayerInstance = useRef(null);
  const isRemoteControl = useRef(false);
  const latestCinemaData = useRef(null);
  const driftThreshold = 1.5;

  // Initialize YT API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  const initPlayer = () => {
    if (window.YT && window.YT.Player && !ytPlayerInstance.current && playerRef.current) {
      const safeOrigin = window.location.hostname === '' ? 'http://localhost' : window.location.origin;
      ytPlayerInstance.current = new window.YT.Player(playerRef.current, {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          'autoplay': 0, 'controls': 1, 'rel': 0,
          'modestbranding': 1, 'disablekb': 0,
          'enablejsapi': 1, 'origin': safeOrigin
        },
        events: {
          'onReady': () => {
            console.log("🍿 TwinVision Player Ready.");
            // If we have pending sync data to load
            if (mode === 'sync' && latestCinemaData.current) {
                const d = latestCinemaData.current;
                isRemoteControl.current = true;
                ytPlayerInstance.current.loadVideoById(d.ytId);
                const timePassed = (Date.now() - d.actionTimestamp) / 1000;
                ytPlayerInstance.current.seekTo(d.seekTime + timePassed, true);
                if (d.playbackState === 'playing') ytPlayerInstance.current.playVideo();
                setTimeout(() => { isRemoteControl.current = false; }, 1000);
            }
          },
          'onStateChange': onPlayerStateChange,
          'onError': (e) => {
            if (e.data === 150 || e.data === 101) alert("⚠️ Creator blocked embedding. Try another video!");
          }
        }
      });
    }
  };

  const onPlayerStateChange = (event) => {
    if (!bridgeId) return;

    if (event.data === window.YT.PlayerState.PLAYING || event.data === window.YT.PlayerState.PAUSED) {
      const isPlaying = event.data === window.YT.PlayerState.PLAYING;
      setIsPlayingLocally(isPlaying);

      if (isRemoteControl.current) return;

      if (mode === 'sync') {
        update(ref(rtdb, `bridges/${bridgeId}/cinema/nowWatching`), {
          playbackState: isPlaying ? 'playing' : 'paused',
          lastActionBy: currentUsername,
          seekTime: ytPlayerInstance.current.getCurrentTime(),
          actionTimestamp: Date.now(),
          isScrubbing: false
        });
      }
    }

    if (event.data === window.YT.PlayerState.BUFFERING && mode === 'sync') {
        setSyncStatus('Buffering (Desync)');
    }
  };

  // Search logic
  const searchYouTubeAPI = async (customQuery = null) => {
    const query = customQuery || searchInput.trim();
    if (!query) return;

    const ytMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
      const ytId = ytMatch[1];
      openActionSheet(ytId, "Shared Video Link", `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`, false);
      return;
    }

    const isShortsQuery = query.toLowerCase().includes('shorts');
    setMode('browse');
    setHistoryType(null);
    setResults([]);

    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${isShortsQuery ? 20 : 12}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();

      const formattedResults = data.items.map(item => ({
        ytId: item.id.videoId,
        title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        channel: item.snippet.channelTitle,
        thumbUrl: item.snippet.thumbnails.high.url,
        isShort: isShortsQuery
      }));
      setResults(formattedResults);
    } catch (error) {
      console.error("YouTube Search Failed:", error);
    }
  };

  // Initial load
  useEffect(() => {
    searchYouTubeAPI('Trending Web Dev and Design UI UX');
  }, []);

  // Sync Listener
  useEffect(() => {
    if (!bridgeId) return;

    const unsubCinema = onValue(ref(rtdb, `bridges/${bridgeId}/cinema/nowWatching`), (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      latestCinemaData.current = data;

      if (data.lastActionBy === currentUsername) return;

      if (mode !== 'sync') {
        if (data.playbackState === 'playing') {
          setJoinModalData(data);
          setIsJoinModalOpen(true);
        }
        return;
      }

      if (ytPlayerInstance.current && typeof ytPlayerInstance.current.loadVideoById === 'function') {
        isRemoteControl.current = true;

        const currentUrl = ytPlayerInstance.current.getVideoUrl();
        if (data.ytId && (!currentUrl || !currentUrl.includes(data.ytId))) {
          ytPlayerInstance.current.loadVideoById(data.ytId);
          if(selectedVideo) setSelectedVideo({...selectedVideo, isShort: data.isShort}); // Update short status for layout
        }

        const isPlayingRemote = data.playbackState === 'playing';
        const timePassed = isPlayingRemote ? (Date.now() - data.actionTimestamp) / 1000 : 0;
        const targetSeekTime = data.seekTime + timePassed;
        const localCurrentTime = ytPlayerInstance.current.getCurrentTime() || 0;
        const drift = Math.abs(localCurrentTime - targetSeekTime);

        if (data.isScrubbing || drift > driftThreshold) {
          ytPlayerInstance.current.seekTo(targetSeekTime, true);
          setSyncStatus('Synced');
        }

        if (isPlayingRemote) {
          ytPlayerInstance.current.playVideo();
          setIsPlayingLocally(true);
        } else {
          ytPlayerInstance.current.pauseVideo();
          setIsPlayingLocally(false);
        }

        setTimeout(() => { isRemoteControl.current = false; }, 500);
      }
    });

    return () => unsubCinema();
  }, [bridgeId, mode, currentUsername]);

  const openActionSheet = (ytId, title, thumbUrl, isShort) => {
    setSelectedVideo({ ytId, title, thumbUrl, isShort });
    setIsActionSheetOpen(true);
  };

  const closeActionSheet = () => {
    setIsActionSheetOpen(false);
    setSelectedVideo(null);
  };

  const executeAction = async (action) => {
    if (!selectedVideo) return;
    const { ytId, title, thumbUrl, isShort } = selectedVideo;
    setIsActionSheetOpen(false);

    if (action === 'save') {
      await push(ref(rtdb, `bridges/${bridgeId}/cinema/watchLater`), {
        ytId, title, thumb: thumbUrl, isShort, addedBy: currentUsername, timestamp: Date.now()
      });
      alert("Saved to Watch Later!");
      return;
    }

    push(ref(rtdb, `bridges/${bridgeId}/cinema/history`), {
      ytId, title, thumb: thumbUrl, isShort, watchedBy: currentUsername, timestamp: Date.now()
    });

    setMode(action);
    setSyncStatus(action === 'solo' ? 'Watching Solo' : 'Synced');

    // Ensure player is initialized before loading
    setTimeout(() => {
        if (!ytPlayerInstance.current) initPlayer();

        // Polling to ensure player is ready before issuing commands
        const checkPlayerAndLoad = setInterval(() => {
           if (ytPlayerInstance.current && typeof ytPlayerInstance.current.loadVideoById === 'function') {
               clearInterval(checkPlayerAndLoad);
               ytPlayerInstance.current.loadVideoById(ytId);
               ytPlayerInstance.current.playVideo();

               if (action === 'sync') {
                 update(ref(rtdb, `bridges/${bridgeId}/cinema/nowWatching`), {
                   ytId, videoTitle: title, playbackState: 'playing',
                   lastActionBy: currentUsername, seekTime: 0, actionTimestamp: Date.now(),
                   isScrubbing: true, isShort
                 });
               }
           }
        }, 100);
    }, 100);
  };

  const acceptJoin = () => {
    setIsJoinModalOpen(false);
    setMode('sync');
    setSyncStatus('Synced');

    setTimeout(() => {
        if (!ytPlayerInstance.current) initPlayer();

        const checkPlayerAndLoad = setInterval(() => {
             if (ytPlayerInstance.current && typeof ytPlayerInstance.current.loadVideoById === 'function' && latestCinemaData.current) {
                 clearInterval(checkPlayerAndLoad);
                 const d = latestCinemaData.current;
                 isRemoteControl.current = true;
                 setSelectedVideo({...selectedVideo, isShort: d.isShort});
                 ytPlayerInstance.current.loadVideoById(d.ytId);
                 const timePassed = (Date.now() - d.actionTimestamp) / 1000;
                 ytPlayerInstance.current.seekTo(d.seekTime + timePassed, true);
                 if (d.playbackState === 'playing') ytPlayerInstance.current.playVideo();
                 setTimeout(() => { isRemoteControl.current = false; }, 1000);
             }
        }, 100);
    }, 100);
  };

  const fetchHistory = (type) => {
    setActivePill(type);
    setMode('browse');
    setHistoryType(type);
    setHistoryItems([]);

    const unsub = onValue(ref(rtdb, `bridges/${bridgeId}/cinema/${type}`), (snap) => {
      if (!snap.exists()) {
        setHistoryItems([]);
        return;
      }
      let items = [];
      snap.forEach(child => items.push(child.val()));
      setHistoryItems(items.reverse());
    }, { onlyOnce: true });
  };

  const closeTheater = () => {
    if (ytPlayerInstance.current) ytPlayerInstance.current.pauseVideo();
    setMode('browse');
    setSyncStatus('Watching Solo');
  };

  const togglePlayback = () => {
    if (!ytPlayerInstance.current) return;
    if (isPlayingLocally) ytPlayerInstance.current.pauseVideo();
    else ytPlayerInstance.current.playVideo();
  };

  const forceSync = () => {
    if (!ytPlayerInstance.current || mode !== 'sync') return;
    update(ref(rtdb, `bridges/${bridgeId}/cinema/nowWatching`), {
      playbackState: isPlayingLocally ? 'playing' : 'paused',
      lastActionBy: currentUsername,
      seekTime: ytPlayerInstance.current.getCurrentTime(),
      actionTimestamp: Date.now(),
      isScrubbing: true
    });
    setSyncStatus('Synced');
  };

  return (
    <div className="cinema-wrapper">
      <div className="cinema-header-pro">
        <div className="header-text">
          <h2>TwinVision</h2>
          <p>Solo & Sync Theater</p>
        </div>
        <div className="cinema-search-bar">
          <span style={{ fontSize: '16px', opacity: 0.6 }}>🔍</span>
          <input
            type="text"
            className="cinema-input"
            placeholder="Search or paste link..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchYouTubeAPI()}
          />
          <button className="icon-btn-pro" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', width: '28px', height: '28px', borderRadius: '8px' }} onClick={() => searchYouTubeAPI()}>▶</button>
        </div>
      </div>

      <div className="cinema-categories-container">
        <div className="cinema-categories">
          {interests.map((interest, idx) => (
            <div
              key={idx}
              className={`cat-pill ${activePill === interest ? 'active' : ''} ${interest.includes('Shorts') ? 'shorts' : ''}`}
              onClick={() => {
                setActivePill(interest);
                searchYouTubeAPI(interest === 'For You' ? 'Trending Web Dev and Design UI UX' : (interest === '📱 Shorts' ? '#shorts trending' : interest));
              }}
            >
              {interest}
            </div>
          ))}
          <div className={`cat-pill action-pill ${activePill === 'watchLater' ? 'active' : ''}`} onClick={() => fetchHistory('watchLater')}>🔖 Watch Later</div>
          <div className={`cat-pill action-pill ${activePill === 'history' ? 'active' : ''}`} onClick={() => fetchHistory('history')}>🕒 History</div>
          <div className="cat-pill action-pill" onClick={() => {
              const newTopic = prompt("Enter a new topic to follow:");
              if (newTopic && newTopic.trim() !== '') {
                  const updated = [...interests, newTopic.trim()];
                  setInterests(updated);
                  localStorage.setItem('twinVisionInterests', JSON.stringify(updated));
              }
          }} style={{ borderStyle: 'dashed' }}>+ Add Topic</div>
        </div>
      </div>

      {mode === 'browse' && (
        <div className="cinema-results-grid" style={{ display: 'grid' }}>
          {historyType ? (
             historyItems.length === 0 ? (
                 <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-faded)' }}>No videos found here yet.</p>
             ) : (
                 historyItems.map((item, idx) => (
                    <div key={idx} className="yt-card" onClick={() => openActionSheet(item.ytId, item.title, item.thumb, item.isShort)}>
                        <div className="yt-thumb-wrapper">
                            <img src={item.thumb} className={`yt-thumb ${item.isShort ? 'is-short' : ''}`} alt="thumbnail" />
                        </div>
                        <div className="yt-info">
                            <div className="yt-title">{item.title}</div>
                            <div className="yt-channel">{historyType === 'history' ? `Watched by ${item.watchedBy} • ${new Date(item.timestamp).toLocaleDateString()}` : `Saved by ${item.addedBy}`}</div>
                        </div>
                    </div>
                 ))
             )
          ) : (
            results.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '100px 20px', color: 'var(--text-faded)' }}>
                <span className="pulse-dot" style={{ width: '15px', height: '15px', background: '#ff2a5f', margin: '0 auto 20px auto' }}></span>
                <span style={{ fontSize: '14px', letterSpacing: '0.5px' }}>Curating your flagship feed...</span>
              </div>
            ) : (
              results.map((item, idx) => (
                <div key={idx} className="yt-card" onClick={() => openActionSheet(item.ytId, item.title, item.thumbUrl, item.isShort)}>
                  <div className="yt-thumb-wrapper">
                    <img src={item.thumbUrl} className={`yt-thumb ${item.isShort ? 'is-short' : ''}`} alt="thumbnail" />
                  </div>
                  <div className="yt-info">
                    <div className="yt-title">{item.title}</div>
                    <div className="yt-channel">{item.isShort ? '📱' : '📺'} {item.channel}</div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}

      <div className="cinema-stage" style={{ display: mode !== 'browse' ? 'flex' : 'none' }}>
        <button className="pro-btn" style={{ alignSelf: 'flex-start', marginBottom: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '12px', padding: '8px 16px', borderRadius: '20px', backdropFilter: 'blur(10px)' }} onClick={closeTheater}>
          <span style={{ marginRight: '5px' }}>←</span> Back to Hub
        </button>

        <div className={`ambient-glow ${isPlayingLocally ? 'active' : ''}`}></div>

        <div className={`video-container ${selectedVideo?.isShort ? 'is-short' : ''}`} >
            <div id="ytCinemaPlayer" ref={playerRef}></div>
        </div>

        <div className="cinema-controls-island">
          <button className="send-core-btn" style={{ width: '44px', height: '44px', fontSize: '18px', boxShadow: '0 4px 10px rgba(255,42,95,0.3)' }} onClick={togglePlayback}>
              {isPlayingLocally ? '⏸️' : '▶️'}
          </button>
          {syncStatus === 'Synced' && (
              <button className="icon-btn-pro" data-tip="Force Sync" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={forceSync}>🔄</button>
          )}
          <div className="sync-status-badge" style={{ background: syncStatus === 'Watching Solo' ? 'rgba(255,255,255,0.05)' : (syncStatus === 'Synced' ? 'rgba(50, 215, 75, 0.15)' : 'rgba(255, 59, 48, 0.15)'), color: syncStatus === 'Watching Solo' ? 'white' : (syncStatus === 'Synced' ? '#32d74b' : '#ff3b30'), border: '1px solid rgba(255,255,255,0.08)', padding: '6px 14px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pulse-dot" style={{ background: syncStatus === 'Watching Solo' ? '#0a84ff' : (syncStatus === 'Synced' ? '#32d74b' : '#ff3b30') }}></span>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{syncStatus}</span>
          </div>
        </div>
      </div>

      {/* Action Sheet Modal */}
      <div className={`action-sheet-overlay ${isActionSheetOpen ? 'active' : ''}`} onClick={closeActionSheet}>
        <div className="premium-context-menu" onClick={e => e.stopPropagation()}>
          <div className="context-header">
            <img src={selectedVideo?.thumbUrl} className="context-thumb-bg" alt="bg" />
            <div className="context-overlay">
              <h4 className="context-title">{selectedVideo?.title}</h4>
            </div>
            <button className="context-close-btn" onClick={closeActionSheet}>✕</button>
          </div>
          <div className="context-actions">
            <button className="ctx-btn sync-primary" onClick={() => executeAction('sync')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width: 20, height: 20}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              Watch together
            </button>
            <button className="ctx-btn" onClick={() => executeAction('solo')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width: 20, height: 20}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Watch Solo
            </button>
            <button className="ctx-btn" onClick={() => executeAction('save')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width: 20, height: 20}}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              Save for Later
            </button>
          </div>
        </div>
      </div>

      {/* Sync Join Modal */}
      <div className={`action-sheet-overlay ${isJoinModalOpen ? 'active' : ''}`} onClick={() => setIsJoinModalOpen(false)}>
        <div className="premium-context-menu" style={{ textAlign: 'center', padding: '40px 30px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: '50px', marginBottom: '15px', filter: 'drop-shadow(0 10px 20px rgba(255,42,95,0.4))' }}>🍿</div>
          <h3 style={{ marginTop: 0, marginBottom: '10px', color: 'white', fontWeight: 700, fontSize: '18px', lineHeight: 1.3 }}>{joinModalData?.lastActionBy} started a Watch Party</h3>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '30px', lineHeight: 1.5 }}>Do you want to tune in and watch together?</p>
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button className="ctx-btn sync-primary" style={{ flex: 1, justifyContent: 'center', fontWeight: 600, borderRadius: '12px' }} onClick={acceptJoin}>Tune In</button>
            <button className="ctx-btn" style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: '12px' }} onClick={() => setIsJoinModalOpen(false)}>Later</button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Cinema;
