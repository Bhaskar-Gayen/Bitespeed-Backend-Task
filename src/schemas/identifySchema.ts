
import { z } from 'zod';

const phoneRegex = /^[\d\s\-\(\)\+\.]+$/;


const emailSchema = z
  .string()
  .trim()
  .min(3, { message: 'Email cannot be empty' })
  .email({ message: 'Email must be a valid email address' })
  .toLowerCase();


const phoneNumberSchema = z
  .string()
  .transform((val: string | number) => String(val))
  .refine((val: string) => val.trim() !== '', 'Phone number cannot be empty')
  .refine((val: string) => phoneRegex.test(val), 'Phone number contains invalid characters');


export const identifyRequestSchema = z
  .object({
    email: emailSchema.optional().nullable(),
    phoneNumber: phoneNumberSchema.optional().nullable(),
  })
  .strict() 
  .refine(
    (data: { email?: string | null; phoneNumber?: string | null }) => data.email || data.phoneNumber,
    {
      message: 'At least one of email or phoneNumber must be provided',
      path: ['root'],
    }
  );


export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;


export interface ValidationResult {
  success: boolean;
  data?: IdentifyRequest;
  errors?: string[];
}


export function validateIdentifyRequest(data: unknown): ValidationResult {
    const result = identifyRequestSchema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }
  
    const errors = result.error.issues.map(err => {
      if (err.path.length === 0 || err.path[0] === 'root') {
        return err.message;
      }
      return `${err.path.join('.')}: ${err.message}`;
    });
  
    return {
      success: false,
      errors,
    };
  }
  