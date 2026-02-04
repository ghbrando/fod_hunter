import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [activeDetections, setActiveDetections] = useState([]);
  const [deckLog, setDeckLog] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [manualForm, setManualForm] = useState({ id: '', desc: '', priority: 'LOW' });
  
  const nextIdRef = useRef(1);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // 1. POLLING AI DATA
  useEffect(() => {
    const fetchDetections = async () => {
      try {
        const response = await fetch('http://localhost:5000/latest');
        const rawData = await response.json();
        const now = Date.now();
        const GRACE_PERIOD = 3000;
        const DISTANCE_THRESHOLD = 50; 

        setActiveDetections(prev => {
          const seenInThisFrame = rawData.map(det => {
            let match = prev.find(obj => getDistance(obj, det) < DISTANCE_THRESHOLD);
            if (match) {
              return { ...match, x: det.x, y: det.y, lastSeen: now };
            } else {
              return { 
                id: `TRACK-${nextIdRef.current++}`, 
                x: det.x, 
                y: det.y, 
                lastSeen: now 
              };
            }
          });

          const persistentGhosts = prev.filter(obj => {
            const isNotCurrentlySeen = !seenInThisFrame.find(s => s.id === obj.id);
            const isWithinGracePeriod = (now - obj.lastSeen) < GRACE_PERIOD;
            const isBeingRecorded = (isRecording && manualForm.id === obj.id);
            return isNotCurrentlySeen && (isWithinGracePeriod || isBeingRecorded);
          });

          return [...seenInThisFrame, ...persistentGhosts].sort((a, b) => {
            return a.id.localeCompare(b.id, undefined, { numeric: true });
          });
        });
        
      } catch (err) { 
        console.error("Sync Error:", err); 
      }
    };

    const interval = setInterval(fetchDetections, 200);
    return () => clearInterval(interval);
  }, [isRecording, manualForm.id]);

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

  const commitToDeck = () => {
    if (!manualForm.id || !manualForm.desc) {
      alert('Please provide both Track ID and Description');
      return;
    }
    const entry = { ...manualForm, timestamp: new Date().toLocaleTimeString() };
    setDeckLog([...deckLog, entry]);
    setManualForm({ id: '', desc: '', priority: 'LOW' });
  };

  const selectTrack = (trackId) => {
    setManualForm(prev => ({ ...prev, id: trackId }));
  };

  return (
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
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{marginRight: '4px'}}>
                              <circle cx="7" cy="7" r="4" />
                            </svg>
                            Listening...
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{marginRight: '4px'}}>
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

        {/* CENTER: Main Feed + Form Overlay */}
        <main className="video-viewport">
          <img src="http://localhost:5000/stream" alt="DRONE_FEED" className="unity-stream" />
          
          {/* Form Overlay at Bottom */}
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
                    onChange={(e) => setManualForm({...manualForm, id: e.target.value})}
                    placeholder="Enter or select track..."
                    className="track-input"
                  />
                </div>
                
                <div className="form-group priority-group">
                  <label>PRIORITY</label>
                  <select 
                    value={manualForm.priority}
                    onChange={(e) => setManualForm({...manualForm, priority: e.target.value})}
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
                      onChange={(e) => setManualForm({...manualForm, desc: e.target.value})}
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
            <div className="log-count">{deckLog.length} ENTRIES</div>
          </div>
          
          <div className="panel-content">
            {deckLog.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">[ ]</div>
                <p>No entries logged</p>
              </div>
            ) : (
              deckLog.map((item, i) => (
                <div key={i} className={`deck-card priority-${item.priority.toLowerCase()}`}>
                  <div className="deck-card-header">
                    <span className="deck-track-id">{item.id}</span>
                    <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>
                      {item.priority}
                    </span>
                  </div>
                  <div className="deck-card-desc">{item.desc}</div>
                  <div className="deck-card-footer">
                    <span className="timestamp">» {item.timestamp}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;