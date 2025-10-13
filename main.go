package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"time"
)

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

func main() {
	var (
		port         string
		cacheTTL     time.Duration
		maxProcesses int
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
	flag.Parse()

	// Serve static files from a 'web' directory
	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/", fs)

	// Handle the stats endpoint
	http.HandleFunc("/stats", statsHandler(cacheTTL, maxProcesses))

	addr := ":" + port
	log.Printf("Starting server on %s...\n", addr)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal(err)
	}
}
