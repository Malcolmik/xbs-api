import loggerInstance from '../config/logger';

/**
 * Logger utility export
 * Provides consistent logging interface throughout the application
 */

export const logger = loggerInstance;

// Export type for use in other modules
export type Logger = typeof loggerInstance;
