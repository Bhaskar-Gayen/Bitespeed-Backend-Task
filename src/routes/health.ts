
import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '@/config/database';
import { ContactService } from '@/services/ContactService';
import { DatabaseUtils } from '@/services/DatabaseUtils';
import { asyncHandler } from '@/middleware/errorHandler';

const router:Router = Router();

/**
 * GET /health - Basic health check
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const isDatabaseHealthy = await checkDatabaseHealth();
  
  const healthStatus = {
    status: isDatabaseHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'Contact Identity Service',
    version: '1.0.0',
    database: {
      status: isDatabaseHealthy ? 'connected' : 'disconnected',
      type: 'PostgreSQL'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  const statusCode = isDatabaseHealthy ? 200 : 503;
  res.status(statusCode).json(healthStatus);
}));

/**
 * GET /health/detailed - Detailed health check with database statistics
 */
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const isDatabaseHealthy = await checkDatabaseHealth();
  const contactService = new ContactService();
  const databaseUtils = new DatabaseUtils();

  
  const [statsResult, healthResult, integrityResult] = await Promise.allSettled([
    contactService.getContactStatistics(),
    databaseUtils.getDatabaseHealth(),
    databaseUtils.validateDatabaseIntegrity(),
  ]);

  const stats = statsResult.status === 'fulfilled' && statsResult.value.success 
    ? statsResult.value.data 
    : null;

  const dbHealth = healthResult.status === 'fulfilled' && healthResult.value.success 
    ? healthResult.value.data 
    : null;

  const detailedHealth = {
    status: isDatabaseHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'Contact Identity Service',
    version: '1.0.0',
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform
    },
    database: {
      status: isDatabaseHealthy ? 'connected' : 'disconnected',
      type: 'PostgreSQL',
      health: dbHealth,
      statistics: stats,
      integrity: integrityResult.status === 'fulfilled' && integrityResult.value.success 
        ? integrityResult.value.data 
        : null,
    },
    endpoints: {
      identify: 'POST /identify',
      health: 'GET /health',
      healthDetailed: 'GET /health/detailed'
    }
  };

  const statusCode = isDatabaseHealthy ? 200 : 503;
  res.status(statusCode).json(detailedHealth);
}));

/**
 * GET /health/database - Database-specific health check
 */
router.get('/database', asyncHandler(async (req: Request, res: Response) => {
  const databaseUtils = new DatabaseUtils();
  const healthResult = await databaseUtils.getDatabaseHealth();
  const integrityResult = await databaseUtils.validateDatabaseIntegrity();
  const seedResult = await databaseUtils.seedDatabase();

  if (!healthResult.success) {
    res.status(503).json({
      status: 'UNHEALTHY',
      message: 'Database health check failed',
      error: healthResult.error,
      timestamp: new Date().toISOString()
    });
    return;
  }

  const dbStatus = {
    status: healthResult.data!.isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    statistics: healthResult.data,
    integrity: integrityResult.success ? integrityResult.data : null,
    seed: seedResult.success ? seedResult.data : null,
    connection: {
      status: 'connected',
      type: 'PostgreSQL'
    }
  };

  const statusCode = healthResult.data!.isHealthy && integrityResult.data?.isValid ? 200 : 503;
  res.status(statusCode).json(dbStatus);
}));

export default router;