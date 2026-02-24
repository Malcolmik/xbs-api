/**
 * Custom Error Classes
 * Provides structured error handling throughout the application
 */

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', code: string = 'AUTHENTICATION_ERROR') {
    super(message, 401, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', code: string = 'AUTHORIZATION_ERROR') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: string = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', code: string = 'RATE_LIMIT_EXCEEDED') {
    super(message, 429, code);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', code: string = 'DATABASE_ERROR') {
    super(message, 500, code);
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message: string = 'External service error',
    code: string = 'EXTERNAL_SERVICE_ERROR'
  ) {
    super(message, 502, code);
  }
}
