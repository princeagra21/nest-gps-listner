import { Logger } from '@nestjs/common';
import { OSIdentifier, OperatingSystem } from './identifyos';
import { CommandExecutor } from './executecommands';

/**
 * Redis auto-start service for different operating systems
 * Provides enterprise-level Redis service management
 */
export class RedisStarter {
  private static readonly logger = new Logger(RedisStarter.name);
  private static readonly REDIS_INIT_DELAY = 8000; // 8 seconds - increased for Windows Redis initialization

  /**
   * Attempts to start Redis service based on the operating system
   * @returns {Promise<boolean>} True if Redis was started successfully
   */
  public static async start(): Promise<boolean> {
    const osInfo = OSIdentifier.identify();
    this.logger.log(`Detected OS: ${osInfo.type} (${osInfo.platform})`);

    try {
      if (osInfo.type === OperatingSystem.WINDOWS) {
        await this.startRedisOnWindows();
      } else if (osInfo.type === OperatingSystem.LINUX) {
        await this.startRedisOnLinux();
      } else if (osInfo.type === OperatingSystem.MACOS) {
        await this.startRedisOnMacOS();
      } else {
        this.logger.error(`Unsupported OS for Redis auto-start: ${osInfo.type}`);
        throw new Error(
          `Redis auto-start is not supported on ${osInfo.type}`,
        );
      }

      // Wait for Redis to fully initialize
      this.logger.log('Waiting for Redis to initialize...');
      await this.delay(this.REDIS_INIT_DELAY);

      // Verify Redis is actually responding
      this.logger.log('Verifying Redis connectivity...');
      const isRunning = await this.waitForRedis(15, 1000); // 15 retries, 1 second apart
      
      if (!isRunning) {
        this.logger.warn('Redis started but verification failed - proceeding anyway');
        // Don't throw error, let the application try to connect
      } else {
        this.logger.log('Redis is ready and accepting connections');
      }
      
      return true;
    } catch (error) {
      this.logger.error('Redis auto-start failed', error.message);
      throw error;
    }
  }

  /**
   * Wait for Redis to become available
   * @private
   */
  private static async waitForRedis(maxRetries: number, delayMs: number): Promise<boolean> {
    for (let i = 1; i <= maxRetries; i++) {
      this.logger.log(`Checking Redis connectivity (attempt ${i}/${maxRetries})...`);
      
      try {
        const isRunning = await this.isRedisRunning();
        if (isRunning) {
          this.logger.log(`Redis connectivity verified on attempt ${i}`);
          return true;
        }
      } catch (error) {
        this.logger.debug(`Redis check failed: ${error.message}`);
      }
      
      if (i < maxRetries) {
        this.logger.debug(`Waiting ${delayMs}ms before next retry...`);
        await this.delay(delayMs);
      }
    }
    this.logger.warn(`Redis did not become available after ${maxRetries} attempts`);
    return false;
  }

  /**
   * Start Redis on Windows - tries multiple methods
   * @private
   */
  private static async startRedisOnWindows(): Promise<void> {
    this.logger.log('Attempting to start Redis on Windows...');

    const startMethods = [
      {
        name: 'Windows Service (Redis)',
        check: 'sc query Redis',
        start: 'net start Redis',
      },
      {
        name: 'Windows Service (redis-server)',
        check: 'sc query redis-server',
        start: 'net start redis-server',
      },
      {
        name: 'Redis executable',
        check: 'where.exe redis-server',
        start: 'powershell -Command "Start-Process redis-server -WindowStyle Hidden"',
      },
      {
        name: 'WSL Redis',
        check: 'wsl which redis-server',
        start: 'wsl sudo service redis-server start',
      },
    ];

    for (const method of startMethods) {
      this.logger.log(`Trying method: ${method.name}...`);

      // Check if this method is available
      const checkResult = await CommandExecutor.executeSilent(method.check);

      if (checkResult.success) {
        this.logger.log(`${method.name} found, attempting to start...`);

        const startResult = await CommandExecutor.execute(method.start, {
          timeout: 10000,
        });

        // Check if command executed successfully
        if (startResult.success || startResult.exitCode === 0) {
          this.logger.log(`Started Redis using: ${method.name}`);
          
          // Wait for process to initialize
          await this.delay(3000);
          
          // Verify process is running
          const processCheck = await CommandExecutor.executeSilent(
            'powershell -Command "Get-Process redis-server -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id -First 1"'
          );
          
          if (processCheck.success && processCheck.stdout.trim().length > 0) {
            this.logger.log(`Redis process confirmed (PID: ${processCheck.stdout.trim()})`);
            return;
          }
        }
        
        // Check stderr for "already running" message
        if (startResult.stderr && 
            (startResult.stderr.toLowerCase().includes('already') ||
             startResult.stderr.toLowerCase().includes('running'))) {
          this.logger.log(`Redis already running (${method.name})`);
          return;
        }

        this.logger.warn(
          `Failed to start using ${method.name}: ${startResult.stderr || startResult.stdout || 'Unknown error'}`,
        );
      }
    }

    throw new Error(
      'Redis is not installed or could not be started on Windows. Please install Redis and try again.',
    );
  }

