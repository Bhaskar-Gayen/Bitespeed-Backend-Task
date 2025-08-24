
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import identifyRoutes from '@/routes/identify';
import healthRoutes from '@/routes/health';

import {
  globalErrorHandler,
  handleDatabaseErrors,
  notFoundHandler,
  
} from '@/middleware/errorHandler';

import { handleValidationErrors } from '@/middleware/validation';

const app: express.Application = express();


app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://your-frontend-domain.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 
}));

app.set('trust proxy', 1);

app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: ['application/json']
}));
app.use(express.urlencoded({ 
  extended: false,
  limit: '1mb'
}));

app.use(handleValidationErrors);

if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
  });
}

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Contact Identity Service API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      identify: {
        method: 'POST',
        path: '/identify',
        description: 'Identify and consolidate contact information'
      },
      health: {
        method: 'GET',
        path: '/health',
        description: 'Basic health check'
      },
      healthDetailed: {
        method: 'GET',
        path: '/health/detailed',
        description: 'Detailed health check with statistics and seed data insert into database'
      },
      healthDatabase: {
        method: 'GET',
        path: '/health/database',
        description: 'Database-specific health check'
      }
    },
    documentation: {
      identify: {
        request: {
          method: 'POST',
          contentType: 'application/json',
          body: {
            email: 'string (optional) - Email address',
            phoneNumber: 'string (optional) - Phone number'
          },
          note: 'At least one of email or phoneNumber must be provided'
        },
        response: {
          contact: {
            primaryContactId: 'number - ID of the primary contact',
            emails: 'string[] - All email addresses for this identity',
            phoneNumbers: 'string[] - All phone numbers for this identity',
            secondaryContactIds: 'number[] - IDs of secondary contacts'
          }
        }
      }
    }
  });
});


app.use('/identify', identifyRoutes);
app.use('/health', healthRoutes);


app.use(handleDatabaseErrors);

app.use(notFoundHandler);


app.use(globalErrorHandler);

export default app;