package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// Handler for the /stats endpoint
func statsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := collectStats()
	if err != nil {
		http.Error(w, "Error collecting stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	    err = json.NewEncoder(w).Encode(stats)
	    if err != nil {
	        log.Printf("Error encoding stats: %v", err)
	    }}

func main() {
	// Serve static files from a 'web' directory
	fs := http.FileServer(http.Dir("./web"))
	http.Handle("/", fs)

	// Handle the stats endpoint
	http.HandleFunc("/stats", statsHandler)

	log.Println("Starting server on :8080...")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
