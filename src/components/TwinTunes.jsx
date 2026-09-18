import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ref, onValue, set, update, push, remove } from 'firebase/database';
import { rtdb } from '../firebase';

function TwinTunes({ partnerUsername }) {
  const { currentUsername, bridgeId } = useAuth();

  const [songTitle, setSongTitle] = useState('Loading...');
  const [songArtist, setSongArtist] = useState('');
  const [songMessage, setSongMessage] = useState('');
  const [albumArt, setAlbumArt] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [dedicateMessage, setDedicateMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [historyFeed, setHistoryFeed] = useState([]);
  const [playlist, setPlaylist] = useState([]);

  const playerRef = useRef(null);
  const ytPlayer = useRef(null);
  const progressRAF = useRef(null);
  const pendingSync = useRef({ time: 0, timestamp: 0, ytId: null });

  // 1. YouTube Player Init
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // We only need the iframe API ready to create the player
    const checkYT = setInterval(() => {
        if (window.YT && window.YT.Player && !ytPlayer.current) {
            clearInterval(checkYT);
            ytPlayer.current = new window.YT.Player(playerRef.current, {
                height: '1', width: '1',
                host: 'https://www.youtube-nocookie.com',
                playerVars: { 'autoplay': 0, 'controls': 0, 'playsinline': 1, 'origin': window.location.origin },
                events: {
                    'onReady': () => console.log("✅ TwinTunes Audio Engine Ready."),
                    'onStateChange': (e) => {
                        if (e.data === window.YT.PlayerState.PLAYING) setIsPlaying(true);
                        if (e.data === window.YT.PlayerState.PAUSED) setIsPlaying(false);
                        if (e.data === window.YT.PlayerState.ENDED) {
                            if (isRepeat) {
                                ytPlayer.current.seekTo(0);
                                ytPlayer.current.playVideo();
                            } else {
                                setIsPlaying(false);
                            }
                        }
                    },
                    'onError': (e) => {
                        if (e.data === 150 || e.data === 101) alert("Track blocked by label.");
                    }
                }
            });
        }
    }, 100);

    return () => clearInterval(checkYT);
  }, [isRepeat]);

  // 2. Firebase Sync Listener
  useEffect(() => {
    if (!bridgeId) return;

    const musicRef = ref(rtdb, `bridges/${bridgeId}/music/nowPlaying`);
    const unsubMusic = onValue(musicRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();

        setSongTitle(data.title);
        setSongArtist(data.artist);
        setSongMessage(data.message ? `"${data.message}"\n— ${data.dedicatedBy}` : `Played by ${data.dedicatedBy}`);
        setAlbumArt(data.albumArt);

        if (ytPlayer.current && typeof ytPlayer.current.cueVideoById === 'function') {
            const currentUrl = ytPlayer.current.getVideoUrl();
            if (!currentUrl || !currentUrl.includes(data.ytId)) {
                ytPlayer.current.cueVideoById(data.ytId);
                if (!isPlaying) setIsPlaying(false);
            }
        }

        if (data.playbackState) {
            const isPlayingRemote = data.playbackState === 'playing';

            if (data.lastActionBy === currentUsername) {
                if (isPlayingRemote) { ytPlayer.current?.playVideo(); setIsPlaying(true); }
                else { ytPlayer.current?.pauseVideo(); setIsPlaying(false); }
            } else {
                pendingSync.current = { time: data.seekTime || 0, timestamp: data.actionTimestamp || Date.now(), ytId: data.ytId };

                if (data.isScrubbing && isPlaying && ytPlayer.current) {
                    const timePassed = (Date.now() - pendingSync.current.timestamp) / 1000;
                    ytPlayer.current.seekTo(pendingSync.current.time + timePassed, true);
                }

                if (isPlayingRemote && !isPlaying) {
                    // Show Join Modal Logic here if needed. For now, auto-sync.
                    if (ytPlayer.current) {
                         ytPlayer.current.loadVideoById(data.ytId);
                         const timePassed = (Date.now() - pendingSync.current.timestamp) / 1000;
                         ytPlayer.current.seekTo(pendingSync.current.time + timePassed, true);
                         ytPlayer.current.playVideo();
                         setIsPlaying(true);
                    }
                } else if (!isPlayingRemote && isPlaying) {
                    ytPlayer.current?.pauseVideo();
                    setIsPlaying(false);
                }
            }
        }
    });

    const historyRef = ref(rtdb, `bridges/${bridgeId}/music/history`);
    const unsubHistory = onValue(historyRef, (snap) => {
        if (!snap.exists()) { setHistoryFeed([]); return; }
        let tracks = [];
        snap.forEach(child => tracks.push(child.val()));
        setHistoryFeed(tracks.reverse());
    });

    const playlistRef = ref(rtdb, `bridges/${bridgeId}/music/playlist`);
    const unsubPlaylist = onValue(playlistRef, (snap) => {
        if (!snap.exists()) { setPlaylist([]); return; }
        let arr = [];
        snap.forEach(child => arr.push({ id: child.key, ...child.val() }));
        setPlaylist(arr.reverse());
    });

    return () => { unsubMusic(); unsubHistory(); unsubPlaylist(); };
  }, [bridgeId, currentUsername, isPlaying]);

  // 3. Progress Loop
  useEffect(() => {
      const tick = () => {
          if (ytPlayer.current && isPlaying && typeof ytPlayer.current.getCurrentTime === 'function') {
              const current = ytPlayer.current.getCurrentTime() || 0;
              const total = ytPlayer.current.getDuration() || 0;
              if (total > 0) {
                  setCurrentTime(current);
                  setDuration(total);
              }
          }
          if (isPlaying) progressRAF.current = requestAnimationFrame(tick);
      };

      if (isPlaying) {
          progressRAF.current = requestAnimationFrame(tick);
      } else {
          cancelAnimationFrame(progressRAF.current);
      }
      return () => cancelAnimationFrame(progressRAF.current);
  }, [isPlaying]);

  const formatTimeStr = (seconds) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleScrub = async (e) => {
      if (!ytPlayer.current || typeof ytPlayer.current.getDuration !== 'function') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      const totalTime = ytPlayer.current.getDuration();
      const seekToTime = totalTime * percent;

      ytPlayer.current.seekTo(seekToTime, true);

      await update(ref(rtdb, `bridges/${bridgeId}/music/nowPlaying`), {
          playbackState: isPlaying ? 'playing' : 'paused',
          lastActionBy: currentUsername,
          seekTime: seekToTime,
          actionTimestamp: Date.now(),
          isScrubbing: true
      });
  };

  const togglePlayback = async () => {
      if (!ytPlayer.current) return alert("Audio booting...");
      const newState = isPlaying ? 'paused' : 'playing';
      const seekTime = ytPlayer.current.getCurrentTime() || 0;

      await update(ref(rtdb, `bridges/${bridgeId}/music/nowPlaying`), {
          playbackState: newState,
          lastActionBy: currentUsername,
          seekTime: seekTime,
          actionTimestamp: Date.now(),
          isScrubbing: false
      });
  };

  const forceSync = () => {
      if (pendingSync.current.time && pendingSync.current.timestamp) {
          const timePassed = (Date.now() - pendingSync.current.timestamp) / 1000;
          const target = pendingSync.current.time + timePassed;
          ytPlayer.current?.seekTo(target, true);
      }
  };

  const searchAppleMusic = async () => {
      if (!searchQuery) return alert("Type a song!");
      setIsSearching(true);
      try {
          const appleRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`);
          const appleData = await appleRes.json();
          if (appleData.results && appleData.results.length > 0) {
              const track = appleData.results[0];
              const highResArt = track.artworkUrl100.replace('100x100bb', '500x500bb');

              const audioQuery = `${track.trackName} ${track.artistName} lyric video`;
              const ytApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(audioQuery)}&type=video&videoEmbeddable=true&maxResults=1&key=AIzaSyDyU-K6yp6iNhpwF0GOfmHsnj8_qHMYhCo`;

              const ytRes = await fetch(ytApiUrl);
              const ytData = await ytRes.json();

              if (ytData.items && ytData.items.length > 0) {
                  setPreviewData({
                      title: track.trackName,
                      artist: track.artistName,
                      art: highResArt,
                      ytId: ytData.items[0].id.videoId
                  });
              } else alert("Blocked by YouTube");
          } else alert("Not found on Apple Music");
      } catch (e) { console.error(e); }
      setIsSearching(false);
  };

  const sendDedication = async () => {
      if (!previewData) return alert("Search first!");
      const songData = {
          title: previewData.title, artist: previewData.artist,
          albumArt: previewData.art, ytId: previewData.ytId,
          dedicatedBy: currentUsername, timestamp: Date.now()
      };
      try {
          await set(ref(rtdb, `bridges/${bridgeId}/music/nowPlaying`), {
              ...songData, message: dedicateMessage, playbackState: 'paused', seekTime: 0, actionTimestamp: Date.now()
          });
          await set(ref(rtdb, `bridges/${bridgeId}/music/playlist/${previewData.ytId}`), songData);
          await push(ref(rtdb, `bridges/${bridgeId}/music/history`), { ...songData, serverTime: Date.now() });
          setIsModalOpen(false);
      } catch (e) { console.error(e); }
  };

  const addToPlaylist = async () => {
      if (!previewData) return;
      const songData = {
          title: previewData.title, artist: previewData.artist, albumArt: previewData.art,
          ytId: previewData.ytId, addedBy: currentUsername, timestamp: Date.now()
      };
      await set(ref(rtdb, `bridges/${bridgeId}/music/playlist/${previewData.ytId}`), songData);
  };

  const playFromPlaylist = async (song) => {
      await update(ref(rtdb, `bridges/${bridgeId}/music/nowPlaying`), {
          title: song.title, artist: song.artist, albumArt: song.albumArt, ytId: song.ytId,
          playbackState: 'playing', lastActionBy: currentUsername, seekTime: 0, actionTimestamp: Date.now()
      });
      setIsPlaylistOpen(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '20px' }}>

      {/* Hidden Player */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}><div ref={playerRef}></div></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', padding: '0 5px', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 className="view-title" style={{ textTransform: 'none', margin: 0, fontSize: 'clamp(24px, 5vw, 32px)' }}>TwinTunes</h1>
          <p className="view-subtitle" style={{ margin: '2px 0 0 0', opacity: 0.7 }}>Your synchronized musical universe.</p>
        </div>
        <button className="pro-btn" onClick={() => setIsPlaylistOpen(true)} style={{ padding: '10px 16px', borderRadius: '20px', fontSize: '13px', color: 'white', background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📁</span> Playlist
        </button>
      </div>

      <div className="music-page-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', minHeight: 0, alignItems: 'center' }}>

        <div className="main-player-panel" style={{ height: '100%', maxHeight: '650px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative', background: 'rgba(255,255,255,0.03)', borderRadius: '35px', border: '1px solid rgba(255,255,255,0.05)', padding: '30px' }}>
            <div className={`top-right-eq ${isPlaying ? 'playing' : ''}`}>
                <div className="live-bar"></div><div className="live-bar"></div><div className="live-bar"></div><div className="live-bar"></div>
            </div>

            <div className={`giant-album-art ${isPlaying ? 'playing' : ''}`} style={{ backgroundImage: albumArt ? `linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url('${albumArt}')` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', width: 'min(240px, 50vh)', height: 'min(240px, 50vh)', marginBottom: '30px' }}></div>

            <div style={{ zIndex: 1, textAlign: 'center', width: '100%', maxWidth: '450px' }}>
                <h2 style={{ fontSize: 'clamp(28px, 6vw, 38px)', fontWeight: 800, margin: 0, color: 'white', letterSpacing: '-1px', textShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>{songTitle}</h2>
                <p style={{ fontSize: '16px', color: '#ff2a5f', fontWeight: 600, margin: '5px 0 20px 0', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{songArtist}</p>

                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px 20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '25px', backdropFilter: 'blur(10px)' }}>
                    <p style={{ fontSize: '14px', color: '#e0e0e0', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>{songMessage}</p>
                </div>

                <div className="playback-controller" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: 'var(--text-faded)', marginBottom: '8px' }}>
                        <span>{formatTimeStr(currentTime)}</span>
                        <span>{formatTimeStr(duration)}</span>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', cursor: 'pointer', position: 'relative', marginBottom: '25px' }} onClick={handleScrub}>
                        <div style={{ width: `${(currentTime/duration)*100}%`, height: '100%', background: 'linear-gradient(90deg, #ff2a5f, #ff719a)', borderRadius: '10px' }}></div>
                        <div style={{ position: 'absolute', top: '-3px', left: `${(currentTime/duration)*100}%`, width: '12px', height: '12px', background: 'white', borderRadius: '50%', transform: 'translateX(-50%)', opacity: isPlaying ? 1 : 0 }}></div>
                    </div>

                    <div className="controls-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 5px' }}>
                        <button style={{ background:'none', border:'none', color: isRepeat ? '#ff2a5f' : 'var(--text-faded)', fontSize: '18px', cursor: 'pointer', textShadow: isRepeat ? '0 0 10px rgba(255,42,95,0.5)' : 'none' }} onClick={() => setIsRepeat(!isRepeat)}>🔁</button>
                        <div className="action-buttons" style={{ display: 'flex', gap: '12px' }}>
                            <button className="pro-btn btn-listen" style={{ padding: '12px 22px', borderRadius: '30px', fontSize: '13px', fontWeight: 700 }} onClick={togglePlayback}>{isPlaying ? "⏸ Pause Sync" : "▶ Play Sync"}</button>
                            <button className="pro-btn btn-dedicate" style={{ padding: '12px 18px', borderRadius: '30px', fontSize: '13px' }} onClick={() => setIsModalOpen(true)}>Add Music</button>
                        </div>
                        <button style={{ background:'none', border:'none', color: 'var(--text-faded)', fontSize: '18px', cursor: 'pointer' }} onClick={forceSync}>🔄</button>
                    </div>
                </div>
            </div>
        </div>

        <div className="music-history-panel" style={{ height: '100%', maxHeight: '650px', background: 'rgba(255,255,255,0.02)', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.05)', padding: '25px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-faded)', fontWeight: 700 }}>Recent Dedications</h3>
            <div className="history-feed" style={{ flex: 1, overflowY: 'auto' }}>
                {historyFeed.length === 0 ? (
                    <p style={{ color: 'var(--text-faded)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>No history yet. Start the playlist!</p>
                ) : (
                    historyFeed.map((track, i) => (
                        <div key={i} className="history-track">
                            <div style={{ width: '45px', height: '45px', flexShrink: 0 }}>
                                {track.albumArt ? <img src={track.albumArt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }} alt="art" /> : <div style={{ width: '100%', height: '100%', borderRadius: '10px', background: 'linear-gradient(135deg, #ff2a5f, #ff719a)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🎵</div>}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{track.title}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-faded)', marginTop: '2px' }}>{track.artist} • By {track.dedicatedBy}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>

      {/* MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
          <div className="premium-modal" style={{ width: '90%', maxWidth: '400px' }}>
              <h3 style={{ marginTop:0, marginBottom: '20px', color: 'white' }}>Add a Song</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <input type="text" className="premium-input" style={{ flex: 1 }} placeholder="Search for a song..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <button className="pro-btn" style={{ padding: '10px 15px', background: 'rgba(255,42,95,0.15)', color: '#ff2a5f', borderRadius: '14px', boxShadow: 'none' }} onClick={searchAppleMusic}>{isSearching ? '⏳ Scanning' : '🔍 Search'}</button>
              </div>
              {previewData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '20px', backdropFilter: 'blur(10px)' }}>
                      <img src={previewData.art} style={{ width: '50px', height: '50px', borderRadius: '10px', objectFit: 'cover' }} alt="preview" />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{previewData.title}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-faded)' }}>{previewData.artist}</span>
                      </div>
                      <button className="pro-btn" style={{ width: '35px', height: '35px', borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center' }} onClick={addToPlaylist}>➕</button>
                  </div>
              )}
              <div className="input-group">
                  <label style={{ fontSize: '12px', color: 'var(--text-faded)' }}>Your Message</label>
                  <input type="text" className="premium-input" placeholder="Say something sweet..." value={dedicateMessage} onChange={e => setDedicateMessage(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                  <button className="pro-btn btn-dedicate" style={{ flex: 1, justifyContent: 'center', padding: '12px' }} onClick={sendDedication}>Send & Play</button>
                  <button className="pro-btn btn-listen" style={{ width: '60px', justifyContent: 'center', padding: '12px' }} onClick={() => { setIsModalOpen(false); setPreviewData(null); setSearchQuery(''); setDedicateMessage(''); }}>✕</button>
              </div>
          </div>
      </div>

      {/* PLAYLIST */}
      <div className={`morphing-playlist ${isPlaylistOpen ? 'active' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                  <h3 style={{ margin:0, color: 'white', fontWeight: 800, fontSize: '20px' }}>Bridge Playlist</h3>
                  <p style={{ margin:0, fontSize: '11px', color: 'var(--text-faded)' }}>Your shared musical journey</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="pro-btn" style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,42,95,0.15)', color: '#ff2a5f', padding: 0 }} onClick={() => { setIsPlaylistOpen(false); setIsModalOpen(true); }}>➕</button>
                  <button className="pro-btn btn-listen" style={{ width: '38px', height: '38px', borderRadius: '50%', justifyContent: 'center', padding: 0 }} onClick={() => setIsPlaylistOpen(false)}>✕</button>
              </div>
          </div>
          <div className="playlist-scroll-area">
              {playlist.length === 0 ? (
                  <p style={{ color:'var(--text-faded)', textAlign:'center', marginTop:'60px' }}>Library is empty.</p>
              ) : (
                  playlist.map(song => (
                      <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', marginBottom: '8px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }} onClick={() => playFromPlaylist(song)}>
                          <img src={song.albumArt} style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover' }} alt="art" />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ color: 'white', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.title}</div>
                              <div style={{ color: 'var(--text-faded)', fontSize: '11px' }}>{song.artist}</div>
                          </div>
                          <button className="pro-btn" style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', color: '#ff4757', padding:0, display:'flex', justifyContent:'center', alignItems:'center', border:'none' }} onClick={(e) => { e.stopPropagation(); if(window.confirm("Remove?")) remove(ref(rtdb, `bridges/${bridgeId}/music/playlist/${song.id}`)); }}>🗑️</button>
                      </div>
                  ))
              )}
          </div>
      </div>

    </div>
  );
}

export default TwinTunes;