  /**
   * Start Redis on Linux - tries multiple methods
   * @private
   */
  private static async startRedisOnLinux(): Promise<void> {
    this.logger.log('Attempting to start Redis on Linux...');

    const startMethods = [
      {
        name: 'systemd (redis-server)',
        check: 'systemctl list-unit-files redis-server.service',
        start: 'sudo systemctl start redis-server',
      },
      {
        name: 'systemd (redis)',
        check: 'systemctl list-unit-files redis.service',
        start: 'sudo systemctl start redis',
      },
      {
        name: 'init.d service',
        check: 'service redis-server status',
        start: 'sudo service redis-server start',
      },
      {
        name: 'Redis executable',
        check: 'which redis-server',
        start: 'redis-server --daemonize yes',
      },
    ];

    for (const method of startMethods) {
      this.logger.log(`Trying method: ${method.name}...`);

      const checkResult = await CommandExecutor.executeSilent(method.check);

      if (checkResult.success) {
        this.logger.log(`${method.name} found, attempting to start...`);

        const startResult = await CommandExecutor.execute(method.start, {
          timeout: 10000,
        });

        if (
          startResult.success ||
          startResult.stdout.toLowerCase().includes('already') ||
          startResult.stderr.toLowerCase().includes('already')
        ) {
          this.logger.log(`Redis started successfully using: ${method.name}`);
          return;
        }

        this.logger.warn(
          `Failed to start using ${method.name}: ${startResult.stderr}`,
        );
      }
    }

    throw new Error(
      'Redis is not installed or could not be started on Linux. Please install Redis and try again.',
    );
  }

  /**
   * Start Redis on macOS - tries multiple methods
   * @private
   */
  private static async startRedisOnMacOS(): Promise<void> {
    this.logger.log('Attempting to start Redis on macOS...');

    const startMethods = [
      {
        name: 'Homebrew services',
        check: 'brew services list',
        start: 'brew services start redis',
      },
      {
        name: 'Redis executable',
        check: 'which redis-server',
        start: 'redis-server --daemonize yes',
      },
    ];

    for (const method of startMethods) {
      this.logger.log(`Trying method: ${method.name}...`);

      const checkResult = await CommandExecutor.executeSilent(method.check);

      if (checkResult.success) {
        this.logger.log(`${method.name} found, attempting to start...`);

        const startResult = await CommandExecutor.execute(method.start, {
          timeout: 10000,
        });

        if (
          startResult.success ||
          startResult.stdout.toLowerCase().includes('already') ||
          startResult.stderr.toLowerCase().includes('already')
        ) {
          this.logger.log(`Redis started successfully using: ${method.name}`);
          return;
        }

        this.logger.warn(
          `Failed to start using ${method.name}: ${startResult.stderr}`,
        );
      }
    }

    throw new Error(
      'Redis is not installed or could not be started on macOS. Please install Redis using Homebrew: brew install redis',
    );
  }

  /**
   * Utility method to introduce delay
   * @private
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if Redis is running on a specific host and port
   * @param {string} host - Redis host
   * @param {number} port - Redis port
   * @returns {Promise<boolean>} True if Redis is accessible
   */
  public static async isRedisRunning(
    host: string = 'localhost',
    port: number = 6379,
  ): Promise<boolean> {
    try {
      const Redis = require('ioredis');
      const testClient = new Redis({
        host,
        port,
        lazyConnect: true,
        retryStrategy: () => null, // Don't retry
        maxRetriesPerRequest: 1,
      });

      await testClient.connect();
      await testClient.quit();
      return true;
    } catch {
      return false;
    }
  }
}
