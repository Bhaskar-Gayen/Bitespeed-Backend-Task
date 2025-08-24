
import { Request, Response } from 'express';
import { IdentityService } from '@/services/IdentityService';
import { IdentifyRequest, IdentifyResponse } from '@/types';
import { validateIdentifyRequest } from '@/schemas/identifySchema';

export class IdentifyController {
  private identityService: IdentityService;

  constructor() {
    this.identityService = new IdentityService();
  }

  /**
   * Handle POST /identify requests
   */
  async identify(req: Request, res: Response): Promise<void> {
    try {
      console.log(' Received identify request:', req.body);

      const { email, phoneNumber } = req.body;
      
      const validation = this.validateIdentifyRequest({ email, phoneNumber });
      if (!validation.isValid) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request format',
          details: validation.errors
        });
        return;
      }

 
      const identifyRequest: IdentifyRequest = {
        email: email || null,
        phoneNumber: phoneNumber || null
      };

      const result = await this.identityService.identifyContact(identifyRequest);

      if (!result.success) {
        console.error('Identity resolution failed:', result.error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to process identity request',
          details: process.env.NODE_ENV === 'development' ? result.error : undefined
        });
        return;
      }

      const response: IdentifyResponse = result.data!;
      
      console.log(' Sending identify response:', response);
      res.status(200).json(response);

    } catch (error) {
      console.error('Unexpected error in identify controller:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : 'Unknown error')
          : undefined
      });
    }
  }

  /**
   * Validate identify request format
   */
  private validateIdentifyRequest(request: any): { isValid: boolean; errors: string[] } {
    const validation = validateIdentifyRequest(request);
    
    return {
      isValid: validation.success,
      errors: validation.errors || []
    };
   }
  /**
   * Handle GET requests to /identify (method not allowed)
   */
  async handleGetRequest(req: Request, res: Response): Promise<void> {
    res.status(405).json({
      error: 'Method Not Allowed',
      message: 'GET method is not supported for /identify endpoint',
      allowedMethods: ['POST'],
      expectedFormat: {
        method: 'POST',
        contentType: 'application/json',
        body: {
          email: 'string (optional)',
          phoneNumber: 'string (optional)'
        }
      }
    });
  }
}