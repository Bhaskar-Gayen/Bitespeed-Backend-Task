// src/routes/identify.ts
import { Router } from 'express';
import { IdentifyController } from '../controllers/IdentifyController';
import {
  validateContentType,
  validateRequestBody,
  normalizePhoneNumber,
  normalizeEmail,
  sanitizeInput,
  rateLimiter,
  logRequest
} from '../middleware/validation';
import { asyncHandler, requestTimeout } from '../middleware/errorHandler';

const router:Router = Router();
const identifyController = new IdentifyController();


router.post(
  '/',
  requestTimeout(30000), 
  rateLimiter,
  logRequest,
  validateContentType,
  validateRequestBody,
  sanitizeInput,
  normalizeEmail,
  normalizePhoneNumber,
  asyncHandler(identifyController.identify.bind(identifyController))
);

/**
 * GET /identify - Method not allowed, provide helpful error
 */
router.get(
  '/',
  asyncHandler(identifyController.handleGetRequest.bind(identifyController))
);

/**
 * Handle other HTTP methods
 */
router.all('/', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: `${req.method} method is not supported for /identify endpoint`,
    allowedMethods: ['POST'],
    timestamp: new Date().toISOString()
  });
});

export default router;