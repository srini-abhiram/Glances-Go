package main

import (
    "github.com/shirou/gopsutil/v3/cpu"
    "github.com/shirou/gopsutil/v3/mem"
    "time"
)

type SystemStats struct {
    CPUUsage       float64 `json:"cpu_usage"`
    MemTotal       uint64  `json:"mem_total"`
    MemUsed        uint64  `json:"mem_used"`
    MemUsedPercent float64 `json:"mem_used_percent"`
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

    return stats, nil
}