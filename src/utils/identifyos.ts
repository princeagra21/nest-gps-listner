import { platform } from 'os';
import { Logger } from '@nestjs/common';

/**
 * Supported operating system types
 */
export enum OperatingSystem {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
  UNKNOWN = 'unknown',
}

/**
 * OS Information interface
 */
export interface OSInfo {
  type: OperatingSystem;
  platform: string;
  isWindows: boolean;
  isLinux: boolean;
  isMacOS: boolean;
}

/**
 * Utility class for operating system identification
 */
export class OSIdentifier {
  private static readonly logger = new Logger(OSIdentifier.name);
  private static cachedOSInfo: OSInfo | null = null;

  /**
   * Identifies and returns the current operating system information
   * @returns {OSInfo} Operating system information
   */
  public static identify(): OSInfo {
    if (this.cachedOSInfo) {
      return this.cachedOSInfo;
    }

    const platformName = platform();
    let osType: OperatingSystem;

    switch (platformName) {
      case 'win32':
        osType = OperatingSystem.WINDOWS;
        break;
      case 'linux':
        osType = OperatingSystem.LINUX;
        break;
      case 'darwin':
        osType = OperatingSystem.MACOS;
        break;
      default:
        osType = OperatingSystem.UNKNOWN;
        this.logger.warn(`Unknown operating system detected: ${platformName}`);
    }

    this.cachedOSInfo = {
      type: osType,
      platform: platformName,
      isWindows: osType === OperatingSystem.WINDOWS,
      isLinux: osType === OperatingSystem.LINUX,
      isMacOS: osType === OperatingSystem.MACOS,
    };

    this.logger.log(
      `Operating System identified: ${osType} (platform: ${platformName})`,
    );

    return this.cachedOSInfo;
  }

  /**
   * Gets the operating system type
   * @returns {OperatingSystem} The operating system type
   */
  public static getOSType(): OperatingSystem {
    return this.identify().type;
  }

  /**
   * Checks if the current OS is Windows
   * @returns {boolean} True if Windows, false otherwise
   */
  public static isWindows(): boolean {
    return this.identify().isWindows;
  }

  /**
   * Checks if the current OS is Linux
   * @returns {boolean} True if Linux, false otherwise
   */
  public static isLinux(): boolean {
    return this.identify().isLinux;
  }

  /**
   * Checks if the current OS is macOS
   * @returns {boolean} True if macOS, false otherwise
   */
  public static isMacOS(): boolean {
    return this.identify().isMacOS;
  }

  /**
   * Resets the cached OS information (useful for testing)
   */
  public static resetCache(): void {
    this.cachedOSInfo = null;
  }
}
