package main

import (
	"sort"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

// Process holds information about a single running process
type Process struct {
	Pid      int32   `json:"pid"`
	Name     string  `json:"name"`
	Username string  `json:"username"`
	CPU      float64 `json:"cpu"`
	Memory   float32 `json:"memory"`
	VIRT     uint64  `json:"virt"`
	RES      uint64  `json:"res"`
	Threads  int32   `json:"threads"`
	Status   string  `json:"status"`
	Cmdline  string  `json:"cmdline"`
	Nice     int32   `json:"nice"`
	CPUTime  float64 `json:"cpu_time"`
}

// CpuInfo holds information about the CPU the application is hosted on
type CpuInfo struct {
	CpuModelName string `json:"model"`
	MaxFrequency int32  `json:"maxFrequency"`
	Cores        int32  `json:"cores"`
}

// SystemStats is the main structure for all system metrics
type SystemStats struct {
	CPUUsage        float64   `json:"cpu_usage"`
	CPUPerCoreUsage []float64 `json:"cpu_per_core_usage"`
	MemTotal        uint64    `json:"mem_total"`
	MemUsed         uint64    `json:"mem_used"`
	MemUsedPercent  float64   `json:"mem_used_percent"`
	Processes       []Process `json:"processes"`
	CPUInfo         []CpuInfo `json:"cpu_info"`
}

var (
	statsCache SystemStats
	cacheMutex sync.Mutex
	cacheTime  time.Time
)

func collectStats() (SystemStats, error) {
	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	if time.Since(cacheTime) < 2*time.Second {
		return statsCache, nil
	}

	var stats SystemStats
	var coreCount int

	coreCount, err := cpu.Counts(true)
	if err != nil {
		return stats, err
	}

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
		cpuInfoList = append(cpuInfoList, CpuInfo{
			CpuModelName: cpu.ModelName,
			MaxFrequency: int32(cpu.Mhz),
			Cores:        int32(coreCount),
		})
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

	var wg sync.WaitGroup
	processChan := make(chan Process, len(pids))

	for _, pid := range pids {
		wg.Add(1)
		go func(pid int32) {
			defer wg.Done()
			p, err := process.NewProcess(pid)
			if err != nil {
				return // Skip processes that might have terminated
			}
			name, _ := p.Name()
			username, _ := p.Username()
			cpu, _ := p.CPUPercent()
			mem, _ := p.MemoryPercent()
			var virt, res uint64
			memInfo, err := p.MemoryInfo()
			if err == nil {
				virt = memInfo.VMS
				res = memInfo.RSS
			}
			threads, _ := p.NumThreads()
			status, _ := p.Status()
			cmdline, _ := p.Cmdline()
			nice, _ := p.Nice()
			var cpuTime float64
			cpuTimes, err := p.Times()
			if err == nil {
				cpuTime = cpuTimes.User + cpuTimes.System
			}

			processChan <- Process{
				Pid:      pid,
				Name:     name,
				Username: username,
				CPU:      cpu,
				Memory:   mem,
				VIRT:     virt,
				RES:      res,
				Threads:  threads,
				Status:   status[0],
				Cmdline:  cmdline,
				Nice:     nice,
				CPUTime:  cpuTime,
			}
		}(pid)
	}

	wg.Wait()
	close(processChan)

	var processes []Process
	for p := range processChan {
		processes = append(processes, p)
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

	statsCache = stats
	cacheTime = time.Now()

	return stats, nil
}
