# 24-Hour Metrics History Feature

## Overview
This feature adds the ability to store and visualize historical system metrics (CPU and Memory usage) over a configurable time period (default: 24 hours).

## Architecture

### Backend (Go)
- **In-memory ring buffer**: Efficient storage with automatic cleanup
- **Thread-safe**: Uses RWMutex for concurrent access
- **Background collection**: Goroutine-based periodic metrics gathering
- **No external dependencies**: Uses only standard library and existing dependencies

### Frontend (JavaScript/HTML/Canvas)
- **Simple canvas-based charts**: No external charting libraries required
- **Auto-refresh integration**: Charts update automatically with the rest of the UI
- **Graceful degradation**: Hidden when history is disabled

## Files Modified/Added

### New Files
- `history.go` - Core history storage and collection logic

### Modified Files
- `main.go` - Added /history endpoint and CLI flags
- `web/index.html` - Added history charts container
- `web/script.js` - Added chart rendering and history fetching
- `web/style.css` - Added chart styling
- `.gitignore` - Added glances-go binary

## CLI Flags

### Enable History
```bash
./glances-go --enable-history
```

### Customize Collection Interval
```bash
./glances-go --enable-history --history-interval=30s
```

### Customize Retention Period
```bash
./glances-go --enable-history --history-retention=12h
```

### Full Example
```bash
./glances-go --enable-history --history-interval=1m --history-retention=24h --port=8080
```

## API Endpoints

### GET /history
Returns historical metrics data points.

**Response (200 OK):**
```json
[
  {
    "timestamp": "2026-03-31T14:00:00Z",
    "cpu_usage": 45.2,
    "mem_used_percent": 67.8,
    "mem_used": 8589934592,
    "mem_total": 17179869184,
    "cpu_per_core_usage": [42.1, 48.3, 44.9, 45.6]
  },
  ...
]
```

**Response (503 Service Unavailable):**
When history is disabled via CLI flags.

## Memory Considerations

The ring buffer size is calculated as:
```
max_data_points = retention_period / collection_interval
```

**Example calculations:**
- 24h retention @ 1min interval = 1,440 data points
- 12h retention @ 30s interval = 1,440 data points
- 1h retention @ 10s interval = 360 data points

Each data point stores:
- Timestamp (time.Time): ~24 bytes
- CPU usage (float64): 8 bytes
- Memory percent (float64): 8 bytes
- Memory used (uint64): 8 bytes
- Memory total (uint64): 8 bytes
- Per-core CPU ([]float64): ~8 bytes per core

**Approximate memory per data point:** ~56 bytes + (8 × number_of_cores) bytes

For 1,440 data points with 8 cores:
- ~56 + 64 = 120 bytes per point
- 120 × 1,440 = ~172 KB total

## Default Behavior

History collection is **disabled by default** to maintain backward compatibility and avoid unexpected memory usage.

To enable, explicitly use the `--enable-history` flag.

## Testing

Build and run with history enabled:
```bash
go build -o glances-go
./glances-go --enable-history
```

Access the web interface at http://localhost:8080

The history charts will appear below the main stats cards if history is enabled and data is available.

## Future Enhancements (Not Implemented)

Potential improvements for future versions:
- Persistent storage (SQLite, file-based)
- More metrics (disk I/O, network throughput)
- Configurable chart time ranges
- Export historical data (CSV, JSON)
- Per-process historical tracking
- Alerts based on historical trends
