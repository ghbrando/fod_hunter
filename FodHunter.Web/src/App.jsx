import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [activeDetections, setActiveDetections] = useState([]);
  const [deckLog, setDeckLog] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [manualForm, setManualForm] = useState({ id: '', desc: '', priority: 'LOW' });
  
  const nextIdRef = useRef(1);
  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // 1. POLLING AI DATA
useEffect(() => {
  const fetchDetections = async () => {
    try {
      const response = await fetch('http://localhost:5000/latest');
      const rawData = await response.json();
      const now = Date.now();
      const GRACE_PERIOD = 3000; // Keep targets for 3 seconds after loss
      const DISTANCE_THRESHOLD = 50; 

      setActiveDetections(prev => {
        // 1. Identify which objects are currently visible in the Unity frame
        const seenInThisFrame = rawData.map(det => {
          let match = prev.find(obj => getDistance(obj, det) < DISTANCE_THRESHOLD);
          if (match) {
            // Update existing track
            return { ...match, x: det.x, y: det.y, lastSeen: now };
          } else {
            // Create new track with a unique ID
            return { 
              id: `TRACK-${nextIdRef.current++}`, 
              x: det.x, 
              y: det.y, 
              lastSeen: now 
            };
          }
        });

        // 2. Filter "Ghost" objects (those not in the current frame but still valid)
        const persistentGhosts = prev.filter(obj => {
          // Check if this specific object was NOT just found in 'seenInThisFrame'
          const isNotCurrentlySeen = !seenInThisFrame.find(s => s.id === obj.id);
          
          // Conditions to keep a ghost alive:
          const isWithinGracePeriod = (now - obj.lastSeen) < GRACE_PERIOD;
          const isBeingRecorded = (isRecording && manualForm.id === obj.id);

          return isNotCurrentlySeen && (isWithinGracePeriod || isBeingRecorded);
        });

        // 3. Merge live detections with persistent ghosts
        // Change the very last line of your setActiveDetections logic
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
}, [isRecording, manualForm.id]); // Dependencies updated to handle the recording lock

  // 2. WHISPER DICTATION LOGIC
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);

const startWhisperDictation = async (trackId) => {
  try {
    // 1. Request Mic Access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunksRef.current = []; // Reset chunks

    // 2. Initialize Recorder
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    // 3. Handle what happens when Eli stops talking
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
        console.log("4090 Transcription received:", data.text); // Debug check

        // CRITICAL: Update the form with the new text
        if (data.text) {
          setManualForm(prev => ({ 
            ...prev, 
            desc: data.text 
          }));
        }
      } catch (err) {
        console.error("4090 Bridge Error:", err);
      } finally {
        setIsRecording(false);
      }
    };
    // 4. Start the recording
    mediaRecorder.start();
    setIsRecording(true);
    setManualForm({ ...manualForm, id: trackId });
    console.log(`4090 is listening for ${trackId}...`);

  } catch (err) {
    console.error("Mic access denied or error:", err);
    setIsRecording(false);
  }
};

  const stopWhisperDictation = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log("Stopping 4090 stream...");
      mediaRecorderRef.current.stop(); 
    } else {
      // Failsafe: if the recorder is already off but UI is stuck
      setIsRecording(false);
    }
  };
  const commitToDeck = () => {
    const entry = { ...manualForm, timestamp: new Date().toLocaleTimeString() };
    setDeckLog([...deckLog, entry]);
    setManualForm({ id: '', desc: '', priority: 'LOW' }); // Reset form
  };

  return (
    <div className="unity-gcs-theme">
      <header className="unity-header">
        <div className="stat">PILOT: ELI MANNING</div>
        <div className="stat system-status">WHISPER_ENGINE: {isRecording ? 'RECORDING...' : 'READY'}</div>
      </header>

      <div className="viewport-container">
        {/* LEFT: AI Sightings Form */}
        <aside className="unity-panel left">
          <h2 className="panel-title">OPERATOR_ENTRY_FORM</h2>
          <div className="form-container">
            <div className="form-group">
              <label>TRACK_ID:</label>
              <input value={manualForm.id} readOnly />
            </div>
            <div className="form-group">
              <label>DESCRIPTION:</label>
              <textarea 
                value={manualForm.desc} 
                onChange={(e) => setManualForm({...manualForm, desc: e.target.value})}
                placeholder="Use Whisper or type manually..."
              />
            </div>
            <button className="commit-btn" onClick={commitToDeck}>COMMIT TO DECK</button>
          </div>

          <div className="ai-cues">
            <h3>AI_CUES</h3>
            {activeDetections.map(obj => {
              // If the object hasn't been seen in more than 500ms, it's a "ghost"
              const isGhost = (Date.now() - obj.lastSeen) > 500;
              // Check if this specific card is the one being recorded by the 4090
              const isTarget = isRecording && manualForm.id === obj.id;

              return (
                <div 
                  key={obj.id} 
                  className={`cue-card ${isGhost ? 'ghost' : ''} ${isTarget ? 'recording' : ''}`}
                >
                  <div className="card-header">
                    <span>{obj.id}</span>
                    {isTarget && <span className="rec-dot">● REC</span>}
                  </div>
                  
                  <button 
                    className="mic-btn"
                    onMouseDown={() => startWhisperDictation(obj.id)}
                    onMouseUp={stopWhisperDictation}
                    onMouseLeave={stopWhisperDictation}
                  >
                    {isTarget ? "Listening..." : "🎙️"}
                  </button>

                  {isGhost && <div className="status-tag">SIGNAL LOST - HOLDING...</div>}
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER: Main Feed */}
        <main className="video-viewport">
          <img src="http://localhost:5000/stream" alt="DRONE_FEED" className="unity-stream" />
        </main>

        {/* RIGHT: Confirmed Deck Log */}
        <aside className="unity-panel right">
          <h2 className="panel-title">DECK_CREW_TASKS</h2>
          <div className="panel-content">
            {deckLog.map((item, i) => (
              <div key={i} className="deck-card confirmed">
                <div className="card-id">{item.id}</div>
                <div className="card-desc">{item.desc}</div>
                <div className="card-time">SENT: {item.timestamp}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;