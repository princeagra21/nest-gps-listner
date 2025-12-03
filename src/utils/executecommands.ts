import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Logger } from '@nestjs/common';

const execAsync = promisify(exec);

/**
 * Command execution result interface
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: Error;
}

/**
 * Command execution options
 */
export interface ExecuteCommandOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables */
  env?: NodeJS.ProcessEnv;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum buffer size for stdout/stderr */
  maxBuffer?: number;
  /** Whether to run command in shell */
  shell?: boolean;
}

/**
 * Enterprise-level command execution utility
 */
export class CommandExecutor {
  private static readonly logger = new Logger(CommandExecutor.name);
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_MAX_BUFFER = 1024 * 1024; // 1MB

  /**
   * Executes a command and returns the result
   * @param {string} command - The command to execute
   * @param {ExecuteCommandOptions} options - Execution options
   * @returns {Promise<CommandResult>} Command execution result
   */
  public static async execute(
    command: string,
    options: ExecuteCommandOptions = {},
  ): Promise<CommandResult> {
    const executionId = this.generateExecutionId();
    const {
      cwd = process.cwd(),
      env = process.env,
      timeout = this.DEFAULT_TIMEOUT,
      maxBuffer = this.DEFAULT_MAX_BUFFER,
      shell = true,
    } = options;

    this.logger.log(
      `[${executionId}] Executing command: ${this.sanitizeCommand(command)}`,
    );
    this.logger.debug(
      `[${executionId}] Options: ${JSON.stringify({ cwd, timeout, maxBuffer })}`,
    );

    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        env,
        timeout,
        maxBuffer,
      });

      const executionTime = Date.now() - startTime;

      this.logger.log(
        `[${executionId}] Command executed successfully in ${executionTime}ms`,
      );

      if (stderr && stderr.trim()) {
        this.logger.warn(`[${executionId}] stderr: ${stderr.trim()}`);
      }

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error(
        `[${executionId}] Command failed after ${executionTime}ms: ${error.message}`,
      );

      if (error.code) {
        this.logger.error(`[${executionId}] Exit code: ${error.code}`);
      }

      return {
        success: false,
        stdout: error.stdout ? error.stdout.trim() : '',
        stderr: error.stderr ? error.stderr.trim() : error.message,
        exitCode: error.code || null,
        error: error as Error,
      };
    }
  }

  /**
   * Executes a command silently (suppresses logging)
   * @param {string} command - The command to execute
   * @param {ExecuteCommandOptions} options - Execution options
   * @returns {Promise<CommandResult>} Command execution result
   */
  public static async executeSilent(
    command: string,
    options: ExecuteCommandOptions = {},
  ): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        timeout: options.timeout || this.DEFAULT_TIMEOUT,
        maxBuffer: options.maxBuffer || this.DEFAULT_MAX_BUFFER,
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout ? error.stdout.trim() : '',
        stderr: error.stderr ? error.stderr.trim() : error.message,
        exitCode: error.code || null,
        error: error as Error,
      };
    }
  }

  /**
   * Executes a command in the background (fire and forget)
   * @param {string} command - The command to execute
   * @param {ExecuteCommandOptions} options - Execution options
   * @returns {void}
   */
  public static executeBackground(
    command: string,
    options: ExecuteCommandOptions = {},
  ): void {
    const executionId = this.generateExecutionId();

    this.logger.log(
      `[${executionId}] Executing command in background: ${this.sanitizeCommand(command)}`,
    );

    // Parse command and arguments for spawn
    const [cmd, ...args] = this.parseCommand(command);

    const child = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: options.shell !== false,
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    this.logger.log(
      `[${executionId}] Background process started with PID: ${child.pid}`,
    );
  }

  /**
   * Checks if a command is available in the system
   * @param {string} command - The command to check
   * @returns {Promise<boolean>} True if command exists, false otherwise
   */
  public static async commandExists(command: string): Promise<boolean> {
    const checkCommand =
      process.platform === 'win32'
        ? `where ${command}`
        : `command -v ${command}`;

    try {
      const result = await this.executeSilent(checkCommand);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Generates a unique execution ID for tracking
   * @private
   * @returns {string} Unique execution ID
   */
  private static generateExecutionId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitizes command for logging (removes sensitive data if needed)
   * @private
   * @param {string} command - The command to sanitize
   * @returns {string} Sanitized command
   */
  private static sanitizeCommand(command: string): string {
    // Add any sensitive data removal logic here if needed
    return command.length > 200 ? `${command.substring(0, 200)}...` : command;
  }

  /**
   * Parses a command string into command and arguments
   * @private
   * @param {string} command - The command string
   * @returns {string[]} Array with command and arguments
   */
  private static parseCommand(command: string): string[] {
    // Simple parsing - can be enhanced for more complex cases
    return command.split(' ').filter((part) => part.length > 0);
  }
}
