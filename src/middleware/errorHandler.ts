
import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

export const handleDatabaseErrors = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error.code) {
    switch (error.code) {
      case 'P2002': 
        res.status(409).json({
          error: 'Conflict',
          message: 'A contact with this information already exists',
          timestamp: new Date().toISOString()
        });
        return;
        
      case 'P2025': 
        res.status(404).json({
          error: 'Not Found',
          message: 'The requested contact was not found',
          timestamp: new Date().toISOString()
        });
        return;
        
      case 'P2003':
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid reference to related data',
          timestamp: new Date().toISOString()
        });
        return;
        
      case 'P1008': 
        res.status(408).json({
          error: 'Request Timeout',
          message: 'Database operation timed out',
          timestamp: new Date().toISOString()
        });
        return;
        
      default:
        
        console.error('Unknown database error:', error);
    }
  }
  
  next(error);
};

export const globalErrorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  console.error('Global error handler caught:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: getErrorName(error.statusCode),
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString()
    });
    return;
  }

  
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Request validation failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
    return;
  }

  
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
      timestamp: new Date().toISOString()
    });
    return;
  }

    
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: getErrorName(statusCode),
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error
    })
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /identify'
    ]
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

function getErrorName(statusCode: number): string {
  const errorNames: { [key: number]: string } = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return errorNames[statusCode] || 'Unknown Error';
}

export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: `Request timed out after ${timeoutMs}ms`,
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};