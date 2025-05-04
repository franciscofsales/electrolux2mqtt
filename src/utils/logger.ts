/**
 * A simple logger utility that writes to console with timestamps
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;
  
  constructor(level: LogLevel = 'info') {
    this.level = level;
  }
  
  private getTimestamp(): string {
    return new Date().toISOString();
  }
  
  private log(level: LogLevel, message: string, data?: any): void {
    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    if (levels[level] >= levels[this.level]) {
      const timestamp = this.getTimestamp();
      
      // Better error handling for data objects
      let dataStr = '';
      if (data) {
        if (data instanceof Error) {
          dataStr = ` Error: ${data.message}`;
          if (data.stack) {
            dataStr += `\nStack: ${data.stack}`;
          }
        } else if (typeof data === 'object') {
          try {
            dataStr = ` ${JSON.stringify(data)}`;
          } catch (e) {
            dataStr = ` [Object that couldn't be stringified]`;
          }
        } else {
          dataStr = ` ${data}`;
        }
      }
      
      console.log(`[${timestamp}] ${level.toUpperCase()}:${dataStr} ${message}`);
    }
  }
  
  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }
  
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }
  
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }
  
  error(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

const logger = new Logger(process.env.LOG_LEVEL as LogLevel || 'info');

export default logger;