import { Contact } from '@prisma/client';
import { ContactService } from './ContactService';
import { ContactRepository } from './ContactRepository';
import {
  IdentifyRequest,
  IdentifyResponse,
  ConsolidatedContact,
  LinkPrecedence,
  DatabaseResult,
  ContactSearchResult
} from '@/types';

export class IdentityService {
  private contactService: ContactService;
  private contactRepository: ContactRepository;

  constructor() {
    this.contactService = new ContactService();
    this.contactRepository = new ContactRepository();
  }

  async identifyContact(request: IdentifyRequest): Promise<DatabaseResult<IdentifyResponse>> {
    try {
      const { email, phoneNumber } = request;
     
      const existingContactsResult = await this.contactService.findExistingContacts(email || null, phoneNumber || null);
      
      if (!existingContactsResult.success) {
        return {
          success: false,
          error: existingContactsResult.error || 'Failed to find existing contacts',
        };
      }

      const searchResult = existingContactsResult.data!;
      console.log(` Found ${searchResult.contacts.length} existing contacts`);

     
      if (searchResult.contacts.length === 0) {
       
        console.log(' No existing contacts found, creating new primary');
        return await this.handleNoExistingContacts(email || null, phoneNumber || null);
      } else if (this.isExactDuplicate(searchResult.contacts, email, phoneNumber)) {
       
        console.log(' Exact duplicate found');
        return await this.handleExactDuplicate(searchResult);
      } else if (searchResult.primaryContact && searchResult.secondaryContacts.length === 0) {
        
        console.log(' Single primary contact found');
        return await this.handleSinglePrimaryContact(searchResult, email || null, phoneNumber || null);
      } else if (this.hasMultiplePrimaryContacts(searchResult.contacts)) {
       
        console.log(' Multiple primary contacts found');
        return await this.handleMultiplePrimaryContacts(searchResult.contacts, email || null, phoneNumber || null);
      } else {
       
        console.log(' Existing chain with potential new info');
        return await this.handleExistingChain(searchResult, email || null, phoneNumber || null);
      }
    } catch (error) {
      console.error('Error in identifyContact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in identity resolution',
      };
    }
  }

