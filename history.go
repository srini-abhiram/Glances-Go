package main

import (
	"sync"
	"time"
)

// HistoricalDataPoint represents a single point in time with key metrics
type HistoricalDataPoint struct {
	Timestamp       time.Time `json:"timestamp"`
	CPUUsage        float64   `json:"cpu_usage"`
	MemUsedPercent  float64   `json:"mem_used_percent"`
	MemUsed         uint64    `json:"mem_used"`
	MemTotal        uint64    `json:"mem_total"`
	CPUPerCoreUsage []float64 `json:"cpu_per_core_usage,omitempty"`
}

// MetricsHistory manages the collection and storage of historical metrics
type MetricsHistory struct {
	dataPoints    []HistoricalDataPoint
	maxDataPoints int
	mutex         sync.RWMutex
	interval      time.Duration
	retention     time.Duration
	stopChan      chan struct{}
}

// NewMetricsHistory creates a new metrics history manager
func NewMetricsHistory(interval, retention time.Duration) *MetricsHistory {
	// Calculate max data points based on retention and interval
	maxDataPoints := int(retention / interval)
	if maxDataPoints < 1 {
		maxDataPoints = 1
	}

	return &MetricsHistory{
		dataPoints:    make([]HistoricalDataPoint, 0, maxDataPoints),
		maxDataPoints: maxDataPoints,
		interval:      interval,
		retention:     retention,
		stopChan:      make(chan struct{}),
	}
}

// Start begins collecting metrics at the specified interval
func (mh *MetricsHistory) Start(cacheTTL time.Duration, maxProcesses int) {
	ticker := time.NewTicker(mh.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				stats, err := collectStats(cacheTTL, maxProcesses)
				if err == nil {
					mh.AddDataPoint(stats)
				}
			case <-mh.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

// Stop stops the metrics collection
func (mh *MetricsHistory) Stop() {
	close(mh.stopChan)
}

// AddDataPoint adds a new data point to the history (ring buffer behavior)
func (mh *MetricsHistory) AddDataPoint(stats SystemStats) {
	mh.mutex.Lock()
	defer mh.mutex.Unlock()

	dataPoint := HistoricalDataPoint{
		Timestamp:       time.Now(),
		CPUUsage:        stats.CPUUsage,
		MemUsedPercent:  stats.MemUsedPercent,
		MemUsed:         stats.MemUsed,
		MemTotal:        stats.MemTotal,
		CPUPerCoreUsage: stats.CPUPerCoreUsage,
	}

	// Ring buffer: if we've reached max capacity, remove the oldest
	if len(mh.dataPoints) >= mh.maxDataPoints {
		mh.dataPoints = mh.dataPoints[1:]
	}

	mh.dataPoints = append(mh.dataPoints, dataPoint)
}

// GetHistory returns all historical data points within the retention period
func (mh *MetricsHistory) GetHistory() []HistoricalDataPoint {
	mh.mutex.RLock()
	defer mh.mutex.RUnlock()

	// Filter out data points older than retention period
	cutoff := time.Now().Add(-mh.retention)
	validPoints := make([]HistoricalDataPoint, 0, len(mh.dataPoints))

	for _, point := range mh.dataPoints {
		if point.Timestamp.After(cutoff) {
			validPoints = append(validPoints, point)
		}
	}

	return validPoints
}

// GetHistorySince returns historical data points since a specific time
func (mh *MetricsHistory) GetHistorySince(since time.Time) []HistoricalDataPoint {
	mh.mutex.RLock()
	defer mh.mutex.RUnlock()

	validPoints := make([]HistoricalDataPoint, 0, len(mh.dataPoints))

	for _, point := range mh.dataPoints {
		if point.Timestamp.After(since) {
			validPoints = append(validPoints, point)
		}
	}

	return validPoints
}
