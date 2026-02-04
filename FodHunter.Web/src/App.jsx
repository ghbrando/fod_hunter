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

        setActiveDetections(prev => {
          const currentFrame = [];
          rawData.forEach(det => {
            const threshold = 50; 
            let match = prev.find(obj => getDistance(obj, det) < threshold);
            if (match) {
              match.x = det.x; match.y = det.y;
              currentFrame.push(match);
            } else {
              currentFrame.push({ id: `TRACK-${nextIdRef.current++}`, x: det.x, y: det.y });
            }
          });
          return currentFrame;
        });
      } catch (err) { console.error("Sync Error:", err); }
    };
    const interval = setInterval(fetchDetections, 200);
    return () => clearInterval(interval);
  }, []);

  // 2. WHISPER DICTATION LOGIC
  const startWhisperDictation = (trackId) => {
    setIsRecording(true);
    setManualForm({ ...manualForm, id: trackId });
    // This is where you would trigger the MediaRecorder API to send audio to Whisper
    console.log(`Starting Whisper stream for ${trackId}...`);
    
    // MOCK WHISPER RESPONSE after 2 seconds
    setTimeout(() => {
      setIsRecording(false);
      setManualForm(prev => ({ ...prev, desc: "Metal debris found near runway center." }));
    }, 2000);
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
            {activeDetections.map(obj => (
              <div key={obj.id} className="cue-card" onClick={() => startWhisperDictation(obj.id)}>
                <span>{obj.id}</span>
                <button className="mic-btn">🎙️</button>
              </div>
            ))}
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