let processesData = [];
let sortColumn = 'cpu';
let sortAsc = false;
let pinnedPids = [];

i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
        load: 'languageOnly',
        fallbackLng: 'en',
        detection: { order: ["navigator"] },
        backend: {
            loadPath: '/locales/{{lng}}.json'
        },
        debug: true
    }, (err, t) => {
        if (err) return console.log('something went wrong loading', err);
        updateContent();
    }); 

function updateContent() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.innerHTML = i18next.t(key);
    });
}

function updateLanguage() {
    const selector = document.getElementById('language-selector');
    if (selector) {
        selector.value = i18next.language;
    }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    let result = '';
    if (d > 0) {
        result += `${d}d `;
    }
    if (h > 0) {
        result += `${h}h `;
    }
    if (m > 0) {
        result += `${m}m `;
    }
    if (s > 0) {
        result += `${s}s`;
    }
    return result;
}

function updateUsageBar(barId, percentage) {
    const bar = document.getElementById(barId);
    if (!bar) return;

    bar.style.width = `${percentage}%`;

    // Remove existing classes
    bar.classList.remove('high-usage', 'medium-usage');

    // Add appropriate class based on usage level
    if (percentage >= 80) {
        bar.classList.add('high-usage');
    } else if (percentage >= 50) {
        bar.classList.add('medium-usage');
    }
}

function fetchStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            // Update CPU
            const cpuUsage = data.cpu_usage.toFixed(2);
            document.getElementById('cpu-usage').textContent = cpuUsage;
            updateUsageBar('cpu-usage-bar', data.cpu_usage);

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
            updateUsageBar('mem-usage-bar', data.mem_used_percent);

            // Update OS, Uptime and System Time
            document.getElementById('os-distro').textContent = data.os.distro;
            document.getElementById('os-name').textContent = data.os.name;
            document.getElementById('os-arch').textContent = data.os.architecture;
            document.getElementById('system-time').textContent = new Date().toLocaleTimeString();
            document.getElementById('uptime').textContent = formatUptime(data.uptime);

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
        const row = document.createElement('tr');
        const usagePercent = usage.toFixed(1);

        // Determine color class based on usage
        let barClass = '';
        if (usage >= 80) {
            barClass = 'high-usage';
        } else if (usage >= 50) {
            barClass = 'medium-usage';
        }

        row.innerHTML = `
            <td>Core ${index}</td>
            <td>
                <div class="core-usage-container">
                    <span class="core-usage-text">${usagePercent}%</span>
                    <div class="core-usage-bar-bg">
                        <div class="core-usage-bar ${barClass}" style="width: ${usage}%"></div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    setInterval(fetchStats, 2000);

    const selector = document.getElementById('language-selector');
    if(selector) {
        selector.addEventListener('change', (event) => {
            const chosenLng = event.target.value;
            i18next.changeLanguage(chosenLng, (err, t) => {
                if (err) return console.error('An error has occurred while changing language', err);
                updateContent();
            });
        });
    }

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
