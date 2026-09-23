export async function renderAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    try {
        const response = await fetch('/api/audit');
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.logs) {
                tbody.innerHTML = '';
                if (data.logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--text-dim);">No audit logs found.</td></tr>';
                    return;
                }
                
                data.logs.forEach(log => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    
                    const dateObj = new Date(log.timestamp);
                    const timeStr = dateObj.toLocaleString();
                    
                    tr.innerHTML = `
                        <td style="padding: 0.75rem; color: var(--text-dim);">${log.id}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary);">${timeStr}</td>
                        <td style="padding: 0.75rem; color: #fff;">${log.actor}</td>
                        <td style="padding: 0.75rem; color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.8rem;">${log.action}</td>
                        <td style="padding: 0.75rem; color: var(--text-secondary);">${log.entity_id || '-'}</td>
                        <td style="padding: 0.75rem; color: var(--text-dim); font-size: 0.75rem;">${log.details || '-'}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--accent-crimson);">Failed to load audit logs. Server returned ${response.status}</td></tr>`;
        }
    } catch (e) {
        console.error("Failed to fetch audit logs", e);
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--accent-crimson);">Error fetching audit logs. Check console.</td></tr>';
    }
}
