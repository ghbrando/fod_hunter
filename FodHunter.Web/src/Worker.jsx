import React, { useState, useEffect } from 'react';
import './Worker.css';

function WorkerDashboard() {
    const [tasks, setTasks] = useState([]);

    // 1. Poll the .NET server for Committed Logs
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await fetch('http://127.0.0.1:5000/deck-logs');
                const data = await response.json();
                setTasks(data);
            } catch (err) {
                console.error("Worker Sync Error:", err);
            }
        };
        const interval = setInterval(fetchLogs, 1000);
        return () => clearInterval(interval);
    }, []);

    // 2. Resolve Task Logic
    const handleResolve = async (trackId) => {
    try {
        // Use 127.0.0.1 to avoid the 168ms DNS delay
        const response = await fetch(`http://127.0.0.1:5000/resolve/${trackId}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            console.log(`Successfully cleared ${trackId}`); // Debug check
        } else {
            console.error("Server refused resolve:", await response.text());
        }
    } catch (err) {
        console.error("Network Error during resolve:", err);
    }
};

    return (
        <div className="worker-theme">
            <header className="worker-header">
                <h1>GROUND CREW: RUNWAY ALPHA</h1>
            </header>
            <div className="task-list">
                {tasks
                    .slice()
                    .sort((a, b) => (a.isResolved === b.isResolved ? 0 : a.isResolved ? 1 : -1)) // Corrected Sort
                    .map(task => (
                        <div key={task.id} className={`task-card ${task.isResolved ? 'task-done' : ''}`}>
                            <div className="task-info">
                                {/* Use lowercase property names from the JSON */}
                                <span className="task-id">{task.id}</span>
                                <span className="task-loc">LOC: [{task.x?.toFixed(0)}, {task.y?.toFixed(0)}]</span>
                                <p style={{ textDecoration: task.isResolved ? 'line-through' : 'none' }}>
                                    {task.desc}
                                </p>
                            </div>
                            {!task.isResolved && (
                                <button className="resolve-btn" onClick={() => handleResolve(task.id)}>
                                    MARK AS CLEAR
                                </button>
                            )}
                        </div>
                    ))
                }
            </div>
        </div>
    );
}

export default WorkerDashboard;