export async function renderSystemVersion() {
    // Fetch version matrix
    try {
        const res = await fetch('/api/version');
        const json = await res.json();
        const data = json.data || {};
        
        const container = document.getElementById('version-matrix-container');
        if (container) {
            container.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <tbody>
                        ${Object.entries(data).map(([key, val]) => `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 0.5rem; color: var(--text-secondary); text-transform: uppercase;">${key.replace('_', ' ')}</td>
                                <td style="padding: 0.5rem; color: var(--accent-cyan); font-family: var(--font-mono); text-align: right;">${val}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (err) {
        console.error("Failed to load versions", err);
    }

    // Fetch history
    window.fetchSimulationHistory();
}

window.fetchSimulationHistory = async function() {
    try {
        const res = await fetch('/api/jobs/history');
        const jobs = await res.json();
        
        const tbody = document.getElementById('sim-history-table-body');
        if (!tbody) return;
        
        if (jobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding: 1rem; text-align: center; color: var(--text-secondary);">No history available</td></tr>';
            return;
        }

        tbody.innerHTML = jobs.map(j => {
            const date = new Date(j.created_at).toLocaleString();
            let statusColor = 'var(--text-secondary)';
            if (j.status === 'COMPLETED') statusColor = 'var(--accent-emerald)';
            if (j.status === 'FAILED') statusColor = 'var(--accent-crimson)';
            if (j.status === 'RUNNING') statusColor = 'var(--accent-cyan)';
            
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 0.75rem; color: var(--text-dim);">${date}</td>
                    <td style="padding: 0.75rem; color: ${statusColor}; font-weight: bold;">${j.status}</td>
                    <td style="padding: 0.75rem; color: #fff; font-family: var(--font-mono);">${j.random_seed}</td>
                    <td style="padding: 0.75rem; color: var(--text-secondary);">${j.physics_version || 'N/A'}</td>
                    <td style="padding: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); font-size: 0.75rem;">${j.config_hash ? j.config_hash.substring(0,8) + '...' : 'N/A'}</td>
                    <td style="padding: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); font-size: 0.75rem;">${j.result_hash ? j.result_hash.substring(0,8) + '...' : 'N/A'}</td>
                    <td style="padding: 0.75rem;">
                        <button class="action-btn secondary" style="padding: 2px 8px; font-size: 0.75rem;" onclick="reRunSimulation('${j.job_id}', '${j.result_hash}')">Re-run</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Failed to load history", err);
    }
}

window.reRunSimulation = async function(job_id, original_hash) {
    alert("Replaying job snapshot: " + job_id + "...");
    try {
        const res = await fetch('/api/jobs/' + job_id + '/replay', { method: 'POST' });
        const data = await res.json();
        
        if (data.status === 'success') {
            alert("Replay Job Queued! Job ID: " + data.job_id + "\n\nWaiting for completion...");
            // Poll for completion
            let newHash = null;
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const pollRes = await fetch('/api/jobs/' + data.job_id);
                const pollData = await pollRes.json();
                if (pollData.status === 'COMPLETED') {
                    newHash = pollData.result_hash;
                    break;
                } else if (pollData.status === 'FAILED' || pollData.status === 'CANCELLED') {
                    alert("Replay failed with status: " + pollData.status);
                    return;
                }
            }
            if (!newHash) {
                alert("Replay timed out.");
                return;
            }
            
            if (newHash === original_hash) {
                alert("✅ Determinism Verified!\n\nOriginal Hash: " + original_hash + "\nReplay Hash: " + newHash);
            } else {
                alert("❌ Determinism Failure!\n\nOriginal Hash: " + original_hash + "\nReplay Hash: " + newHash);
            }
            window.fetchSimulationHistory();
        } else {
            alert("Error triggering replay: " + (data.message || JSON.stringify(data)));
        }
    } catch (e) {
        console.error(e);
        alert("Network error triggering replay");
    }
}
