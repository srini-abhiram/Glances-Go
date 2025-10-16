let processesData = [];
let sortColumn = 'cpu';
let sortAsc = false;
let pinnedPids = [];
let autoRefreshInterval; // Holds the ID for the setInterval
let autoRefreshEnabled = true; // Default to true for auto-refresh on page load

/**
 * Fetches statistics from the server and updates the UI.
 */
function fetchStats() {
    fetch('/stats')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Update CPU
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

            // Update Processes
            processesData = data.processes || [];
            renderTables();

            // Update Per-Core CPU Usage
            if (data.cpu_per_core_usage) {
                updatePerCoreUsage(data.cpu_per_core_usage);
            }

            // Update Network Usage
            if (data.network) {
                updateNetworkUsage(data.network);
            }

            // Update File System Usage
            if (data.filesystems) {
                updateFileSystemUsage(data.filesystems);
            }
        })
        .catch(error => console.error('Error fetching stats:', error));
}

/**
 * Updates the file system usage table.
 * @param {Array} fsData - An array of file system objects.
 */
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

/**
 * Updates the network interfaces usage table.
 * @param {Array} networkData - An array of network interface objects.
 */
function updateNetworkUsage(networkData) {
    const tbody = document.getElementById('network-interfaces-body');
    tbody.innerHTML = '';

    if (!networkData || !Array.isArray(networkData)) {
        return;
    }

    networkData.forEach(interface => {
        const row = document.createElement('tr');
        let interfaceName = interface.name;
        // Truncate long interface names for display, keep full name in title for tooltip
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

/**
 * Renders both the main process table and the pinned process table.
 */
function renderTables() {
    const processBody = document.getElementById('process-list-body');
    const pinnedProcessBody = document.getElementById('pinned-process-list-body');
    const pinnedContainer = document.getElementById('pinned-process-container');

    processBody.innerHTML = '';
    pinnedProcessBody.innerHTML = '';

    // Hide/show pinned container based on whether there are pinned processes
    pinnedContainer.style.display = pinnedPids.length > 0 ? 'block' : 'none';

    // Sort the process data based on the current sort column and direction
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

    // Update sort indicators in the table header
    document.querySelectorAll('#process-table thead th').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (header.dataset.column === sortColumn) {
            header.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
        }
    });

    // Populate the process tables
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
        row.dataset.pid = proc.pid; // Store PID on the row for easy access

        if (pinnedPids.includes(proc.pid)) {
            pinnedProcessBody.appendChild(row);
        } else {
            processBody.appendChild(row);
        }
    });
}

/**
 * Handles sorting the process table by a given column.
 * @param {string} column - The data column to sort by.
 */
function sortTable(column) {
    if (sortColumn === column) {
        sortAsc = !sortAsc; // Toggle sort direction if same column
    } else {
        sortColumn = column;
        sortAsc = true; // Default to ascending for new column
    }
    renderTables();
}

/**
 * Toggles the pinned state of a process by its PID.
 * @param {number} pid - The Process ID to pin/unpin.
 */
function togglePin(pid) {
    const index = pinnedPids.indexOf(pid);
    if (index > -1) {
        pinnedPids.splice(index, 1); // Unpin
    } else {
        pinnedPids.push(pid); // Pin
    }
    renderTables(); // Re-render tables to reflect pin state
}

/**
 * Updates the per-core CPU usage table.
 * @param {Array} perCoreUsage - An array of CPU usage percentages for each core.
 */
function updatePerCoreUsage(perCoreUsage) {
    const tbody = document.querySelector('#per-core-usage-table tbody');
    tbody.innerHTML = '';

    if (!perCoreUsage || !Array.isArray(perCoreUsage)) {
        return;
    }

    perCoreUsage.forEach((usage, index) => {
        const hashCount = Math.ceil(usage / 10); // Simple visual bar with '#'
        const visualBar = '#'.repeat(hashCount);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Core ${index}</td>
            <td>${usage.toFixed(1)}% ${visualBar}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Starts the auto-refresh interval for fetching statistics.
 */
function startAutoRefresh() {
    // Clear any existing interval to prevent multiple intervals running
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(fetchStats, 2000); // Refresh every 2 seconds
    console.log("Auto-refresh started.");
}

/**
 * Stops the auto-refresh interval.
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null; // Clear the interval ID
        console.log("Auto-refresh stopped.");
    }
}

// Event listener for when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    fetchStats(); // Initial fetch of stats on page load

    // --- Auto-Refresh Toggle Logic ---
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    if (autoRefreshToggle) {
        // Set initial state of the toggle switch based on autoRefreshEnabled
        autoRefreshToggle.checked = autoRefreshEnabled;

        // Start auto-refresh if it's initially enabled
        if (autoRefreshEnabled) {
            startAutoRefresh();
        }

        // Add event listener for the toggle switch
        autoRefreshToggle.addEventListener('change', function() {
            autoRefreshEnabled = this.checked; // Update global state
            if (autoRefreshEnabled) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });
    }

    // --- Manual Refresh Button Logic (Optional) ---
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            fetchStats();
            console.log("Manual refresh triggered.");
        });
    }

    // --- Process Table Sorting Logic ---
    document.querySelectorAll('#process-table thead th').forEach(header => {
        const column = header.dataset.column;
        // Only make specific columns sortable (e.g., exclude 'virt', 'res' which might be less commonly sorted directly)
        if (column && !['virt', 'res', 'pid', 'ni', 's'].includes(column)) {
            header.classList.add('sortable'); // Add class for styling
            header.addEventListener('click', () => sortTable(column));
        }
    });

    // --- Process Pinning Logic ---
    // Event delegation for pinning processes in the main list
    document.getElementById('process-list-body').addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (row && row.dataset.pid) { // Ensure a row with a PID was clicked
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });

    // Event delegation for unpinning processes in the pinned list
    document.getElementById('pinned-process-list-body').addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (row && row.dataset.pid) { // Ensure a row with a PID was clicked
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });
});