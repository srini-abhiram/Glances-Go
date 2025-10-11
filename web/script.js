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
            //scope to expand to multi CPU env
            document.getElementById('cpu-model-name').textContent =  data.cpu_info[0].model;
            document.getElementById('cpu-cores').textContent =  data.cpu_info[0].cores;
            document.getElementById('cpu-frequency').textContent =  data.cpu_info[0].maxFrequency;
            // Update Memory
            const memUsedGB = (data.mem_used / 1024 / 1024 / 1024).toFixed(2);
            const memTotalGB = (data.mem_total / 1024 / 1024 / 1024).toFixed(2);
            document.getElementById('mem-used').textContent = memUsedGB;
            document.getElementById('mem-total').textContent = memTotalGB;
            document.getElementById('mem-percent').textContent = data.mem_used_percent.toFixed(2);

            processesData = data.processes || [];
            renderTables();
        })
        .catch(error => console.error('Error fetching stats:', error));
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

    document.getElementById("download-csv-btn").addEventListener("click", () => {
        window.location.href = "/download-csv";
    });

});