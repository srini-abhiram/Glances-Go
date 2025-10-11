package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// Handler for the /stats endpoint
func statsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := collectStats()
	if err != nil {
		http.Error(w, "Error collecting stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// Handler for downloading the CSV file
func downloadCSVHandler(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if path == "" {
			http.Error(w, "CSV export not enabled", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Disposition", "attachment; filename=\"metrics.csv\"")
		w.Header().Set("Content-Type", "text/csv")
		http.ServeFile(w, r, path)
	}
}

func main() {
	const exportPath = "metrics.csv"
	log.Printf("[INFO] CSV export enabled → writing to %s\n", exportPath)

	exporter := NewCSVExporter(exportPath)
	go func() {
		for {
			stats, err := collectStats()
			if err != nil {
				log.Println("[ERROR] Collecting stats:", err)
				time.Sleep(2 * time.Second)
				continue
			}
			if err := exporter.Write(stats); err != nil {
				log.Println("[ERROR] Writing CSV:", err)
			}
			time.Sleep(2 * time.Second)
		}
	}()

	// Serve static files from a 'web' directory
	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/", fs)

	http.HandleFunc("/download-csv", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", "attachment; filename=\"metrics.csv\"")
		w.Header().Set("Content-Type", "text/csv")
		http.ServeFile(w, r, exportPath)
	})

	// Handle the stats endpoint
	http.HandleFunc("/stats", statsHandler)

	log.Println("Starting server on :8080...")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
