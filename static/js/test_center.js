let testRuns = [];

function getStatusBadge(status) {
    let bgColor, color;
    switch(status) {
        case "PASS":
            bgColor = "rgba(16,185,129,0.2)";
            color = "var(--accent-emerald)";
            break;
        case "FAIL":
            bgColor = "rgba(239,68,68,0.2)";
            color = "var(--tactical-red)";
            break;
        case "BLOCKED":
            bgColor = "rgba(100,116,139,0.2)";
            color = "var(--text-dim)";
            break;
        case "PENDING":
            bgColor = "rgba(245,158,11,0.2)";
            color = "var(--accent-amber)";
            break;
        default:
            bgColor = "rgba(100,116,139,0.2)";
            color = "var(--text-dim)";
    }
    return `<span style="background: ${bgColor}; color: ${color}; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: bold; font-size: 0.7rem;">${status}</span>`;
}

export async function renderTestCenter() {
    const tbody = document.getElementById('test-center-table-body');
    const select1 = document.getElementById('compare-test-1');
    const select2 = document.getElementById('compare-test-2');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 1rem;">Loading test runs from database...</td></tr>';
    
    try {
        const response = await fetch('/api/test-runs');
        if (!response.ok) throw new Error('Network response was not ok');
        const json = await response.json();
        testRuns = json.data || [];
    } catch (error) {
        console.error('Error fetching test runs:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--tactical-red); padding: 1rem;">Error loading test runs from database.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    // Clear existing options except the first placeholder
    select1.innerHTML = '<option value="">Select Test 1</option>';
    select2.innerHTML = '<option value="">Select Test 2</option>';
    
    testRuns.forEach((test, index) => {
        // Add to selects
        const opt1 = document.createElement('option');
        opt1.value = index;
        opt1.text = `${test.id} - ${test.status}`;
        select1.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = index;
        opt2.text = `${test.id} - ${test.status}`;
        select2.appendChild(opt2);

        // Add to table
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        
        tr.innerHTML = `
            <td style="padding: 0.5rem; color: var(--accent-cyan); font-family: var(--font-mono); cursor: help;" title="${test.notes}\nEvidence: ${test.evidence}">${test.id}</td>
            <td style="padding: 0.5rem; color: var(--text-dim);">${test.date}</td>
            <td style="padding: 0.5rem; color: var(--text-secondary); max-width: 250px;">${test.objective}</td>
            <td style="padding: 0.5rem; font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim);">
                M: ${test.model_version}<br>
                S: ${test.software_version}<br>
                H: ${test.hardware_version}
            </td>
            <td style="padding: 0.5rem; font-family: var(--font-mono); font-size: 0.7rem;">${test.config}</td>
            <td style="padding: 0.5rem; color: var(--text-secondary);">${test.expected}</td>
            <td style="padding: 0.5rem; color: var(--text-primary); font-weight: 500;">${test.observed}</td>
            <td style="padding: 0.5rem;">${getStatusBadge(test.status)}</td>
        `;
        tbody.appendChild(tr);
    });
    
    // Attach compare event listener
    const btnCompare = document.getElementById('btn-compare-tests');
    if (btnCompare) {
        btnCompare.addEventListener('click', () => {
            const val1 = select1.value;
            const val2 = select2.value;
            const compArea = document.getElementById('test-comparison-area');
            const compContent = document.getElementById('test-comparison-content');
            
            if (val1 === "" || val2 === "") {
                compArea.style.display = 'block';
                compContent.style.color = "var(--tactical-red)";
                compContent.textContent = "Error: Please select two tests to compare.";
                return;
            }
            
            const t1 = testRuns[parseInt(val1)];
            const t2 = testRuns[parseInt(val2)];
            
            compArea.style.display = 'block';
            compContent.style.color = "var(--text-secondary)";
            
            // Generate comparison HTML
            let html = `<div style="display: flex; gap: 2rem;">`;
            
            html += `<div style="flex: 1;">
                <div style="color: var(--accent-cyan); font-weight: bold; margin-bottom: 0.5rem;">${t1.id} (${t1.status})</div>
                <div><strong>Date:</strong> ${t1.date}</div>
                <div><strong>Obj:</strong> ${t1.objective}</div>
                <div><strong>Config:</strong> ${t1.config}</div>
                <div><strong>Exp:</strong> ${t1.expected}</div>
                <div><strong>Obs:</strong> ${t1.observed}</div>
            </div>`;
            
            html += `<div style="flex: 1; border-left: 1px solid var(--border-steel); padding-left: 2rem;">
                <div style="color: var(--accent-orange); font-weight: bold; margin-bottom: 0.5rem;">${t2.id} (${t2.status})</div>
                <div><strong>Date:</strong> ${t2.date}</div>
                <div><strong>Obj:</strong> ${t2.objective}</div>
                <div><strong>Config:</strong> ${t2.config}</div>
                <div><strong>Exp:</strong> ${t2.expected}</div>
                <div><strong>Obs:</strong> ${t2.observed}</div>
            </div>`;
            
            html += `</div>`;
            
            // Add conclusion logic if they are related
            let diff = "";
            if (t1.status === "PASS" && t2.status === "FAIL") {
                diff = `Conclusion: Degradation observed in ${t2.id}.`;
            } else if (t1.status === "FAIL" && t2.status === "PASS") {
                diff = `Conclusion: Improvement observed in simulation in ${t2.id}.`;
            } else {
                diff = `Conclusion: No status change between tests.`;
            }
            
            html += `<div style="margin-top: 1rem; color: var(--accent-emerald); font-weight: bold;">${diff}</div>`;
            
            compContent.innerHTML = html;
        });
    }
    
    // Attach form submission listener
    const formNewTest = document.getElementById('form-new-test-run');
    if (formNewTest) {
        // Remove existing listener to prevent duplicates if renderTestCenter is called multiple times
        formNewTest.replaceWith(formNewTest.cloneNode(true));
        const newForm = document.getElementById('form-new-test-run');
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const payload = {
                objective: document.getElementById('test-objective').value,
                model_version: document.getElementById('test-model').value,
                software_version: document.getElementById('test-software').value,
                hardware_version: document.getElementById('test-hardware').value,
                config: document.getElementById('test-config').value,
                expected: document.getElementById('test-expected').value,
                observed: document.getElementById('test-observed').value,
                status: document.getElementById('test-status').value,
                source_type: document.getElementById('test-source').value,
                evidence: document.getElementById('test-evidence').value,
                notes: document.getElementById('test-notes').value
            };
            
            try {
                const res = await fetch('/api/test-runs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    newForm.reset();
                    // Re-render table
                    await renderTestCenter();
                } else {
                    const err = await res.json();
                    alert("Error saving test run: " + JSON.stringify(err));
                }
            } catch (err) {
                console.error(err);
                alert("Network error while saving test run.");
            }
        });
    }
}
