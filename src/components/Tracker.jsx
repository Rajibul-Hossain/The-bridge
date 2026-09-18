import React from 'react';

function Tracker() {
  return (
    <div>
        <h1 className="view-title">Project Logistics</h1>
        <p className="view-subtitle">Tracking shared goals and development.</p>
        <div className="glass-widget" style={{ maxWidth: '450px' }}>
            <p className="widget-label">System: HamaraLabs</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
                <h2 className="widget-value">75%</h2>
                <p style={{ margin: 0, color: 'var(--text-faded)', fontSize: '13px' }}>Architecture Phase</p>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '15px', overflow: 'hidden' }}>
                <div style={{ width: '75%', height: '100%', background: '#0a84ff', borderRadius: '4px', transition: '1s ease-out' }}></div>
            </div>
        </div>
    </div>
  );
}

export default Tracker;
