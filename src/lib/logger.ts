/**
 * Logger Utility
 * 
 * A comprehensive logging system for debugging and monitoring.
 * Supports multiple log levels, timestamps, and structured output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
  error?: Error;
}

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  includeTimestamp: boolean;
  includeData: boolean;
  colorize: boolean;
  persistToStorage: boolean;
  maxStoredLogs: number;
}

// Default configuration
const defaultConfig: LoggerConfig = {
  enabled: true,
  minLevel: 'debug',
  includeTimestamp: true,
  includeData: true,
  colorize: true,
  persistToStorage: false,
  maxStoredLogs: 1000,
};

// In-memory log storage
const logStorage: LogEntry[] = [];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const levelColors: Record<LogLevel, string> = {
  trace: colors.dim + colors.white,
  debug: colors.cyan,
  info: colors.green,
  warn: colors.yellow,
  error: colors.red,
};

const levelPriority: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

class Logger {
  private module: string;
  private config: LoggerConfig;

  constructor(module: string, config: Partial<LoggerConfig> = {}) {
    this.module = module;
    this.config = { ...defaultConfig, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return levelPriority[level] >= levelPriority[this.config.minLevel];
  }

  private formatMessage(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    const levelStr = entry.level.toUpperCase().padEnd(5);
    if (this.config.colorize) {
      parts.push(`${levelColors[entry.level]}${levelStr}${colors.reset}`);
    } else {
      parts.push(`[${levelStr}]`);
    }

    parts.push(`[${entry.module}]`);

    if (entry.duration !== undefined) {
      parts.push(`(${entry.duration}ms)`);
    }

    parts.push(entry.message);

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, duration?: number, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      data,
      duration,
      error,
    };

    // Store in memory
    if (this.config.persistToStorage) {
      logStorage.push(entry);
      if (logStorage.length > this.config.maxStoredLogs) {
        logStorage.shift();
      }
    }

    // Console output
    const formattedMessage = this.formatMessage(entry);

    switch (level) {
      case 'trace':
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }

    // Log additional data
    if (data && this.config.includeData) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }

    // Log error stack
    if (error) {
      console.error('  Error:', error.message);
      if (error.stack) {
        console.error('  Stack:', error.stack);
      }
    }
  }

  trace(message: string, data?: Record<string, unknown>) {
    this.log('trace', message, data);
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>) {
    const err = error instanceof Error ? error : undefined;
    this.log('error', message, data, undefined, err);
  }

  /**
   * Time a function execution
   */
  time<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = Date.now();
    this.debug(`${label} - started`);

    try {
      const result = fn();

      // Handle both sync and async
      if (result instanceof Promise) {
        return result
          .then((res) => {
            const duration = Date.now() - start;
            this.debug(`${label} - completed`, { duration });
            return res;
          })
          .catch((err) => {
            const duration = Date.now() - start;
            this.error(`${label} - failed`, err, { duration });
            throw err;
          });
      }

      const duration = Date.now() - start;
      this.debug(`${label} - completed`, { duration });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.error(`${label} - failed`, err, { duration });
      throw err;
    }
  }

  /**
   * Create a child logger with a nested module name
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, this.config);
  }

  /**
   * Log an API request
   */
  apiRequest(method: string, url: string, params?: Record<string, unknown>) {
    this.debug(`API Request: ${method} ${url}`, params);
  }

  /**
   * Log an API response
   */
  apiResponse(method: string, url: string, status: number, duration: number, data?: unknown) {
    this.debug(`API Response: ${method} ${url}`, {
      status,
      duration: `${duration}ms`,
      dataSize: data ? JSON.stringify(data).length : 0,
    });
  }

  /**
   * Log an API error
   */
  apiError(method: string, url: string, error: unknown, duration: number) {
    this.error(`API Error: ${method} ${url}`, error, { duration: `${duration}ms` });
  }

  /**
   * Log AI operation
   */
  aiOperation(operation: string, input?: unknown, output?: unknown, duration?: number) {
    this.info(`AI: ${operation}`, {
      inputType: typeof input,
      outputType: typeof output,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  /**
   * Log search operation
   */
  searchOperation(query: string, tablesSearched: number, resultsFound: number, duration: number) {
    this.info(`Search completed`, {
      query: query.slice(0, 50),
      tablesSearched,
      resultsFound,
      duration: `${duration}ms`,
    });
  }
}

/**
 * Create a logger instance for a module
 */
export function createLogger(module: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(module, config);
}

/**
 * Get all stored logs
 */
export function getStoredLogs(): LogEntry[] {
  return [...logStorage];
}

/**
 * Clear stored logs
 */
export function clearStoredLogs(): void {
  logStorage.length = 0;
}

/**
 * Configure global logger defaults
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  Object.assign(defaultConfig, config);
}

// Pre-created loggers for common modules
export const apiLogger = createLogger('API');
export const aiLogger = createLogger('AI');
export const searchLogger = createLogger('Search');
export const dbLogger = createLogger('DB');
export const appLogger = createLogger('App');

export default Logger;
