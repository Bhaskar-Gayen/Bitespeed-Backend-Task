
import { PrismaClient, Contact } from '@prisma/client';
import { getPrismaClient } from '../config/database';
import {
  CreateContactInput,
  UpdateContactInput,
  ContactFilters,
  ContactWithLinked,
  LinkPrecedence,
  DatabaseResult
} from '@/types';

export class ContactRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Create a new contact
   */
  async createContact(data: CreateContactInput): Promise<DatabaseResult<Contact>> {
    try {
      const contact = await this.prisma.contact.create({
        data: {
          email: data.email,
          phoneNumber: data.phoneNumber,
          linkedId: data.linkedId,
          linkPrecedence: data.linkPrecedence,
        },
      });

      return {
        success: true,
        data: contact,
      };
    } catch (error) {
      console.error('Error creating contact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find contact by ID
   */
  async findContactById(id: number): Promise<DatabaseResult<Contact | null>> {
    try {
      const contact = await this.prisma.contact.findUnique({
        where: {
          id,
          deletedAt: null,
        },
      });

      return {
        success: true,
        data: contact,
      };
    } catch (error) {
      console.error('Error finding contact by ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find contacts by email
   */
  async findContactsByEmail(email: string): Promise<DatabaseResult<Contact[]>> {
    try {
      const contacts = await this.prisma.contact.findMany({
        where: {
          email,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        success: true,
        data: contacts,
      };
    } catch (error) {
      console.error('Error finding contacts by email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find contacts by phone number
   */
  async findContactsByPhone(phoneNumber: string): Promise<DatabaseResult<Contact[]>> {
    try {
      const contacts = await this.prisma.contact.findMany({
        where: {
          phoneNumber,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        success: true,
        data: contacts,
      };
    } catch (error) {
      console.error('Error finding contacts by phone:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find contacts by email OR phone number
   */
  async findContactsByEmailOrPhone(
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<Contact[]>> {
    try {
      if (!email && !phoneNumber) {
        return {
          success: true,
          data: [],
        };
      }

      const whereConditions = [];
      
      if (email) {
        whereConditions.push({ email });
      }
      
      if (phoneNumber) {
        whereConditions.push({ phoneNumber });
      }

      const contacts = await this.prisma.contact.findMany({
        where: {
          OR: whereConditions,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        success: true,
        data: contacts,
      };
    } catch (error) {
      console.error('Error finding contacts by email or phone:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all linked contacts (including the primary and all secondaries)
   */
  async getAllLinkedContacts(contactId: number): Promise<DatabaseResult<Contact[]>> {
      try {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId, deletedAt: null },
      });

      if (!contact) {
        return {
          success: true,
          data: [],
        };
      }

      const primaryContactId = contact.linkPrecedence === LinkPrecedence.PRIMARY 
        ? contact.id 
        : contact.linkedId;

      if (!primaryContactId) {
        return {
          success: true,
          data: [contact],
        };
      }

      const linkedContacts = await this.prisma.contact.findMany({
        where: {
          OR: [
            { id: primaryContactId },
            { linkedId: primaryContactId },
          ],
          deletedAt: null,
        },
        orderBy: [
          { linkPrecedence: 'asc' }, 
          { createdAt: 'asc' },
        ],
      });

      return {
        success: true,
        data: linkedContacts,
      };
    } catch (error) {
      console.error('Error getting all linked contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async updateContactLinkage(
    contactId: number,
    updates: UpdateContactInput
  ): Promise<DatabaseResult<Contact>> {
    try {
      const updatedContact = await this.prisma.contact.update({
        where: {
          id: contactId,
        },
        data: {
          linkedId: updates.linkedId,
          linkPrecedence: updates.linkPrecedence,
          phoneNumber: updates.phoneNumber,
          email: updates.email,
        },
      });

      return {
        success: true,
        data: updatedContact,
      };
    } catch (error) {
      console.error('Error updating contact linkage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async findPrimaryContacts(): Promise<DatabaseResult<Contact[]>> {
    try {
      const primaryContacts = await this.prisma.contact.findMany({
        where: {
          linkPrecedence: LinkPrecedence.PRIMARY,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        success: true,
        data: primaryContacts,
      };
    } catch (error) {
      console.error('Error finding primary contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async findSecondaryContacts(primaryContactId: number): Promise<DatabaseResult<Contact[]>> {
    try {
      const secondaryContacts = await this.prisma.contact.findMany({
        where: {
          linkedId: primaryContactId,
          linkPrecedence: LinkPrecedence.SECONDARY,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        success: true,
        data: secondaryContacts,
      };
    } catch (error) {
      console.error('Error finding secondary contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async getContactWithLinked(contactId: number): Promise<DatabaseResult<ContactWithLinked | null>> {
    try {
      const contact = await this.prisma.contact.findUnique({
        where: {
          id: contactId,
          deletedAt: null,
        },
        include: {
          linkedContact: true,
          linkedContacts: {
            where: {
              deletedAt: null,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      return {
        success: true,
        data: contact,
      };
    } catch (error) {
      console.error('Error getting contact with linked:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async softDeleteContact(contactId: number): Promise<DatabaseResult<Contact>> {
    try {
      const deletedContact = await this.prisma.contact.update({
        where: {
          id: contactId,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      return {
        success: true,
        data: deletedContact,
      };
    } catch (error) {
      console.error('Error soft deleting contact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  
  async countContacts(): Promise<DatabaseResult<number>> {
    try {
      const count = await this.prisma.contact.count({
        where: {
          deletedAt: null,
        },
      });

      return {
        success: true,
        data: count,
      };
    } catch (error) {
      console.error('Error counting contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}