/**
 * Logger Utility for Investigation Platform
 * Provides structured logging with levels and formatting
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  duration?: number;
}

class Logger {
  private isDevelopment: boolean;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = error instanceof Error 
      ? { error: error.message, stack: error.stack, ...context }
      : { error, ...context };
    this.log('error', message, errorContext);
  }

  time(label: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info(`${label} completed`, { duration: `${duration}ms` });
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const formattedMessage = context 
      ? `${prefix} ${message} ${JSON.stringify(context)}`
      : `${prefix} ${message}`;

    switch (level) {
      case 'debug':
        if (this.isDevelopment) console.debug(formattedMessage);
        break;
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Create singleton instance
const loggerInstance = new Logger();

// Export as `logger` (class instance)
export const logger = loggerInstance;

// Export as `log` (convenience object with same methods)
export const log = {
  debug: (message: string, context?: Record<string, unknown>) => loggerInstance.debug(message, context),
  info: (message: string, context?: Record<string, unknown>) => loggerInstance.info(message, context),
  warn: (message: string, context?: Record<string, unknown>) => loggerInstance.warn(message, context),
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) => loggerInstance.error(message, error, context),
  time: (label: string) => loggerInstance.time(label),
};

// Default export
export default loggerInstance;
