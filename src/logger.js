const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    // Use app's user data directory for logs
    const userDataPath = app ? app.getPath('userData') : process.cwd();
    this.logDir = path.join(userDataPath, 'logs');
    this.logFile = path.join(this.logDir, 'app.log');
    this.maxLogSize = 5 * 1024 * 1024; // 5MB
    this.maxLogFiles = 3;
    
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  rotateLogIfNeeded() {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.maxLogSize) {
        // Rotate logs
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
          const oldFile = `${this.logFile}.${i}`;
          const newFile = `${this.logFile}.${i + 1}`;
          
          if (fs.existsSync(oldFile)) {
            if (i === this.maxLogFiles - 1) {
              fs.unlinkSync(oldFile); // Delete oldest
            } else {
              fs.renameSync(oldFile, newFile);
            }
          }
        }
        
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error('Log rotation error:', error);
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logMessage += ` ${JSON.stringify(data)}`;
    }
    
    return logMessage + '\n';
  }

  write(level, message, data = null) {
    try {
      this.rotateLogIfNeeded();
      const logMessage = this.formatMessage(level, message, data);
      
      // Write to file
      fs.appendFileSync(this.logFile, logMessage);
      
      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(logMessage.trim());
      }
    } catch (error) {
      console.error('Logging error:', error);
    }
  }

  info(message, data = null) {
    this.write('info', message, data);
  }

  warn(message, data = null) {
    this.write('warn', message, data);
  }

  error(message, data = null) {
    this.write('error', message, data);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.write('debug', message, data);
    }
  }

  getLogPath() {
    return this.logFile;
  }
}

// Singleton instance
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

module.exports = { Logger, getLogger };
