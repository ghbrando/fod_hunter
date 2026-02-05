import React, { useState, useEffect } from 'react';
import './Worker.css';

function WorkerDashboard() {
    const [tasks, setTasks] = useState([]);

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

    const handleResolve = async (trackId) => {
        try {
            await fetch(`http://127.0.0.1:5000/resolve/${trackId}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            console.error("Resolve Error:", err);
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
                    .sort((a, b) => (a.isResolved === b.isResolved ? 0 : a.isResolved ? 1 : -1))
                    .map(task => (
                        /* Added dynamic priority class */
                        <div key={task.id} className={`task-card priority-${task.priority?.toLowerCase()} ${task.isResolved ? 'task-done' : ''}`}>
                            <div className="task-info">
                                {/* Description is now the primary title */}
                                <h2 className="task-desc-title" style={{ textDecoration: task.isResolved ? 'line-through' : 'none' }}>
                                    {task.desc}
                                </h2>
                                <div className="task-subtext">
                                    <span className="task-id-small">{task.id}</span>
                                    <span className="task-loc-small">LOC: [{task.x?.toFixed(0)}, {task.y?.toFixed(0)}]</span>
                                    <span className={`priority-tag p-${task.priority?.toLowerCase()}`}>{task.priority}</span>
                                </div>
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