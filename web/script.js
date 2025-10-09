function fetchStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            // Update CPU
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

            // Update Process List
            const processBody = document.getElementById('process-list-body');
            processBody.innerHTML = ''; // Clear old data

            if (data.processes) {
                data.processes.forEach(proc => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${proc.pid}</td>
                        <td>${proc.name}</td>
                        <td>${proc.cpu.toFixed(2)}</td>
                        <td>${proc.memory.toFixed(2)}</td>
                    `;
                    processBody.appendChild(row);
                });
            }
        })
        .catch(error => console.error('Error fetching stats:', error));
}

// Fetch stats every 2 seconds
setInterval(fetchStats, 2000);

// Fetch stats on initial load
document.addEventListener('DOMContentLoaded', fetchStats);