
import { Contact } from '@prisma/client';
import { ContactRepository } from './ContactRepository';
import { LinkPrecedence, DatabaseResult } from '../types';

export class DatabaseUtils {
  private contactRepository: ContactRepository;

  constructor() {
    this.contactRepository = new ContactRepository();
  }

  /**
   * Seed database with sample data for testing
   */
  async seedDatabase(): Promise<DatabaseResult<Contact[]>> {
    try {
      const sampleContacts: Array<{
        email?: string;
        phoneNumber?: string;
        linkPrecedence: LinkPrecedence;
        linkedId?: number;
      }> = [
        {
          email: 'lorraine@hillvalley.edu',
          phoneNumber: '123456',
          linkPrecedence: LinkPrecedence.PRIMARY,
        },
        {
          email: 'mcfly@hillvalley.edu',
          phoneNumber: '123456',
          linkPrecedence: LinkPrecedence.SECONDARY,
          linkedId: 1, 
        },
        {
          email: 'george@hillvalley.edu',
          phoneNumber: '919191',
          linkPrecedence: LinkPrecedence.PRIMARY,
        },
        {
          email: 'biffsucks@hillvalley.edu',
          phoneNumber: '717171',
          linkPrecedence: LinkPrecedence.PRIMARY,
        },
      ];

      const createdContacts: Contact[] = [];

      
      const firstContact = sampleContacts[0];
      if (!firstContact) {
        return {
          success: false,
          error: 'No sample contacts available',
        };
      }

      const firstContactResult = await this.contactRepository.createContact({
        email: firstContact.email || null,
        phoneNumber: firstContact.phoneNumber || null,
        linkPrecedence: firstContact.linkPrecedence,
        linkedId: null,
      });

      if (firstContactResult.success && firstContactResult.data) {
        createdContacts.push(firstContactResult.data);
        
        
        const secondContact = sampleContacts[1];
        if (secondContact) {
          const secondContactResult = await this.contactRepository.createContact({
            email: secondContact.email || null,
            phoneNumber: secondContact.phoneNumber || null,
            linkPrecedence: secondContact.linkPrecedence,
            linkedId: firstContactResult.data.id,
          });

          if (secondContactResult.success && secondContactResult.data) {
            createdContacts.push(secondContactResult.data);
          }
        }
      }

      
      for (let i = 2; i < sampleContacts.length; i++) {
        const contact = sampleContacts[i];
        if (contact) {
          const contactResult = await this.contactRepository.createContact({
            email: contact.email || null,
            phoneNumber: contact.phoneNumber || null,
            linkPrecedence: contact.linkPrecedence,
            linkedId: null,
          });

          if (contactResult.success && contactResult.data) {
            createdContacts.push(contactResult.data);
          }
        }
      }

      return {
        success: true,
        data: createdContacts,
      };
    } catch (error) {
      console.error('Error seeding database:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clean database (delete all contacts)
   */
  async cleanDatabase(): Promise<DatabaseResult<number>> {
    try {
      
      const result = await this.contactRepository['prisma'].contact.deleteMany({});

      return {
        success: true,
        data: result.count,
      };
    } catch (error) {
      console.error('Error cleaning database:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reset database auto-increment sequence
   */
  async resetSequence(): Promise<DatabaseResult<boolean>> {
    try {
      
      await this.contactRepository['prisma'].$executeRaw`
        ALTER SEQUENCE contacts_id_seq RESTART WITH 1
      `;

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      console.error('Error resetting sequence:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get database health and statistics
   */
  async getDatabaseHealth(): Promise<DatabaseResult<{
    isHealthy: boolean;
    totalContacts: number;
    primaryContacts: number;
    secondaryContacts: number;
    orphanedSecondaryContacts: number;
    lastCreatedAt?: Date;
  }>> {
    try {
      
      await this.contactRepository['prisma'].$queryRaw`SELECT 1`;

      
      const totalContacts = await this.contactRepository['prisma'].contact.count({
        where: { deletedAt: null },
      });

      const primaryContacts = await this.contactRepository['prisma'].contact.count({
        where: { 
          linkPrecedence: LinkPrecedence.PRIMARY,
          deletedAt: null,
        },
      });

      const secondaryContacts = await this.contactRepository['prisma'].contact.count({
        where: { 
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
        },
      });

      
      const orphanedSecondaryContacts = await this.contactRepository['prisma'].contact.count({
        where: {
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
          linkedContact: null, 
        },
      });

      
      const lastContact = await this.contactRepository['prisma'].contact.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const healthData: {
        isHealthy: boolean;
        totalContacts: number;
        primaryContacts: number;
        secondaryContacts: number;
        orphanedSecondaryContacts: number;
        lastCreatedAt?: Date;
      } = {
        isHealthy: true,
        totalContacts,
        primaryContacts,
        secondaryContacts,
        orphanedSecondaryContacts,
      };

      if (lastContact?.createdAt) {
        healthData.lastCreatedAt = lastContact.createdAt;
      }

      return {
        success: true,
        data: healthData,
      };
    } catch (error) {
      console.error('Error getting database health:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate database integrity
   */
  async validateDatabaseIntegrity(): Promise<DatabaseResult<{
    isValid: boolean;
    issues: string[];
  }>> {
    try {
      const issues: string[] = [];

      
      const orphanedSecondaries = await this.contactRepository['prisma'].contact.findMany({
        where: {
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
          linkedContact: null,
        },
      });

      if (orphanedSecondaries.length > 0) {
        issues.push(`Found ${orphanedSecondaries.length} orphaned secondary contact(s)`);
      }

      
      const invalidLinkedContacts = await this.contactRepository['prisma'].contact.findMany({
        where: {
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
          linkedContact: {
            linkPrecedence: LinkPrecedence.SECONDARY, 
          },
        },
      });

      if (invalidLinkedContacts.length > 0) {
        issues.push(`Found ${invalidLinkedContacts.length} secondary contact(s) linked to other secondary contacts`);
      }

      
      const emptyContacts = await this.contactRepository['prisma'].contact.findMany({
        where: {
          email: null,
          phoneNumber: null,
          deletedAt: null,
        },
      });

      if (emptyContacts.length > 0) {
        issues.push(`Found ${emptyContacts.length} contact(s) with both email and phone number null`);
      }

      return {
        success: true,
        data: {
          isValid: issues.length === 0,
          issues,
        },
      };
    } catch (error) {
      console.error('Error validating database integrity:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fix orphaned secondary contacts
   */
  async fixOrphanedSecondaryContacts(): Promise<DatabaseResult<number>> {
    try {
      
      const result = await this.contactRepository['prisma'].contact.updateMany({
        where: {
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
          linkedContact: null,
        },
        data: {
          linkPrecedence: LinkPrecedence.PRIMARY,
          linkedId: null,
        },
      });

      return {
        success: true,
        data: result.count,
      };
    } catch (error) {
      console.error('Error fixing orphaned secondary contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}