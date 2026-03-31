package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"time"
)

var metricsHistory *MetricsHistory

// Handler for the /stats endpoint
func statsHandler(cacheTTL time.Duration, maxProcesses int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats, err := collectStats(cacheTTL, maxProcesses)
		if err != nil {
			http.Error(w, "Error collecting stats", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		err = json.NewEncoder(w).Encode(stats)
		if err != nil {
			log.Printf("Error encoding stats: %v", err)
		}
	}
}

// Handler for the /history endpoint
func historyHandler(w http.ResponseWriter, r *http.Request) {
	if metricsHistory == nil {
		http.Error(w, "History collection is disabled", http.StatusServiceUnavailable)
		return
	}

	history := metricsHistory.GetHistory()

	w.Header().Set("Content-Type", "application/json")
	err := json.NewEncoder(w).Encode(history)
	if err != nil {
		log.Printf("Error encoding history: %v", err)
	}
}

func main() {
	var (
		port             string
		cacheTTL         time.Duration
		maxProcesses     int
		enableHistory    bool
		historyInterval  time.Duration
		historyRetention time.Duration
	)

	// Custom usage: print flags only.
	flag.Usage = func() {
		flag.PrintDefaults()
	}

	// CLI flags
	flag.StringVar(&port, "port", "8080", "HTTP listen port (e.g., 8080)")
	flag.DurationVar(&cacheTTL, "cache-ttl", 2*time.Second,
		"How long to cache metrics (unit required; e.g., 500ms, 0.5s, 2s)")
	flag.IntVar(&maxProcesses, "max-processes", 20, "Maximum number of OS processes to monitor")
	flag.BoolVar(&enableHistory, "enable-history", false, "Enable historical metrics collection")
	flag.DurationVar(&historyInterval, "history-interval", 1*time.Minute,
		"Interval for collecting historical metrics (e.g., 30s, 1m, 5m)")
	flag.DurationVar(&historyRetention, "history-retention", 24*time.Hour,
		"How long to retain historical metrics (e.g., 1h, 12h, 24h)")
	flag.Parse()

	// Initialize and start metrics history collection if enabled
	if enableHistory {
		metricsHistory = NewMetricsHistory(historyInterval, historyRetention)
		metricsHistory.Start(cacheTTL, maxProcesses)
		log.Printf("Historical metrics collection enabled (interval: %v, retention: %v)\n",
			historyInterval, historyRetention)
	}

	// Serve static files from a 'web' directory
	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/", fs)

	// Handle the stats endpoint
	http.HandleFunc("/stats", statsHandler(cacheTTL, maxProcesses))

	// Handle the history endpoint
	http.HandleFunc("/history", historyHandler)

	addr := ":" + port
	log.Printf("Starting server on http://localhost%s\n", addr)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal(err)
	}
}
