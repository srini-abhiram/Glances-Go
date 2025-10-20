package main

import (
	"runtime"
	"sort"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
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

// NetworkInterface holds information about a single network interface
type NetworkInterface struct {
	Name    string  `json:"name"`
	Rx      uint64  `json:"rx"`
	Tx      uint64  `json:"tx"`
	RxSpeed float64 `json:"rx_speed"`
	TxSpeed float64 `json:"tx_speed"`
	RxUnit  string  `json:"rx_unit"`
	TxUnit  string  `json:"tx_unit"`
}

// FileSystemStat holds information about a single mounted file system
type FileSystemStat struct {
	Mountpoint string  `json:"mountpoint"`
	Used       uint64  `json:"used"`
	Total      uint64  `json:"total"`
	UsedPerc   float64 `json:"used_perc"`
}

type OSInfo struct {
	Name         string `json:"name"`
	Architecture string `json:"architecture"`
	Distro       string `json:"distro"`
}

// SystemStats is the main structure for all system metrics
type SystemStats struct {
	CPUUsage        float64            `json:"cpu_usage"`
	CPUPerCoreUsage []float64          `json:"cpu_per_core_usage"`
	MemTotal        uint64             `json:"mem_total"`
	MemUsed         uint64             `json:"mem_used"`
	MemUsedPercent  float64            `json:"mem_used_percent"`
	Processes       []Process          `json:"processes"`
	CPUInfo         []CpuInfo          `json:"cpu_info"`
	Network         []NetworkInterface `json:"network"`
	FileSystems     []FileSystemStat   `json:"filesystems"`
	OS              OSInfo             `json:"os"`
	Uptime          uint64             `json:"uptime"`
}

var (
	statsCache       SystemStats
	cacheMutex       sync.RWMutex
	cacheTime        time.Time
	lastNetStats     []net.IOCountersStat
	lastNetStatsTime time.Time
)

func collectStats(cacheTTL time.Duration, maxProcesses int) (SystemStats, error) {
	cacheMutex.RLock()
	if time.Since(cacheTime) < cacheTTL {
		defer cacheMutex.RUnlock()
		return statsCache, nil
	}
	cacheMutex.RUnlock()

	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	if time.Since(cacheTime) < cacheTTL {
		return statsCache, nil
	}

	var stats SystemStats
	var coreCount int

	coreCount, err := cpu.Counts(true)
	if err != nil {
		return stats, err
	}

	// CPU Usage
	perCorePercentages, err := cpu.Percent(time.Second, true)
	if err != nil {
		return stats, err
	}
	stats.CPUPerCoreUsage = perCorePercentages

	if len(perCorePercentages) > 0 {
		var sum float64
		for _, v := range perCorePercentages {
			sum += v
		}
		stats.CPUUsage = sum / float64(len(perCorePercentages))
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

	// OS and Uptime
	stats.OS.Name = runtime.GOOS
	stats.OS.Architecture = runtime.GOARCH
	platform, _, _, err := host.PlatformInformation()
	if err == nil {
		stats.OS.Distro = platform
	}
	uptime, err := host.Uptime()
	if err == nil {
		stats.Uptime = uptime
	}
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

	// Limit to top maxProcesses processes
	if len(processes) > maxProcesses {
		stats.Processes = processes[:maxProcesses]
	} else {
		stats.Processes = processes
	}

	// Network Stats
	netStats, err := net.IOCounters(true)
	if err == nil {
		currentTime := time.Now()
		duration := currentTime.Sub(lastNetStatsTime).Seconds()

		if lastNetStats != nil && duration > 0 {
			for _, current := range netStats {
				for _, last := range lastNetStats {
					if current.Name == last.Name {
						ni := NetworkInterface{
							Name:   current.Name,
							Rx:     current.BytesRecv,
							Tx:     current.BytesSent,
							RxUnit: "Kb",
							TxUnit: "Kb",
						}
						if current.BytesRecv > last.BytesRecv {
							ni.RxSpeed = float64(current.BytesRecv-last.BytesRecv) / duration / 1024
						}
						if current.BytesSent > last.BytesSent {
							ni.TxSpeed = float64(current.BytesSent-last.BytesSent) / duration / 1024
						}
						stats.Network = append(stats.Network, ni)
						break
					}
				}
			}
		}

		lastNetStats = netStats
		lastNetStatsTime = currentTime
	}

	// File System Stats
	partitions, err := disk.Partitions(true)
	if err == nil {
		for _, p := range partitions {
			usage, err := disk.Usage(p.Mountpoint)
			if err == nil {
				stats.FileSystems = append(stats.FileSystems, FileSystemStat{
					Mountpoint: usage.Path,
					Used:       usage.Used,
					Total:      usage.Total,
					UsedPerc:   usage.UsedPercent,
				})
			}
		}
	}

	statsCache = stats
	cacheTime = time.Now()

	return stats, nil
}