  private async handleNoExistingContacts(
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<IdentifyResponse>> {
    console.log('Creating new primary contact');
    
    const createResult = await this.contactService.createPrimaryContact(email || null, phoneNumber || null);
    
    if (!createResult.success || !createResult.data) {
      return {
        success: false,
        error: 'Failed to create new primary contact',
      };
    }

    const primaryContact = createResult.data;
    
    const consolidatedContact: ConsolidatedContact = {
      primaryContactId: primaryContact.id,
      emails: primaryContact.email ? [primaryContact.email] : [],
      phoneNumbers: primaryContact.phoneNumber ? [primaryContact.phoneNumber] : [],
      secondaryContactIds: [],
    };

    return {
      success: true,
      data: { contact: consolidatedContact },
    };
  }

  private async handleExactDuplicate(
    searchResult: ContactSearchResult
  ): Promise<DatabaseResult<IdentifyResponse>> {
    console.log(' Exact duplicate found, returning existing contact info');
    
    
    const primaryContact = searchResult.primaryContact || searchResult.contacts.find(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    
    if (!primaryContact) {
      return {
        success: false,
        error: 'No primary contact found in search results',
      };
    }

    return await this.consolidateAndReturn(primaryContact.id);
  }

  private async handleSinglePrimaryContact(
    searchResult: ContactSearchResult,
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<IdentifyResponse>> {
    const primaryContact = searchResult.primaryContact!;
    
   
    const needsSecondary = this.needsSecondaryContact(primaryContact, email, phoneNumber);
    
    if (needsSecondary) {
      console.log(' Creating secondary contact for single primary');
      
      const secondaryResult = await this.contactService.createSecondaryContact(
        primaryContact.id,
        email || null,
        phoneNumber || null
      );
      
      if (!secondaryResult.success) {
        return {
          success: false,
          error: 'Failed to create secondary contact',
        };
      }
    } else {
      console.log(' Using existing single primary contact');
    }

    return await this.consolidateAndReturn(primaryContact.id);
  }

  private async handleMultiplePrimaryContacts(
    contacts: Contact[],
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<IdentifyResponse>> {
    console.log(' Multiple primary contacts found, merging chains');
    
   
    const primaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    
    
    primaryContacts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    const olderPrimary = primaryContacts[0];
    const newerPrimaries = primaryContacts.slice(1);
    
    if (!olderPrimary) {
      return {
        success: false,
        error: 'No primary contact found in multiple primaries scenario',
      };
    }
    
   
    for (const newerPrimary of newerPrimaries) {
      const mergeResult = await this.contactService.mergeContactChains(olderPrimary.id, newerPrimary.id);
      
      if (!mergeResult.success) {
        console.error(`Failed to merge contact ${newerPrimary.id} into ${olderPrimary.id}`);
      }
    }
    
    
    const needsNewSecondary = await this.checkIfNeedsNewSecondary(olderPrimary.id, email || null, phoneNumber || null);
    
    if (needsNewSecondary) {
      console.log(' Creating new secondary after chain merge');
      await this.contactService.createSecondaryContact(olderPrimary.id, email || null, phoneNumber || null);
    }
    
    return await this.consolidateAndReturn(olderPrimary.id);
  }

  private async handleExistingChain(
    searchResult: ContactSearchResult,
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<DatabaseResult<IdentifyResponse>> {
    console.log('🔍 Handling existing chain with potential new info');
    
   
    const primaryContact = searchResult.primaryContact || 
      searchResult.contacts.find(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    
    if (!primaryContact) {
      console.error('No primary contact found in existing chain');
      console.log('Available contacts:', searchResult.contacts.map(c => ({
        id: c.id,
        precedence: c.linkPrecedence,
        email: c.email,
        phone: c.phoneNumber
      })));
      

      if (searchResult.contacts.length > 0) {
        const oldestContact = searchResult.contacts.reduce((oldest, current) => 
          oldest.createdAt < current.createdAt ? oldest : current
        );
        
        console.log(' Converting oldest contact to primary as fallback');
        
       
        const updateResult = await this.contactRepository.updateContactLinkage(oldestContact.id, {
          linkPrecedence: LinkPrecedence.PRIMARY,
          linkedId: null,
        });
        
        if (updateResult.success && updateResult.data) {
          return await this.consolidateAndReturn(updateResult.data.id);
        }
      }
      
      console.log(' Creating new primary as last resort');
      return await this.handleNoExistingContacts(email, phoneNumber);
    }

    
    const needsNewSecondary = await this.checkIfNeedsNewSecondary(primaryContact.id, email, phoneNumber);
    
    if (needsNewSecondary) {
      console.log(' Adding new secondary to existing chain');
      await this.contactService.createSecondaryContact(primaryContact.id, email || null, phoneNumber || null);
    }
    
    return await this.consolidateAndReturn(primaryContact.id);
  }

  private async consolidateAndReturn(primaryContactId: number): Promise<DatabaseResult<IdentifyResponse>> {
    const consolidatedResult = await this.contactService.consolidateContactInfo(primaryContactId);
    
    if (!consolidatedResult.success || !consolidatedResult.data) {
      return {
        success: false,
        error: 'Failed to consolidate contact information',
      };
    }

    return {
      success: true,
      data: { contact: consolidatedResult.data },
    };
  }

  /**
   * Check if the request is an exact duplicate of existing contacts
   */
  private isExactDuplicate(contacts: Contact[], email?: string | null, phoneNumber?: string | null): boolean {
    return contacts.some(contact => 
      contact.email === email && 
      contact.phoneNumber === phoneNumber
    );
  }

  /**
   * Check if there are multiple primary contacts
   */
  private hasMultiplePrimaryContacts(contacts: Contact[]): boolean {
    const primaryCount = contacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY).length;
    return primaryCount > 1;
  }

  private needsSecondaryContact(
    primaryContact: Contact,
    email?: string | null,
    phoneNumber?: string | null
  ): boolean {
    
    if (primaryContact.email === email && primaryContact.phoneNumber === phoneNumber) {
      return false;
    }

    
    if (
      (primaryContact.email === email && primaryContact.phoneNumber !== phoneNumber && phoneNumber !== null) ||
      (primaryContact.phoneNumber === phoneNumber && primaryContact.email !== email && email !== null)
    ) {
      return true;
    }

    
    if (primaryContact.email === null && email !== null && primaryContact.phoneNumber === phoneNumber) {
      return true;
    }

   
    if (primaryContact.phoneNumber === null && phoneNumber !== null && primaryContact.email === email) {
      return true;
    }

    return false;
  }

  private async checkIfNeedsNewSecondary(
    primaryContactId: number,
    email?: string | null,
    phoneNumber?: string | null
  ): Promise<boolean> {
    try {
     
      const chainResult = await this.contactService.getLinkedContactChain(primaryContactId);
      
      if (!chainResult.success || !chainResult.data) {
        return false;
      }

      const allContacts = chainResult.data;

     
      const exactMatch = allContacts.some(contact => 
        contact.email === email && contact.phoneNumber === phoneNumber
      );

      if (exactMatch) {
        return false;
      }

      
      const hasNewEmail = email && !allContacts.some(contact => contact.email === email);
      const hasNewPhone = phoneNumber && !allContacts.some(contact => contact.phoneNumber === phoneNumber);

      
      const hasMatchingEmail = email && allContacts.some(contact => contact.email === email);
      const hasMatchingPhone = !!phoneNumber && allContacts.some(contact => contact.phoneNumber === phoneNumber);

      return (!!hasNewEmail || !!hasNewPhone) && (hasMatchingEmail || hasMatchingPhone);

    } catch (error) {
      console.error('Error checking if needs new secondary:', error);
      return false;
    }
  }

  validateIdentifyRequest(request: IdentifyRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.email && !request.phoneNumber) {
      errors.push('At least one of email or phoneNumber must be provided');
    }

    
    if (request.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(request.email)) {
        errors.push('Invalid email format');
      }
    }

    
    if (request.phoneNumber) {
      
      const phoneRegex = /^[\d\s\-\(\)\+]+$/;
      if (!phoneRegex.test(request.phoneNumber)) {
        errors.push('Invalid phone number format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get statistics about identity resolution
   */
  async getIdentityStatistics(): Promise<DatabaseResult<{
    totalIdentities: number;
    averageContactsPerIdentity: number;
    largestIdentityChain: number;
    identitiesWithMultipleEmails: number;
    identitiesWithMultiplePhones: number;
  }>> {
    try {
      const primaryResult = await this.contactRepository.findPrimaryContacts();
      
      if (!primaryResult.success || !primaryResult.data) {
        return {
          success: false,
          error: 'Failed to get primary contacts',
        };
      }

      const primaryContacts = primaryResult.data;
      const totalIdentities = primaryContacts.length;

      if (totalIdentities === 0) {
        return {
          success: true,
          data: {
            totalIdentities: 0,
            averageContactsPerIdentity: 0,
            largestIdentityChain: 0,
            identitiesWithMultipleEmails: 0,
            identitiesWithMultiplePhones: 0,
          },
        };
      }

      let totalContacts = 0;
      let largestChain = 0;
      let multipleEmails = 0;
      let multiplePhones = 0;

      
      for (const primary of primaryContacts) {
        const chainResult = await this.contactService.getLinkedContactChain(primary.id);
        
        if (chainResult.success && chainResult.data) {
          const chainSize = chainResult.data.length;
          totalContacts += chainSize;
          
          if (chainSize > largestChain) {
            largestChain = chainSize;
          }

          
          const uniqueEmails = new Set(chainResult.data.map(c => c.email).filter(Boolean));
          const uniquePhones = new Set(chainResult.data.map(c => c.phoneNumber).filter(Boolean));

          if (uniqueEmails.size > 1) {
            multipleEmails++;
          }

          if (uniquePhones.size > 1) {
            multiplePhones++;
          }
        }
      }

      return {
        success: true,
        data: {
          totalIdentities,
          averageContactsPerIdentity: Math.round((totalContacts / totalIdentities) * 100) / 100,
          largestIdentityChain: largestChain,
          identitiesWithMultipleEmails: multipleEmails,
          identitiesWithMultiplePhones: multiplePhones,
        },
      };
    } catch (error) {
      console.error('Error getting identity statistics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}