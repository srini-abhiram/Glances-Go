function fetchStats() {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
            // Update CPU
            document.getElementById('cpu-usage').textContent = data.cpu_usage.toFixed(2);

            // Update Memory
            const memUsedGB = (data.mem_used / 1024 / 1024 / 1024).toFixed(2);
            const memTotalGB = (data.mem_total / 1024 / 1024 / 1024).toFixed(2);
            document.getElementById('mem-used').textContent = memUsedGB;
            document.getElementById('mem-total').textContent = memTotalGB;
            document.getElementById('mem-percent').textContent = data.mem_used_percent.toFixed(2);
        })
        .catch(error => console.error('Error fetching stats:', error));
}

// Fetch stats every 2 seconds
setInterval(fetchStats, 2000);

// Fetch stats on initial load
document.addEventListener('DOMContentLoaded', fetchStats);