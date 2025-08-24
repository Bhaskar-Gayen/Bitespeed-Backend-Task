
import { Contact } from '@prisma/client';
import { ContactRepository } from './ContactRepository';
import {
  CreateContactInput,
  UpdateContactInput,
  ContactSearchResult,
  LinkPrecedence,
  DatabaseResult,
  ConsolidatedContact
} from '@/types';

export class ContactService {
  private contactRepository: ContactRepository;

  constructor() {
    this.contactRepository = new ContactRepository();
  }

  /**
   * Create a new primary contact
   */
  async createPrimaryContact(
    email: string | null,
    phoneNumber: string | null
  ): Promise<DatabaseResult<Contact>> {
    const contactData: CreateContactInput = {
      email,
      phoneNumber,
      linkPrecedence: LinkPrecedence.PRIMARY,
      linkedId: null,
    };

    return await this.contactRepository.createContact(contactData);
  }


  async createSecondaryContact(
    primaryContactId: number,
    email: string | null,
    phoneNumber: string | null
  ): Promise<DatabaseResult<Contact>> {
    const contactData: CreateContactInput = {
      email,
      phoneNumber,
      linkPrecedence: LinkPrecedence.SECONDARY,
      linkedId: primaryContactId,
    };

    return await this.contactRepository.createContact(contactData);
  }

  async findExistingContacts(
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<ContactSearchResult>> {
    try {
      const result = await this.contactRepository.findContactsByEmailOrPhone(email, phoneNumber);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to find contacts',
        };
      }
  
      const contacts = result.data || [];
      
      const primaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
      const secondaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.SECONDARY);
  
      const primaryContact = primaryContacts.length > 0 
        ? primaryContacts.reduce((oldest, current) => 
            oldest.createdAt < current.createdAt ? oldest : current
          )
        : undefined;
  
      const searchResult: ContactSearchResult = {
        contacts,
        primaryContact,
        secondaryContacts,
      };
  
      return {
        success: true, 
        data: searchResult,
      };
    } catch (error) {
      console.error('Error in findExistingContacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getLinkedContactChain(contactId: number): Promise<DatabaseResult<Contact[]>> {
    return await this.contactRepository.getAllLinkedContacts(contactId);
  }

  async convertPrimaryToSecondary(
    contactId: number,
    newPrimaryId: number
  ): Promise<DatabaseResult<Contact>> {
    const updateData: UpdateContactInput = {
      linkPrecedence: LinkPrecedence.SECONDARY,
      linkedId: newPrimaryId,
    };

    return await this.contactRepository.updateContactLinkage(contactId, updateData);
  }

  async mergeContactChains(
    olderPrimaryId: number,
    newerPrimaryId: number
  ): Promise<DatabaseResult<Contact[]>> {
    try {
    
      const newerChainResult = await this.contactRepository.getAllLinkedContacts(newerPrimaryId);
      
      if (!newerChainResult.success || !newerChainResult.data) {
        return {
          success: false,
          error: 'Failed to get newer contact chain',
        };
      }

      const newerChainContacts = newerChainResult.data;
      const updatedContacts: Contact[] = [];

      const newerPrimary = newerChainContacts.find(c => c.id === newerPrimaryId);
      if (newerPrimary) {
        const updateResult = await this.convertPrimaryToSecondary(newerPrimaryId, olderPrimaryId);
        if (updateResult.success && updateResult.data) {
          updatedContacts.push(updateResult.data);
        }
      }

      for (const contact of newerChainContacts) {
        if (contact.id !== newerPrimaryId && contact.linkPrecedence === LinkPrecedence.SECONDARY) {
          const updateResult = await this.contactRepository.updateContactLinkage(contact.id, {
            linkedId: olderPrimaryId,
            linkPrecedence: LinkPrecedence.PRIMARY
          });
          
          if (updateResult.success && updateResult.data) {
            updatedContacts.push(updateResult.data);
          }
        }
      }

      return {
        success: true,
        data: updatedContacts,
      };
    } catch (error) {
      console.error('Error merging contact chains:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async consolidateContactInfo(primaryContactId: number): Promise<DatabaseResult<ConsolidatedContact>> {
    try {
      
      const chainResult = await this.contactRepository.getAllLinkedContacts(primaryContactId);
      
      if (!chainResult.success || !chainResult.data) {
        return {
          success: false,
          error: 'Failed to get contact chain',
        };
      }

      const allContacts = chainResult.data;
      const primaryContact = allContacts.find(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
      const secondaryContacts = allContacts.filter(c => c.linkPrecedence === LinkPrecedence.SECONDARY);

      if (!primaryContact) {
        return {
          success: false,
          error: 'Primary contact not found',
        };
      }

      const emails = new Set<string>();
      const phoneNumbers = new Set<string>();

      if (primaryContact.email) emails.add(primaryContact.email);
      if (primaryContact.phoneNumber) phoneNumbers.add(primaryContact.phoneNumber);

      secondaryContacts
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) 
        .forEach(contact => {
          if (contact.email) emails.add(contact.email);
          if (contact.phoneNumber) phoneNumbers.add(contact.phoneNumber);
        });

      const consolidatedContact: ConsolidatedContact = {
        primaryContactId: primaryContact.id,
        emails: Array.from(emails),
        phoneNumbers: Array.from(phoneNumbers),
        secondaryContactIds: secondaryContacts.map(c => c.id),
      };

      return {
        success: true,
        data: consolidatedContact,
      };
    } catch (error) {
      console.error('Error consolidating contact info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  shouldContactsBeLinked(contact1: Contact, contact2: Contact): boolean {
    if (contact1.email && contact2.email && contact1.email === contact2.email) {
      return true;
    }
    if (contact1.phoneNumber && contact2.phoneNumber && contact1.phoneNumber === contact2.phoneNumber) {
      return true;
    }

    return false;
  }

  isContactDataDuplicate(
    existingContacts: Contact[],
    email?: string | null,
    phoneNumber?: string | null
  ): boolean {
    return existingContacts.some(contact => 
      (email && contact.email === email && phoneNumber && contact.phoneNumber === phoneNumber) ||
      (email && contact.email === email && !phoneNumber) ||
      (phoneNumber && contact.phoneNumber === phoneNumber && !email)
    );
  }

  async getContactStatistics(): Promise<DatabaseResult<{
    totalContacts: number;
    primaryContacts: number;
    secondaryContacts: number;
  }>> {
    try {
      const [totalResult, primaryResult] = await Promise.all([
        this.contactRepository.countContacts(),
        this.contactRepository.findPrimaryContacts(),
      ]);

      if (!totalResult.success || !primaryResult.success) {
        return {
          success: false,
          error: 'Failed to get statistics',
        };
      }

      const totalContacts = totalResult.data || 0;
      const primaryCount = primaryResult.data?.length || 0;
      const secondaryCount = totalContacts - primaryCount;

      return {
        success: true,
        data: {
          totalContacts,
          primaryContacts: primaryCount,
          secondaryContacts: secondaryCount,
        },
      };
    } catch (error) {
      console.error('Error getting contact statistics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}