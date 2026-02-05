import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Routes, Route } from 'react-router-dom';
import WorkerDashboard from './Worker.jsx';

function App() {
  const [activeDetections, setActiveDetections] = useState([]);
  const [deckLog, setDeckLog] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [manualForm, setManualForm] = useState({ id: '', desc: '', priority: 'LOW' });

  const nextIdRef = useRef(1);

  // Add this useEffect to sync the counter with the existing log count once
  useEffect(() => {
    if (deckLog.length > 0) {
      const maxLoggedId = Math.max(...deckLog.map(item =>
        parseInt(item.id.replace('TRACK-', '')) || 0
      ));
      nextIdRef.current = Math.max(nextIdRef.current, maxLoggedId + 1);
    }
  }, [deckLog.length]);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
  const streamFrameRef = useRef(null);
  const streamImgRef = useRef(null);
  const [streamMetrics, setStreamMetrics] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    displayW: 0,
    displayH: 0
  });

  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // DRONE MOVEMENT CONTROLS
  const sendDroneCommand = async (direction, speed = 1.0) => {
    try {
      const response = await fetch('http://localhost:5000/drone/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, speed })
      });

      if (!response.ok) {
        console.error('Failed to send drone command');
      }
    } catch (err) {
      console.error('Drone command error:', err);
    }
  };

  const handleKeyPress = (e) => {
    // Don't process if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const speed = 1.0; // Adjust this for faster/slower movement

    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        sendDroneCommand('forward', speed);
        break;
      case 's':
      case 'arrowdown':
        sendDroneCommand('backward', speed);
        break;
      case 'a':
      case 'arrowleft':
        sendDroneCommand('left', speed);
        break;
      case 'd':
      case 'arrowright':
        sendDroneCommand('right', speed);
        break;
      case 'q':
        sendDroneCommand('up', speed);
        break;
      case 'e':
        sendDroneCommand('down', speed);
        break;
      case 'r':
        sendDroneCommand('stop', 0);
        break;
      default:
        break;
    }
  };

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // 1. POLLING AI DATA
  useEffect(() => {
    const fetchDetections = async () => {
      try {
        const response = await fetch('http://localhost:5000/latest');
        const rawData = await response.json();

        setActiveDetections(prev => {
          const now = Date.now();
          const DISTANCE_THRESHOLD = 60;
          const JITTER_THRESHOLD = 6;
          const GRACE_MS = 1500;

          // Reserve IDs already on screen so we never double-assign within one frame
          const usedPrevIds = new Set();
          const matched = [];

          rawData.forEach(det => {
            // Find the closest previous object that hasn't been paired yet
            let bestMatch = null;
            let bestDist = Number.POSITIVE_INFINITY;

            prev.forEach(obj => {
              if (usedPrevIds.has(obj.id)) return;
              const dist = getDistance(obj, det);
              if (dist < DISTANCE_THRESHOLD && dist < bestDist) {
                bestMatch = obj;
                bestDist = dist;
              }
            });

            if (bestMatch) {
              usedPrevIds.add(bestMatch.id);
              const dist = getDistance(bestMatch, det);
              const stableX = dist < JITTER_THRESHOLD ? bestMatch.x : det.x;
              const stableY = dist < JITTER_THRESHOLD ? bestMatch.y : det.y;
              matched.push({ ...bestMatch, x: stableX, y: stableY, lastSeen: now });
            } else {
              // Brand new track; mint a fresh ID from the global counter
              const newId = `TRACK-${nextIdRef.current++}`;
              matched.push({ id: newId, x: det.x, y: det.y, lastSeen: now });
            }
          });

          // Keep temporarily "ghosted" tracks so their labels fade out instead of duplicating
          const ghosts = prev.filter(obj => {
            if (usedPrevIds.has(obj.id)) return false; // already matched
            const alreadyCommitted = deckLog.some(log => log.id === obj.id);
            const stillWithinGrace = (now - obj.lastSeen) < GRACE_MS;
            return !alreadyCommitted && stillWithinGrace;
          });

          // Merge and dedupe by first occurrence to ensure one label per ID
          const merged = [...matched, ...ghosts];
          const deduped = [];
          const seenIds = new Set();
          for (const obj of merged) {
            if (seenIds.has(obj.id)) continue;
            seenIds.add(obj.id);
            deduped.push(obj);
          }

          // Drop any tracks that have aged out entirely (clears stale labels)
          const cleaned = deduped.filter(obj => (now - obj.lastSeen) < GRACE_MS * 1.5);

          return cleaned.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        });

      } catch (err) {
        console.error("Sync Error:", err);
      }
    };

    const interval = setInterval(fetchDetections, 200);
    return () => clearInterval(interval);
  }, [isRecording, deckLog]);

  // Clear the selected track if it disappears from the feed
  useEffect(() => {
    if (!manualForm.id) return;
    const stillPresent = activeDetections.some(d => d.id === manualForm.id);
    if (!stillPresent) {
      setManualForm(prev => ({ ...prev, id: '' }));
    }
  }, [activeDetections, manualForm.id]);

  const selectTrack = (trackId) => {
    console.log("Internal Select Fired for:", trackId);
    setManualForm(prev => ({
      ...prev,
      id: trackId
    }));
  };

  // 2. WHISPER DICTATION LOGIC
  const startWhisperDictation = async (trackId = null) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob);

        try {
          const response = await fetch('http://localhost:8000/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Bridge Failed (${response.status}):`, errorText);
            setIsRecording(false);
            return;
          }

          const data = await response.json();
          console.log("Transcription received:", data.text);

          if (data.text) {
            setManualForm(prev => ({
              ...prev,
              desc: data.text
            }));
          }
        } catch (err) {
          console.error("Bridge Error:", err);
        } finally {
          setIsRecording(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      if (trackId) {
        console.log("Fired selectTrack for:", trackId);
        setManualForm(prev => ({ ...prev, id: trackId }));
      }
      console.log(`Listening for ${trackId || 'manual entry'}...`);

    } catch (err) {
      console.error("Mic access denied or error:", err);
      setIsRecording(false);
    }
  };

  const stopWhisperDictation = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log("Stopping stream...");
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    } else {
      setIsRecording(false);
    }
  };

  const commitToDeck = async () => {
    if (!manualForm.id || !manualForm.desc) return;

    // Find the coordinates from activeDetections to save them for the worker
    const currentObj = activeDetections.find(d => d.id === manualForm.id);

    const entry = {
      ...manualForm,
      x: currentObj?.x || 0,
      y: currentObj?.y || 0
    };

    try {
      await fetch('http://127.0.0.1:5000/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      setManualForm({ id: '', desc: '', priority: 'LOW' });
      // Refresh the local log after committing
      fetchDeckLogs();
    } catch (err) {
      console.error("Commit failed:", err);
    }
  };
  const fetchDeckLogs = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/deck-logs');
      const data = await response.json();
      // Ensure this state update is working!
      setDeckLog(data);
    } catch (err) {
      console.error("Sync Error:", err);
    }
  };

  // Add this useEffect to keep the logs in sync automatically
  useEffect(() => {
    fetchDeckLogs();
    const interval = setInterval(fetchDeckLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const frameEl = streamFrameRef.current;
    const imgEl = streamImgRef.current;
    if (!frameEl || !imgEl) return;

    const updateMetrics = () => {
      const frameRect = frameEl.getBoundingClientRect();
      const frameW = frameRect.width;
      const frameH = frameRect.height;
      const imgW = imgEl.naturalWidth || 0;
      const imgH = imgEl.naturalHeight || 0;

      if (!frameW || !frameH || !imgW || !imgH) return;

      const scale = Math.min(frameW / imgW, frameH / imgH);
      const displayW = imgW * scale;
      const displayH = imgH * scale;
      const offsetX = (frameW - displayW) / 2;
      const offsetY = (frameH - displayH) / 2;

      setStreamMetrics({ scale, offsetX, offsetY, displayW, displayH });
    };

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(frameEl);
    updateMetrics();

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <Routes>
      <Route path="/" element={
        <div className="unity-gcs-theme">
          <header className="unity-header">
            <div className="header-left">
              <div className="app-title">DRONE COMMAND STATION</div>
              <div className="stat">OPERATOR: ELI MANNING</div>
            </div>
            <div className="header-right">
              <div className={`status-indicator ${isRecording ? 'recording' : 'ready'}`}>
                <span className="status-dot"></span>
                WHISPER: {isRecording ? 'RECORDING' : 'READY'}
              </div>
            </div>
          </header>

          <div className="viewport-container">
            {/* LEFT: AI Detection Panel */}
            <aside className="unity-panel left">
              <div className="panel-header">
                <h2 className="panel-title">AI DETECTIONS</h2>
                <div className="detection-count">{activeDetections.length} ACTIVE</div>
              </div>

              <div className="panel-content">
                <div className="ai-cues">
                  {activeDetections.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">[ ]</div>
                      <p>No active detections</p>
                    </div>
                  ) : (
                    activeDetections.map(obj => {
                      const isGhost = (Date.now() - obj.lastSeen) > 500;
                      const isTarget = isRecording && manualForm.id === obj.id;
                      const isSelected = manualForm.id === obj.id;

                      return (
                        <div
                          key={obj.id}
                          className={`cue-card ${isGhost ? 'ghost' : ''} ${isTarget ? 'recording' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => selectTrack(obj.id)}
                        >
                          <div className="card-header">
                            <span className="track-id">{obj.id}</span>
                            {isTarget && <span className="rec-indicator">● REC</span>}
                            {isGhost && !isTarget && <span className="ghost-indicator">LOST</span>}
                          </div>

                          <div className="card-coords">
                            X: {obj.x.toFixed(1)} / Y: {obj.y.toFixed(1)}
                          </div>

                          <button
                            className="mic-btn"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              startWhisperDictation(obj.id);
                            }}
                            onMouseUp={(e) => {
                              e.stopPropagation();
                              stopWhisperDictation();
                            }}
                            onMouseLeave={(e) => {
                              e.stopPropagation();
                              stopWhisperDictation();
                            }}
                          >
                            {isTarget ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{ marginRight: '4px' }}>
                                  <circle cx="7" cy="7" r="4" />
                                </svg>
                                Listening...
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{ marginRight: '4px' }}>
                                  <rect x="5" y="2" width="4" height="6" rx="2" />
                                  <path d="M3 7c0 2.2 1.8 4 4 4s4-1.8 4-4M7 11v3M5 14h4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                                </svg>
                                Hold to Record
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* CENTER: Main Feed + Docked Form */}
            <main className="video-viewport">
              <div className="video-shell">
              <div className="viewport-controls">
                <div className="control-group">
                  <span className="control-label">DRONE CONTROLS</span>
                </div>
                <div className="control-hint">
                  WASD/Arrows: Move | Q: Up | E: Down | R: Stop
                </div>
              </div>

              <div className="stream-wrapper">
                <div className="stream-frame" ref={streamFrameRef}>
                  <div className="stream-layer" style={{
                    // This transform moves BOTH the image and the labels simultaneously
                    transform: `translate3d(${viewState.x}px, ${viewState.y}px, 0) scale(${viewState.zoom})`,
                    transition: 'transform 0.05s ease-out',
                    willChange: 'transform'
                  }}>
                    <img
                      src="http://127.0.0.1:5000/stream"
                      alt="DRONE_FEED"
                      className="unity-stream"
                      ref={streamImgRef}
                      onLoad={() => {
                        const frameEl = streamFrameRef.current;
                        const imgEl = streamImgRef.current;
                        if (!frameEl || !imgEl) return;
                        const frameRect = frameEl.getBoundingClientRect();
                        const frameW = frameRect.width;
                        const frameH = frameRect.height;
                        const imgW = imgEl.naturalWidth || 0;
                        const imgH = imgEl.naturalHeight || 0;
                        if (!frameW || !frameH || !imgW || !imgH) return;
                        const scale = Math.min(frameW / imgW, frameH / imgH);
                        const displayW = imgW * scale;
                        const displayH = imgH * scale;
                        const offsetX = (frameW - displayW) / 2;
                        const offsetY = (frameH - displayH) / 2;
                        setStreamMetrics({ scale, offsetX, offsetY, displayW, displayH });
                      }}
                      style={{
                        backfaceVisibility: 'hidden',
                        position: 'absolute',
                        left: streamMetrics.offsetX,
                        top: streamMetrics.offsetY,
                        width: streamMetrics.displayW || '100%',
                        height: streamMetrics.displayH || '100%'
                      }}
                    />

                  {/* TACTICAL OVERLAY LAYER */}
                  <div className="detection-overlay" style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    pointerEvents: 'none', zIndex: 9999 // Above video feed
                  }}>
                    {activeDetections.map(obj => {
                      const isSelected = manualForm.id === obj.id;
                      const isGhost = (Date.now() - obj.lastSeen) > 500;

                      return (
                        <div
                          key={obj.id}
                          style={{
                            position: 'absolute',
                            left: `${streamMetrics.offsetX + (obj.x * streamMetrics.scale)}px`,
                            top: `${streamMetrics.offsetY + (obj.y * streamMetrics.scale)}px`,
                            pointerEvents: 'auto', // Re-enable clicks for this label
                            cursor: 'pointer',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10000
                          }}
                          // Using onMouseDown is faster than onClick for transformed layers
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("MANUAL OVERRIDE: Selecting", obj.id);
                            selectTrack(obj.id); // This fills your form
                          }}
                        >
                          <div className={`crosshair ${isGhost ? 'ghost' : ''} ${isSelected ? 'selected' : ''}`} />
                          <div className={`tactical-label ${isSelected ? 'selected' : ''}`}>
                            {obj.id}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              </div>

              </div>

              {/* Form Dock */}
              <div className="form-overlay">
                <div className="form-container">
                  <div className="form-header">
                    <h3>OPERATOR ENTRY</h3>
                  </div>

                  <div className="form-body">
                    <div className="form-group track-group">
                      <label>TRACK ID</label>
                      <input
                        value={manualForm.id}
                        onChange={(e) => setManualForm({ ...manualForm, id: e.target.value })}
                        placeholder="Enter or select track..."
                        className="track-input"
                      />
                    </div>

                    <div className="form-group priority-group">
                      <label>PRIORITY</label>
                      <select
                        value={manualForm.priority}
                        onChange={(e) => setManualForm({ ...manualForm, priority: e.target.value })}
                        className="priority-select"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>
                    </div>

                    <div className="form-group description-group">
                      <label>DESCRIPTION</label>
                      <div className="description-input-wrapper">
                        <textarea
                          value={manualForm.desc}
                          onChange={(e) => setManualForm({ ...manualForm, desc: e.target.value })}
                          placeholder="Type or use voice input..."
                          className="description-input"
                          rows="2"
                        />
                        <button
                          className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
                          onMouseDown={() => startWhisperDictation()}
                          onMouseUp={stopWhisperDictation}
                          onMouseLeave={stopWhisperDictation}
                          title="Hold to record"
                        >
                          {isRecording ? (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                              <circle cx="7" cy="7" r="5" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                              <rect x="5" y="2" width="4" height="6" rx="2" />
                              <path d="M3 7c0 2.2 1.8 4 4 4s4-1.8 4-4M7 11v3M5 14h4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <button className="commit-btn" onClick={commitToDeck}>
                      ▶ COMMIT TO DECK
                    </button>
                  </div>
                </div>
              </div>
            </main>

            {/* RIGHT: Deck Log */}
            <aside className="unity-panel right">
              <div className="panel-header">
                <h2 className="panel-title">DECK LOG</h2>
                <div className="log-count">{deckLog.length} TOTAL</div>
              </div>
              <div className="panel-content">
                {deckLog
                  .slice()
                  .sort((a, b) => a.isResolved - b.isResolved) // Moves cleared items to bottom
                  .map((item, i) => (
                    <div
                      key={item.id}
                      className={`deck-card priority-${item.priority?.toLowerCase()} ${item.isResolved ? 'is-resolved' : ''}`}
                    >
                      <div className="deck-card-header">
                        <span className="deck-track-id">{item.id}</span>
                        {item.isResolved && <span className="resolved-badge">CLEARED</span>}
                      </div>
                      <div className="deck-card-desc">{item.desc}</div>
                    </div>
                  ))
                }
              </div>
            </aside>
          </div>
        </div>
      } />

      <Route path="/worker" element={<WorkerDashboard />} />
    </Routes>
  );
}

export default App;
