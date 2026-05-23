import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class SystemInfoService {
  /**
   * Get CPU information
   */
  getCpuInfo() {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown';
    const cpuCount = cpus.length;
    const cpuSpeed = cpus[0]?.speed || 0;

    // Calculate CPU usage (average over 1 second)
    const cpuUsage = this.calculateCpuUsage();

    return {
      model: cpuModel,
      cores: cpuCount,
      speed: `${(cpuSpeed / 1000).toFixed(2)} GHz`,
      usage: cpuUsage,
    };
  }

  /**
   * Get RAM information
   */
  getRamInfo() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercent = (usedMemory / totalMemory) * 100;

    return {
      total: this.formatBytes(totalMemory),
      used: this.formatBytes(usedMemory),
      free: this.formatBytes(freeMemory),
      usagePercent: usagePercent.toFixed(2),
      totalBytes: totalMemory,
      usedBytes: usedMemory,
      freeBytes: freeMemory,
    };
  }

  /**
   * Get storage information
   */
  async getStorageInfo() {
    try {
      const platform = os.platform();
      let storageInfo;

      if (platform === 'win32') {
        // Windows
        storageInfo = await this.getWindowsStorageInfo();
      } else {
        // Linux/Unix
        storageInfo = await this.getUnixStorageInfo();
      }

      return storageInfo;
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        total: 'Unknown',
        used: 'Unknown',
        free: 'Unknown',
        usagePercent: '0',
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        error: 'Unable to retrieve storage information',
      };
    }
  }

  /**
   * Get Windows storage info
   */
  private async getWindowsStorageInfo() {
    try {
      // Get the root drive (usually C:)
      // Using PowerShell for better compatibility
      const { stdout } = await execAsync(
        'powershell -Command "Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DeviceID -eq \'C:\'} | Select-Object Size,FreeSpace,DeviceID | Format-List"'
      );
      
      const sizeMatch = stdout.match(/Size\s*:\s*(\d+)/);
      const freeSpaceMatch = stdout.match(/FreeSpace\s*:\s*(\d+)/);
      const deviceMatch = stdout.match(/DeviceID\s*:\s*([^\r\n]+)/);

      if (sizeMatch && freeSpaceMatch) {
        const totalSize = parseInt(sizeMatch[1]) || 0;
        const freeSpace = parseInt(freeSpaceMatch[1]) || 0;
        const usedSpace = totalSize - freeSpace;
        const usagePercent = totalSize > 0 ? (usedSpace / totalSize) * 100 : 0;
        const drive = deviceMatch ? deviceMatch[1].trim() : 'C:';

        return {
          total: this.formatBytes(totalSize),
          used: this.formatBytes(usedSpace),
          free: this.formatBytes(freeSpace),
          usagePercent: usagePercent.toFixed(2),
          totalBytes: totalSize,
          usedBytes: usedSpace,
          freeBytes: freeSpace,
          drive: drive,
        };
      }

      // Fallback to wmic if PowerShell fails
      const { stdout: wmicOutput } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:list');
      const wmicSizeMatch = wmicOutput.match(/Size=(\d+)/);
      const wmicFreeMatch = wmicOutput.match(/FreeSpace=(\d+)/);

      if (wmicSizeMatch && wmicFreeMatch) {
        const totalSize = parseInt(wmicSizeMatch[1]) || 0;
        const freeSpace = parseInt(wmicFreeMatch[1]) || 0;
        const usedSpace = totalSize - freeSpace;
        const usagePercent = totalSize > 0 ? (usedSpace / totalSize) * 100 : 0;

        return {
          total: this.formatBytes(totalSize),
          used: this.formatBytes(usedSpace),
          free: this.formatBytes(freeSpace),
          usagePercent: usagePercent.toFixed(2),
          totalBytes: totalSize,
          usedBytes: usedSpace,
          freeBytes: freeSpace,
          drive: 'C:',
        };
      }
    } catch (error) {
      console.error('Error getting Windows storage:', error);
    }

    return this.getFallbackStorageInfo();
  }

  /**
   * Get Unix/Linux storage info
   */
  private async getUnixStorageInfo() {
    try {
      const { stdout } = await execAsync('df -h /');
      const lines = stdout.split('\n');
      
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 4) {
          const total = this.parseSize(parts[1]);
          const used = this.parseSize(parts[2]);
          const free = this.parseSize(parts[3]);
          const usagePercent = parseFloat(parts[4].replace('%', ''));

          return {
            total: parts[1],
            used: parts[2],
            free: parts[3],
            usagePercent: usagePercent.toFixed(2),
            totalBytes: total,
            usedBytes: used,
            freeBytes: free,
            mountPoint: '/',
          };
        }
      }
    } catch (error) {
      console.error('Error getting Unix storage:', error);
    }

    return this.getFallbackStorageInfo();
  }

  /**
   * Fallback storage info when system commands fail
   */
  private getFallbackStorageInfo() {
    return {
      total: 'Unknown',
      used: 'Unknown',
      free: 'Unknown',
      usagePercent: '0',
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      note: 'Storage information could not be retrieved. Please check server permissions.',
    };
  }

  /**
   * Parse size string (e.g., "100G", "50M") to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      K: 1024,
      M: 1024 * 1024,
      G: 1024 * 1024 * 1024,
      T: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^([\d.]+)([KMGT])?$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2]?.toUpperCase() || '';
    const multiplier = units[unit] || 1;

    return value * multiplier;
  }

  /**
   * Calculate CPU usage percentage
   * Note: This is an approximation. For more accurate real-time CPU usage,
   * you would need to sample CPU times over an interval.
   */
  private calculateCpuUsage(): string {
    const cpus = os.cpus();
    if (cpus.length === 0) return '0.00';

    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      const times = cpu.times;
      totalIdle += times.idle;
      totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
    });

    // This gives a snapshot, not real-time usage
    // For real-time usage, you'd need to measure over time
    // For now, we'll return a conservative estimate or use load average
    const loadAvg = os.loadavg();
    const cpuCount = cpus.length;
    
    // Use load average as a proxy for CPU usage (load average / CPU count * 100)
    // Cap at 100%
    const usageFromLoad = Math.min((loadAvg[0] / cpuCount) * 100, 100);
    
    return usageFromLoad.toFixed(2);
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get all system information
   */
  async getSystemInfo() {
    const [cpu, ram, storage] = await Promise.all([
      Promise.resolve(this.getCpuInfo()),
      Promise.resolve(this.getRamInfo()),
      this.getStorageInfo(),
    ]);

    return {
      cpu,
      ram,
      storage,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: this.formatUptime(os.uptime()),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format uptime in seconds to human-readable format
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

