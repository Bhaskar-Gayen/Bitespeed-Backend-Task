

import { Contact } from '@prisma/client';

export type { IdentifyRequest } from '@/schemas/identifySchema';


export enum LinkPrecedence {
  PRIMARY = 'primary',
  SECONDARY = 'secondary'
}

export interface CreateContactInput {
  phoneNumber?: string | null;
  email?: string | null;
  linkedId?: number | null;
  linkPrecedence: LinkPrecedence;
}

export interface UpdateContactInput {
  phoneNumber?: string | null;
  email?: string | null;
  linkedId?: number | null;
  linkPrecedence?: LinkPrecedence;
}

export interface ContactWithLinked extends Contact {
  linkedContact?: Contact | null;
  linkedContacts?: Contact[];
}

export interface ConsolidatedContact {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

export interface IdentifyResponse {
  contact: ConsolidatedContact;
}
export interface ContactFilters {
  email?: string | null;
  phoneNumber?: string | null;
  linkedId?: number | null;
  linkPrecedence?: LinkPrecedence;
  deletedAt?: null; 
}

export interface ContactSearchResult {
  contacts: Contact[];
  primaryContact?: Contact;
  secondaryContacts: Contact[];
}

export interface ApiError {
  error: string;
  message: string;
  statusCode?: number;
  details?: any;
}

export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
export type { Contact } from '@prisma/client';