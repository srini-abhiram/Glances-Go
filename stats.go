package main

import (
	"sort"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

// Process holds information about a single running process
type Process struct {
	Pid    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float32 `json:"memory"`
}

// CpuInfo holds information about the CPU the application is hosted on
type CpuInfo struct {
	CpuModelName string `json:"model"`
	MaxFrequency int32  `json:"maxFrequency"`
	Cores        int32  `json:"cores"`
}

// SystemStats is the main structure for all system metrics
type SystemStats struct {
	CPUUsage       float64   `json:"cpu_usage"`
	MemTotal       uint64    `json:"mem_total"`
	MemUsed        uint64    `json:"mem_used"`
	MemUsedPercent float64   `json:"mem_used_percent"`
	Processes      []Process `json:"processes"`
	CPUInfo        []CpuInfo `json:"cpu_info"`
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

	// CPU Info
	cpuInfoArr, err := cpu.Info()
	if err != nil {
		return stats, err
	}
	var cpuInfoList []CpuInfo
	for _, cpu := range cpuInfoArr {
		cpuInfo := CpuInfo{
			CpuModelName: cpu.ModelName,
			MaxFrequency: int32(cpu.Mhz),
			Cores:        int32(cpu.Cores),
		}
		cpuInfoList = append(cpuInfoList, cpuInfo)
	}

	stats.CPUInfo = cpuInfoList

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
			Pid:    pid,
			Name:   name,
			CPU:    cpu,
			Memory: mem,
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
