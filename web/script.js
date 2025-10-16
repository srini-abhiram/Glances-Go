let processesData = [];
let sortColumn = 'cpu';
let sortAsc = false;
let pinnedPids = [];

function fetchStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            document.getElementById('cpu-usage').textContent = data.cpu_usage.toFixed(2);
            // current implementation supports single CPU envs
            // scope to expand to multi CPU env
            document.getElementById('cpu-model-name').textContent = data.cpu_info[0].model;
            document.getElementById('cpu-cores').textContent = data.cpu_info[0].cores;
            document.getElementById('cpu-frequency').textContent = data.cpu_info[0].maxFrequency;

            // Update Memory
            const memUsedGB = (data.mem_used / 1024 / 1024 / 1024).toFixed(2);
            const memTotalGB = (data.mem_total / 1024 / 1024 / 1024).toFixed(2);
            document.getElementById('mem-used').textContent = memUsedGB;
            document.getElementById('mem-total').textContent = memTotalGB;
            document.getElementById('mem-percent').textContent = data.mem_used_percent.toFixed(2);

            
            processesData = data.processes || [];
            renderTables();

            if (data.cpu_per_core_usage) {
                updatePerCoreUsage(data.cpu_per_core_usage);
            }

            if (data.network) {
                updateNetworkUsage(data.network);
            }

            if (data.filesystems) {
                updateFileSystemUsage(data.filesystems);
            }
        })
        .catch(error => console.error('Error fetching stats:', error));
}

function updateFileSystemUsage(fsData) {
    const tbody = document.getElementById('fs-body');
    tbody.innerHTML = '';

    if (!fsData || fsData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4">No file systems found.</td>`;
        tbody.appendChild(row);
        return;
    }

    fsData.forEach(fs => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fs.mountpoint}</td>
            <td>${(fs.used / 1e9).toFixed(2)} GB</td>
            <td>${(fs.total / 1e9).toFixed(2)} GB</td>
            <td>${fs.used_perc.toFixed(2)}%</td>
        `;
        tbody.appendChild(row);
    });
}

function updateNetworkUsage(networkData) {
    const tbody = document.getElementById('network-interfaces-body');
    tbody.innerHTML = '';

    if (!networkData || !Array.isArray(networkData)) {
        return;
    }

    networkData.forEach(interface => {
        const row = document.createElement('tr');
        let interfaceName = interface.name;
        if (interfaceName.length > 20) {
            interfaceName = interfaceName.substring(0, 20) + '...';
        }
        row.innerHTML = `
            <td title="${interface.name}">${interfaceName}</td>
            <td>${interface.rx_speed.toFixed(0)} ${interface.rx_unit}</td>
            <td>${interface.tx_speed.toFixed(0)} ${interface.tx_unit}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderTables() {
    const processBody = document.getElementById('process-list-body');
    const pinnedProcessBody = document.getElementById('pinned-process-list-body');
    const pinnedContainer = document.getElementById('pinned-process-container');

    processBody.innerHTML = '';
    pinnedProcessBody.innerHTML = '';

    // Hide pinned container if no pinned processes
    pinnedContainer.style.display = pinnedPids.length > 0 ? 'block' : 'none';

    // Sort the data
    processesData.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    // Update sort indicators
    document.querySelectorAll('#process-table thead th').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.column === sortColumn) {
            header.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
        }
    });

    processesData.forEach(proc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${proc.cpu.toFixed(2)}</td>
            <td>${proc.memory.toFixed(2)}</td>
            <td>${(proc.virt / 1024 / 1024).toFixed(2)} MB</td>
            <td>${(proc.res / 1024 / 1024).toFixed(2)} MB</td>
            <td>${proc.pid}</td>
            <td>${proc.username}</td>
            <td>${proc.cpu_time.toFixed(2)}</td>
            <td>${proc.threads}</td>
            <td>${proc.nice}</td>
            <td>${proc.status}</td>
            <td>${proc.name}</td>
        `;
        row.dataset.pid = proc.pid;

        if (pinnedPids.includes(proc.pid)) {
            pinnedProcessBody.appendChild(row);
        } else {
            processBody.appendChild(row);
        }
    });
}

function sortTable(column) {
    if (sortColumn === column) {
        sortAsc = !sortAsc;
    } else {
        sortColumn = column;
        sortAsc = true;
    }
    renderTables();
}

function togglePin(pid) {
    const index = pinnedPids.indexOf(pid);
    if (index > -1) {
        pinnedPids.splice(index, 1);
    } else {
        pinnedPids.push(pid);
    }
    renderTables();
}

function updatePerCoreUsage(perCoreUsage) {
    const tbody = document.querySelector('#per-core-usage-table tbody');
    tbody.innerHTML = '';

    if (!perCoreUsage || !Array.isArray(perCoreUsage)) {
        return;
    }

    perCoreUsage.forEach((usage, index) => {
        // Lines for better readability
        const hashCount = Math.ceil(usage / 10);
        const visualBar = '#'.repeat(hashCount);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Core ${index}</td>
            <td>${usage.toFixed(1)}% ${visualBar}</td>
        `;
        tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    setInterval(fetchStats, 2000);

    document.querySelectorAll('#process-table thead th').forEach(header => {
        const column = header.dataset.column;
        if (column && !['virt', 'res', 'pid', 'ni', 's'].includes(column)) {
            header.classList.add('sortable');
            header.addEventListener('click', () => sortTable(column));
        }
    });

    document.getElementById('process-list-body').addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (row) {
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });

    document.getElementById('pinned-process-list-body').addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (row) {
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });
});

// Function to copy text to clipboard
async function copyToClipboard(text, element) {
    // Store the element's original title attribute for restoration
    const originalTitle = element.title || 'Click to copy'; 

    try {
        await navigator.clipboard.writeText(text);
        
        // Provide visual feedback: add 'copied' class and update tooltip
        element.classList.add('copied');
        element.title = 'Copied!'; 

        // Remove visual feedback and restore original title after a delay
        setTimeout(() => {
            element.classList.remove('copied');
            element.title = originalTitle;
        }, 1500); // Feedback visible for 1.5 seconds

    } catch (err) {
        console.error('Failed to copy: ', err);
        // Provide error feedback: alert the user
        alert('Failed to copy. Please ensure clipboard access is granted and try again.');
        // Optional: Could add a temporary error class for styling, e.g.:
        // element.classList.add('copy-error');
        // setTimeout(() => { element.classList.remove('copy-error'); }, 2000);
        // In such a case, remember to restore the original title as well.
    }
}

// Add event listeners after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // IDs of the elements that should have click-to-copy functionality
    const copyableElementIds = ['os-info', 'uptime-info', 'system-time'];

    // Iterate over the IDs and attach event listeners
    copyableElementIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            // Add click event listener to copy content
            element.addEventListener('click', () => {
                copyToClipboard(element.textContent, element);
            });

            // Ensure visual cues are present for clickability, if not already set by HTML/CSS
            if (!element.style.cursor) {
                element.style.cursor = 'pointer'; // Change cursor on hover
            }
            if (!element.title) {
                element.title = 'Click to copy'; // Add initial tooltip
            }
        }
    });
});