package main

import (
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
	"sort"
	"time"
)

// Process holds information about a single running process
type Process struct {
	Pid    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float32 `json:"memory"`
}

// SystemStats is the main structure for all system metrics
type SystemStats struct {
	CPUUsage       float64   `json:"cpu_usage"`
	MemTotal       uint64    `json:"mem_total"`
	MemUsed        uint64    `json:"mem_used"`
	MemUsedPercent float64   `json:"mem_used_percent"`
	Processes      []Process `json:"processes"`
}

func collectStats() (SystemStats, error) {
	var stats SystemStats

	// CPU Usage
	cpuPercentages, err := cpu.Percent(time.Second, false)
	if err != nil {
		return stats, err
	}
	if len(cpuPercentages) > 0 {
		stats.CPUUsage = cpuPercentages[0]
	}

	// Memory Usage
	vm, err := mem.VirtualMemory()
	if err != nil {
		return stats, err
	}
	stats.MemTotal = vm.Total
	stats.MemUsed = vm.Used
	stats.MemUsedPercent = vm.UsedPercent

	// Process List
	pids, err := process.Pids()
	if err != nil {
		return stats, err
	}

	var processes []Process
	for _, pid := range pids {
		p, err := process.NewProcess(pid)
		if err != nil {
			continue // Skip processes that might have terminated
		}
		name, _ := p.Name()
		cpu, _ := p.CPUPercent()
		mem, _ := p.MemoryPercent()

		processes = append(processes, Process{
			Pid:     pid,
			Name:    name,
			CPU:     cpu,
			Memory:  mem,
		})
	}

	// Sort processes by CPU usage (descending)
	sort.Slice(processes, func(i, j int) bool {
		return processes[i].CPU > processes[j].CPU
	})

	// Limit to top 20 processes
	if len(processes) > 20 {
		stats.Processes = processes[:20]
	} else {
		stats.Processes = processes
	}

	return stats, nil
}
