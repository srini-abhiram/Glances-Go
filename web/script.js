const AUTO_REFRESH_ENABLED_KEY = 'autoRefreshEnabled';

let processesData = [];
let sortColumn = 'cpu';
let sortAsc = false;
let pinnedPids = [];
let autoRefreshInterval;
let autoRefreshEnabled = JSON.parse(localStorage.getItem(AUTO_REFRESH_ENABLED_KEY)) !== false;
let historyData = [];
let cpuHistoryChart = null;
let memoryHistoryChart = null;

i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
        load: 'languageOnly',
        fallbackLng: 'en',
        detection: { order: ['navigator'] },
        backend: {
            loadPath: '/locales/{{lng}}.json'
        },
        debug: false
    }, (err, t) => {
        if (err) return console.log('something went wrong loading', err);
        updateContent();
        updateLanguage();
    });

i18next.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
    updateLanguage();
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
        const baseLanguage = i18next.language.split('-')[0];
        selector.value = baseLanguage;
    }
}

function formatUptime(seconds) {

    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const result = [];

    if (d > 0) {
        result.push(i18next.t('uptime_day', { count: d }));
    }
    if (h > 0) {
        result.push(i18next.t('uptime_hour', { count: h }));
    }
    if (m > 0) {
        result.push(i18next.t('uptime_minute', { count: m }));
    }
    if (s > 0) {
        result.push(i18next.t('uptime_second', { count: s }));
    }
    return result.join(' ');
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

async function copyText(el) {
    const text = el.textContent.trim();

    try {
        await navigator.clipboard.writeText(text);
        el.setAttribute("data-tooltip", "Copied!");
    } catch (err) {
        console.error("Failed:", err);
        el.setAttribute("data-tooltip", "Failed");
    }
}

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

function fetchHistory() {
    fetch('/history')
        .then(response => {
            if (!response.ok) {
                if (response.status === 503) {
                    // History is disabled
                    document.getElementById('history-container').style.display = 'none';
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0) {
                historyData = data;
                document.getElementById('history-container').style.display = 'block';
                updateHistoryCharts();
            } else if (data) {
                // Empty array, history is enabled but no data yet
                document.getElementById('history-container').style.display = 'block';
            }
        })
        .catch(error => console.error('Error fetching history:', error));
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
            <td class="process-name-cell">
                <span class="copy-text process-name-text" data-tooltip="Click to copy">
                    ${proc.name}
                </span>
            </td>
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

function drawChart(canvasId, data, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 200;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No historical data available yet', width / 2, height / 2);
        return;
    }

    // Calculate dimensions
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Find min and max values
    const values = data.map(d => d.value);
    const maxValue = Math.max(...values, 100); // At least 100 for percentage
    const minValue = Math.min(...values, 0);

    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight * i / 5);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();

        // Y-axis labels
        const value = maxValue - (maxValue - minValue) * i / 5;
        ctx.fillStyle = '#999';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(value.toFixed(1), padding - 5, y + 3);
    }

    // Draw line
    if (data.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        data.forEach((point, index) => {
            const x = padding + (chartWidth * index / (data.length - 1));
            const y = height - padding - ((point.value - minValue) / (maxValue - minValue) * chartHeight);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points
        ctx.fillStyle = color;
        data.forEach((point, index) => {
            const x = padding + (chartWidth * index / (data.length - 1));
            const y = height - padding - ((point.value - minValue) / (maxValue - minValue) * chartHeight);

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    // X-axis labels (show time for first and last point)
    if (data.length > 0) {
        ctx.fillStyle = '#999';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        const firstTime = new Date(data[0].timestamp).toLocaleTimeString();
        ctx.fillText(firstTime, padding, height - padding + 15);

        ctx.textAlign = 'right';
        const lastTime = new Date(data[data.length - 1].timestamp).toLocaleTimeString();
        ctx.fillText(lastTime, width - padding, height - padding + 15);
    }
}

function updateHistoryCharts() {
    if (!historyData || historyData.length === 0) return;

    // Prepare CPU data
    const cpuData = historyData.map(point => ({
        timestamp: point.timestamp,
        value: point.cpu_usage
    }));

    // Prepare Memory data
    const memData = historyData.map(point => ({
        timestamp: point.timestamp,
        value: point.mem_used_percent
    }));

    drawChart('cpu-history-chart', cpuData, 'CPU Usage', '#4CAF50');
    drawChart('memory-history-chart', memData, 'Memory Usage', '#2196F3');
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
    fetchHistory();
    startSystemTimeClock();
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    if (autoRefreshToggle) {
        autoRefreshToggle.checked = autoRefreshEnabled;
        if (autoRefreshEnabled) {
            startAutoRefresh();
        }
        autoRefreshToggle.addEventListener('change', function () {
            autoRefreshEnabled = this.checked;
            localStorage.setItem(AUTO_REFRESH_ENABLED_KEY, autoRefreshEnabled);
            if (autoRefreshEnabled) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });
    }

    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            fetchStats();
            fetchHistory();
            console.log("Manual refresh triggered.");
        });
    }

    const selector = document.getElementById('language-selector');
    if (selector) {
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
        const nameText = e.target.closest('.process-name-text');
        if (nameText) {
            copyText(nameText);
            return;
        }
        const row = e.target.closest('tr');
        if (row) {
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });

    document.getElementById('pinned-process-list-body').addEventListener('click', e => {
        const nameText = e.target.closest('.process-name-text');
        if (nameText) {
            copyText(nameText);
            return;
        }

        const row = e.target.closest('tr');
        if (row) {
            togglePin(parseInt(row.dataset.pid, 10));
        }
    });

    document.getElementById('process-list-body').addEventListener('mouseover', e => {
        const nameText = e.target.closest('.process-name-text');
        if (nameText) {
            nameText.setAttribute('data-tooltip', 'Click to copy');
        }
    });

    document.getElementById('pinned-process-list-body').addEventListener('mouseover', e => {
        const nameText = e.target.closest('.process-name-text');
        if (nameText) {
            nameText.setAttribute('data-tooltip', 'Click to copy');
        }
    });

    const items = document.querySelectorAll(".copy-text");
    items.forEach((el) => {
        el.addEventListener("mouseenter", () => {
            el.setAttribute("data-tooltip", "Click to copy");
        });

        el.addEventListener("click", () => {
            copyText(el);
        });
    });
});

/**
 * Starts the auto-refresh interval for fetching statistics.
 */
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(() => {
        fetchStats();
        fetchHistory();
    }, 2000);
    console.log("Auto-refresh started.");
}

/**
 * Stops the auto-refresh interval.
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log("Auto-refresh stopped.");
    }
}

/**
 * Starts an independent clock to update the system time every second 
 */
function startSystemTimeClock() {
    setInterval(() => {
        document.getElementById('system-time').textContent = new Date().toLocaleTimeString();
    }, 1000);
    console.log("System time clock started independently.");
}