import React, { useState, useEffect } from 'react';
import './Worker.css';

function WorkerDashboard() {
    const [tasks, setTasks] = useState([]);
    const [lastSync, setLastSync] = useState(null);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await fetch('http://127.0.0.1:5000/deck-logs');
                const data = await response.json();
                setTasks(data);
                setLastSync(new Date());
            } catch (err) {
                console.error("Worker Sync Error:", err);
            }
        };
        fetchLogs();
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

    const sortedTasks = tasks
        .slice()
        .sort((a, b) => (a.isResolved === b.isResolved ? 0 : a.isResolved ? 1 : -1));
    const openTasks = sortedTasks.filter(task => !task.isResolved);
    const resolvedTasks = sortedTasks.filter(task => task.isResolved);

    return (
        <div className="worker-theme">
            <header className="worker-header">
                <div className="header-title">
                    <div className="overline">GROUND CREW</div>
                    <h1>RUNWAY ALPHA</h1>
                    <div className="header-subtitle">Worker Console</div>
                </div>
                <div className="header-stats">
                    <div className="stat-chip stat-open">
                        <span className="stat-label">Open</span>
                        <span className="stat-value">{openTasks.length}</span>
                    </div>
                    <div className="stat-chip stat-total">
                        <span className="stat-label">Total</span>
                        <span className="stat-value">{tasks.length}</span>
                    </div>
                    <div className="stat-chip stat-sync">
                        <span className="stat-label">Last Sync</span>
                        <span className="stat-value">
                            {lastSync ? lastSync.toLocaleTimeString() : '--:--:--'}
                        </span>
                    </div>
                </div>
            </header>

            <section className="task-board">
                <div className="task-board-header">
                    <h2>Active Tasks</h2>
                    <div className="task-board-hint">Tap a card to focus, then clear when complete.</div>
                </div>

                {tasks.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">No Tasks</div>
                        <div className="empty-title">All quiet on the deck</div>
                        <div className="empty-subtitle">No items have been logged yet.</div>
                    </div>
                )}

                {tasks.length > 0 && openTasks.length === 0 && (
                    <div className="empty-state ready">
                        <div className="empty-icon">All Clear</div>
                        <div className="empty-title">Nice work, team</div>
                        <div className="empty-subtitle">Everything logged has been resolved.</div>
                    </div>
                )}

                {openTasks.map(task => (
                    <div key={task.id} className={`task-card priority-${task.priority?.toLowerCase()}`}>
                        <div className="task-info">
                            <h3 className="task-desc-title">{task.desc}</h3>
                            <div className="task-subtext">
                                <span className="task-id-small">{task.id}</span>
                                <span className="task-loc-small">LOC: [{task.x?.toFixed(0)}, {task.y?.toFixed(0)}]</span>
                                <span className={`priority-tag p-${task.priority?.toLowerCase()}`}>{task.priority}</span>
                            </div>
                        </div>
                        <button className="resolve-btn" onClick={() => handleResolve(task.id)}>
                            MARK AS CLEAR
                        </button>
                    </div>
                ))}

                {resolvedTasks.length > 0 && (
                    <div className="resolved-section">
                        <div className="resolved-header">Cleared Tasks</div>
                        {resolvedTasks.map(task => (
                            <div key={task.id} className={`task-card task-done priority-${task.priority?.toLowerCase()}`}>
                                <div className="task-info">
                                    <h3 className="task-desc-title">{task.desc}</h3>
                                    <div className="task-subtext">
                                        <span className="task-id-small">{task.id}</span>
                                        <span className="task-loc-small">LOC: [{task.x?.toFixed(0)}, {task.y?.toFixed(0)}]</span>
                                        <span className={`priority-tag p-${task.priority?.toLowerCase()}`}>{task.priority}</span>
                                    </div>
                                </div>
                                <div className="cleared-stamp">CLEARED</div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default WorkerDashboard;
