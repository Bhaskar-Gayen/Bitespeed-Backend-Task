
import { Request, Response, NextFunction } from 'express';


export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'POST' && !req.is('application/json')) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Content-Type must be application/json',
      received: req.get('Content-Type') || 'none'
    });
    return;
  }
  next();
};

export const validateRequestBody = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'POST' && (!req.body || Object.keys(req.body).length === 0)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Request body is required',
      expectedFormat: {
        email: 'string (optional)',
        phoneNumber: 'string (optional)'
      }
    });
    return;
  }
  next();
};

export const normalizePhoneNumber = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && req.body.phoneNumber) {
   
    let phoneNumber = String(req.body.phoneNumber);
    
    phoneNumber = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
    
    req.body.phoneNumber = phoneNumber;
  }
  next();
};

export const normalizeEmail = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && req.body.email) {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  next();
};

export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body) {
    
    if (req.body.email && typeof req.body.email === 'string') {
      req.body.email = req.body.email.replace(/<[^>]*>/g, '').trim();
    }
    
    if (req.body.phoneNumber && typeof req.body.phoneNumber === 'string') {
      req.body.phoneNumber = req.body.phoneNumber.replace(/<[^>]*>/g, '').trim();
    }
  }
  next();
};

export const rateLimiter = (() => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  const WINDOW_SIZE = 60 * 1000; 
  const MAX_REQUESTS = 100; 

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const clientRequests = requests.get(clientIP);
    
    if (!clientRequests) {
      requests.set(clientIP, { count: 1, resetTime: now + WINDOW_SIZE });
      next();
      return;
    }
    
    if (now > clientRequests.resetTime) {
      requests.set(clientIP, { count: 1, resetTime: now + WINDOW_SIZE });
      next();
      return;
    }
    
    if (clientRequests.count >= MAX_REQUESTS) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((clientRequests.resetTime - now) / 1000)
      });
      return;
    }
    
    clientRequests.count++;
    next();
  };
})();


export const logRequest = (req: Request, res: Response, next: NextFunction): void => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent');
  
  console.log(`${timestamp} - ${method} ${url} - IP: ${ip} - UA: ${userAgent?.substring(0, 100) || 'unknown'}`);
  
  
  if (method === 'POST' && req.body) {
    const sanitizedBody = {
      email: req.body.email ? '***@***.***' : undefined,
      phoneNumber: req.body.phoneNumber ? '***-***-****' : undefined
    };
    console.log(`${timestamp} - Request body structure:`, sanitizedBody);
  }
  
  next();
};

export const handleValidationErrors = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof SyntaxError && 'body' in error) {
    
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON format in request body',
      details: 'Please ensure the request body contains valid JSON'
    });
    return;
  }
  
  next(error);
};