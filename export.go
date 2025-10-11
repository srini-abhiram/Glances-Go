package main

import (
	"encoding/csv"
	"os"
	"strconv"
	"time"
)

// CSVExporter writes metrics to CSV
type CSVExporter struct {
	file   *os.File
	writer *csv.Writer
}

// NewCSVExporter initializes the CSV writer and headers
func NewCSVExporter(path string) *CSVExporter {
	f, err := os.Create(path)
	if err != nil {
		panic(err)
	}

	w := csv.NewWriter(f)

	// Header columns
	headers := []string{
		"timestamp",
		"cpu_usage_total",
		"mem_used_percent",
		"mem_used_bytes",
		"mem_total_bytes",
		"disk_read_bytes",
		"disk_write_bytes",
		"net_bytes_sent",
		"net_bytes_recv",
	}

	w.Write(headers)
	w.Flush()

	return &CSVExporter{file: f, writer: w}
}

// Write appends a new line of system metrics
func (e *CSVExporter) Write(s SystemStats) error {
	record := []string{
		time.Now().Format(time.RFC3339),
		strconv.FormatFloat(s.CPUUsage, 'f', 2, 64),
		strconv.FormatFloat(s.MemUsedPercent, 'f', 2, 64),
		strconv.FormatUint(s.MemUsed, 10),
		strconv.FormatUint(s.MemTotal, 10),
		strconv.FormatUint(s.DiskReadBytes, 10),
		strconv.FormatUint(s.DiskWriteBytes, 10),
		strconv.FormatUint(s.NetBytesSent, 10),
		strconv.FormatUint(s.NetBytesRecv, 10),
	}

	if err := e.writer.Write(record); err != nil {
		return err
	}
	e.writer.Flush()
	return e.writer.Error()
}
