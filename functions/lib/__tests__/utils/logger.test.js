"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('logger utility', () => {
    let consoleLogSpy;
    let consoleWarnSpy;
    let consoleErrorSpy;
    let consoleDebugSpy;
    let originalEnv;
    (0, globals_1.beforeEach)(() => {
        // Save original env
        originalEnv = { ...process.env };
        // Set NODE_ENV to simulate production environment
        process.env.NODE_ENV = 'production';
        // Spy on console methods
        consoleLogSpy = globals_1.jest.spyOn(console, 'log').mockImplementation();
        consoleWarnSpy = globals_1.jest.spyOn(console, 'warn').mockImplementation();
        consoleErrorSpy = globals_1.jest.spyOn(console, 'error').mockImplementation();
        consoleDebugSpy = globals_1.jest.spyOn(console, 'debug').mockImplementation();
    });
    (0, globals_1.afterEach)(() => {
        // Restore env
        process.env = originalEnv;
        // Restore console methods
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleDebugSpy.mockRestore();
    });
    (0, globals_1.describe)('info', () => {
        (0, globals_1.it)('should log info messages with severity INFO', () => {
            const { logger } = require('../../utils/logger');
            logger.info('Test info message');
            (0, globals_1.expect)(consoleLogSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('INFO');
            (0, globals_1.expect)(loggedData.message).toBe('Test info message');
            (0, globals_1.expect)(loggedData.timestamp).toBeDefined();
        });
        (0, globals_1.it)('should include metadata in info logs', () => {
            const { logger } = require('../../utils/logger');
            logger.info('Test with metadata', { userId: '123', action: 'login' });
            const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.userId).toBe('123');
            (0, globals_1.expect)(loggedData.action).toBe('login');
        });
    });
    (0, globals_1.describe)('warn', () => {
        (0, globals_1.it)('should log warning messages with severity WARNING', () => {
            const { logger } = require('../../utils/logger');
            logger.warn('Test warning');
            (0, globals_1.expect)(consoleWarnSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('WARNING');
            (0, globals_1.expect)(loggedData.message).toBe('Test warning');
        });
        (0, globals_1.it)('should include metadata in warning logs', () => {
            const { logger } = require('../../utils/logger');
            logger.warn('Rate limit warning', { ip: '192.168.1.1', attempts: 5 });
            const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.ip).toBe('192.168.1.1');
            (0, globals_1.expect)(loggedData.attempts).toBe(5);
        });
    });
    (0, globals_1.describe)('error', () => {
        (0, globals_1.it)('should log error messages with Error object', () => {
            const { logger } = require('../../utils/logger');
            const testError = new Error('Test error');
            logger.error('Error occurred', testError, { pageId: 'page123' });
            // Check console.error was called
            (0, globals_1.expect)(consoleErrorSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('ERROR');
            (0, globals_1.expect)(loggedData.message).toBe('Error occurred');
            (0, globals_1.expect)(loggedData.error.message).toBe('Test error');
            (0, globals_1.expect)(loggedData.error.stack).toBeDefined();
            (0, globals_1.expect)(loggedData.error.name).toBe('Error');
            (0, globals_1.expect)(loggedData.pageId).toBe('page123');
        });
        (0, globals_1.it)('should log error with null error parameter', () => {
            const { logger } = require('../../utils/logger');
            logger.error('Error without error object', null, { info: 'test' });
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('ERROR');
            (0, globals_1.expect)(loggedData.message).toBe('Error without error object');
            (0, globals_1.expect)(loggedData.error).toBeUndefined();
            (0, globals_1.expect)(loggedData.errorDetails).toBeUndefined();
        });
        (0, globals_1.it)('should log error with non-Error object (else if branch)', () => {
            const { logger } = require('../../utils/logger');
            const nonErrorObject = { code: 500, details: 'Server error' };
            logger.error('Error with object', nonErrorObject, { pageId: 'page456' });
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('ERROR');
            (0, globals_1.expect)(loggedData.errorDetails).toEqual(nonErrorObject);
        });
        (0, globals_1.it)('should use userId as user identifier if provided', () => {
            const { logger } = require('../../utils/logger');
            const testError = new Error('Test');
            logger.error('Error', testError, { userId: 'user789' });
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.userId).toBe('user789');
        });
        (0, globals_1.it)('should include metadata in error logs', () => {
            const { logger } = require('../../utils/logger');
            const testError = new Error('Test');
            logger.error('Error', testError, { userId: 'user1', pageId: 'page1' });
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.userId).toBe('user1');
            (0, globals_1.expect)(loggedData.pageId).toBe('page1');
        });
    });
    (0, globals_1.describe)('critical', () => {
        (0, globals_1.it)('should log critical errors with CRITICAL severity', () => {
            const { logger } = require('../../utils/logger');
            const criticalError = new Error('Critical failure');
            logger.critical('Critical error occurred', criticalError, { pageId: 'page999' });
            // Check console.error was called
            (0, globals_1.expect)(consoleErrorSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('CRITICAL');
            (0, globals_1.expect)(loggedData.message).toBe('Critical error occurred');
            (0, globals_1.expect)(loggedData.error.message).toBe('Critical failure');
            (0, globals_1.expect)(loggedData.pageId).toBe('page999');
        });
        (0, globals_1.it)('should use userId in critical error logging', () => {
            const { logger } = require('../../utils/logger');
            const error = new Error('Critical');
            logger.critical('Critical', error, { userId: 'admin123' });
            (0, globals_1.expect)(consoleErrorSpy).toHaveBeenCalled();
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.userId).toBe('admin123');
        });
        (0, globals_1.it)('should include metadata in critical error logs', () => {
            const { logger } = require('../../utils/logger');
            const error = new Error('Critical');
            logger.critical('Critical', error, { userId: 'admin1', pageId: 'page1' });
            (0, globals_1.expect)(consoleErrorSpy).toHaveBeenCalled();
            const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.userId).toBe('admin1');
            (0, globals_1.expect)(loggedData.pageId).toBe('page1');
        });
    });
    (0, globals_1.describe)('debug', () => {
        (0, globals_1.it)('should log debug messages when NODE_ENV is not production', () => {
            // Ensure NODE_ENV is not production
            process.env.NODE_ENV = 'development';
            // Re-import logger to pick up new env
            globals_1.jest.resetModules();
            const { logger } = require('../../utils/logger');
            logger.debug('Debug message', { test: 'data' });
            (0, globals_1.expect)(consoleDebugSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('DEBUG');
            (0, globals_1.expect)(loggedData.message).toBe('Debug message');
            (0, globals_1.expect)(loggedData.test).toBe('data');
        });
        (0, globals_1.it)('should log debug messages when NODE_ENV is undefined', () => {
            delete process.env.NODE_ENV;
            globals_1.jest.resetModules();
            const { logger } = require('../../utils/logger');
            logger.debug('Emulator debug');
            (0, globals_1.expect)(consoleDebugSpy).toHaveBeenCalledTimes(1);
            const loggedData = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
            (0, globals_1.expect)(loggedData.severity).toBe('DEBUG');
        });
        (0, globals_1.it)('should NOT log debug messages in production (NODE_ENV=production)', () => {
            process.env.NODE_ENV = 'production';
            globals_1.jest.resetModules();
            const { logger } = require('../../utils/logger');
            logger.debug('Should not appear');
            (0, globals_1.expect)(consoleDebugSpy).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=logger.test.js.map