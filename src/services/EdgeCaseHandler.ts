
import { Contact } from '@prisma/client';
import { ContactRepository } from './ContactRepository';
import { ContactService } from './ContactService';
import { ContactMatcher } from './ContactMatcher';
import {
  IdentifyRequest,
  LinkPrecedence,
  DatabaseResult,
  ConsolidatedContact
} from '../types';

/**
 * EdgeCaseHandler manages complex scenarios in contact identity resolution
 */
export class EdgeCaseHandler {
  private contactRepository: ContactRepository;
  private contactService: ContactService;
  private contactMatcher: ContactMatcher;

  constructor() {
    this.contactRepository = new ContactRepository();
    this.contactService = new ContactService();
    this.contactMatcher = new ContactMatcher();
  }

  /**
   * Handle the case where request has email from one primary and phone from another
   * This is the most complex scenario from the assignment
   */
  async handleCrossPrimaryScenario(
    emailFromPrimary1: Contact,
    phoneFromPrimary2: Contact,
    email: string,
    phoneNumber: string
  ): Promise<DatabaseResult<ConsolidatedContact>> {
    try {
      console.log('🔀 Handling cross-primary scenario');
      console.log(`   Email "${email}" from Primary ${emailFromPrimary1.id}`);
      console.log(`   Phone "${phoneNumber}" from Primary ${phoneFromPrimary2.id}`);

      // Determine which primary is older (should remain primary)
      const olderPrimary = emailFromPrimary1.createdAt <= phoneFromPrimary2.createdAt 
        ? emailFromPrimary1 
        : phoneFromPrimary2;
      
      const newerPrimary = olderPrimary.id === emailFromPrimary1.id 
        ? phoneFromPrimary2 
        : emailFromPrimary1;

      console.log(`   Older Primary: ${olderPrimary.id}, Newer Primary: ${newerPrimary.id}`);

      // Get both complete chains before merging
      const [olderChainResult, newerChainResult] = await Promise.all([
        this.contactRepository.getAllLinkedContacts(olderPrimary.id),
        this.contactRepository.getAllLinkedContacts(newerPrimary.id)
      ]);

      if (!olderChainResult.success || !newerChainResult.success) {
        return {
          success: false,
          error: 'Failed to get contact chains for cross-primary scenario',
        };
      }

      // Merge the newer primary's chain into the older primary's chain
      const mergeResult = await this.contactService.mergeContactChains(olderPrimary.id, newerPrimary.id);
      
      if (!mergeResult.success) {
        return {
          success: false,
          error: 'Failed to merge primary contact chains',
        };
      }

      // Check if we need to create a new secondary contact with the specific email/phone combination
      const needsNewSecondary = await this.checkIfSpecificCombinationExists(
        olderPrimary.id,
        email,
        phoneNumber
      );

      if (needsNewSecondary) {
        console.log(' Creating new secondary for specific email/phone combination');
        const secondaryResult = await this.contactService.createSecondaryContact(
          olderPrimary.id,
          email,
          phoneNumber
        );

        if (!secondaryResult.success) {
          console.error('Failed to create secondary for cross-primary scenario');
        }
      }

      // Return consolidated contact information
      return await this.contactService.consolidateContactInfo(olderPrimary.id);

    } catch (error) {
      console.error('Error in handleCrossPrimaryScenario:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in cross-primary scenario',
      };
    }
  }

  /**
   * Handle circular reference scenarios
   */
  async handleCircularReferences(): Promise<DatabaseResult<{
    circularReferencesFound: number;
    circularReferencesFixed: number;
  }>> {
    try {
      let circularReferencesFound = 0;
      let circularReferencesFixed = 0;

      // Get all secondary contacts
      const allContacts = await this.getAllContacts();
      const secondaryContacts = allContacts.filter(c => c.linkPrecedence === LinkPrecedence.SECONDARY);

      // Check each secondary for circular references
      for (const secondary of secondaryContacts) {
        if (await this.hasCircularReference(secondary, allContacts)) {
          circularReferencesFound++;
          
          const fixResult = await this.fixCircularReference(secondary);
          if (fixResult.success) {
            circularReferencesFixed++;
          }
        }
      }

      return {
        success: true,
        data: {
          circularReferencesFound,
          circularReferencesFixed,
        },
      };
    } catch (error) {
      console.error('Error handling circular references:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling circular references',
      };
    }
  }

  /**
   * Handle contacts with null email and null phone (invalid data)
   */
  async handleInvalidContacts(): Promise<DatabaseResult<{
    invalidContactsFound: number;
    invalidContactsFixed: number;
  }>> {
    try {
      console.log('🔍 Finding invalid contacts (null email and phone)');
      
      // This would need a proper query to find contacts with both null email and phone
      const invalidContacts: Contact[] = []; // Placeholder - would need actual implementation
      
      let invalidContactsFixed = 0;

      for (const contact of invalidContacts) {
        // Try to merge with other contacts or soft delete if no linkage possible
        const fixResult = await this.fixInvalidContact(contact);
        if (fixResult.success) {
          invalidContactsFixed++;
        }
      }

      return {
        success: true,
        data: {
          invalidContactsFound: invalidContacts.length,
          invalidContactsFixed,
        },
      };
    } catch (error) {
      console.error('Error handling invalid contacts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling invalid contacts',
      };
    }
  }

  /**
   * Handle mass contact merging scenarios (bulk operations)
   */
  async handleBulkMergeScenario(
    mergeRequests: IdentifyRequest[]
  ): Promise<DatabaseResult<{
    processed: number;
    merged: number;
    created: number;
    errors: number;
  }>> {
    try {
      let processed = 0;
      let merged = 0;
      let created = 0;
      let errors = 0;

      // Process requests in batches to avoid overwhelming the database
      const batchSize = 10;
      
      for (let i = 0; i < mergeRequests.length; i += batchSize) {
        const batch = mergeRequests.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(request => this.processSingleMergeRequest(request))
        );

        for (const result of batchResults) {
          processed++;
          
          if (result.status === 'fulfilled' && result.value.success) {
            if (result.value.data?.wasExisting) {
              merged++;
            } else {
              created++;
            }
          } else {
            errors++;
          }
        }

        // Add a small delay between batches to prevent database overload
        if (i + batchSize < mergeRequests.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return {
        success: true,
        data: {
          processed,
          merged,
          created,
          errors,
        },
      };
    } catch (error) {
      console.error('Error in bulk merge scenario:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in bulk merge',
      };
    }
  }

  /**
   * Handle conflicting information scenarios
   */
  async handleConflictingInformation(
    existingContact: Contact,
    newEmail?: string | null,
    newPhoneNumber?: string | null
  ): Promise<DatabaseResult<{
    conflictResolved: boolean;
    strategy: string;
    resultingContact: Contact;
  }>> {
    try {
      // Detect conflicts
      const emailConflict = existingContact.email && newEmail && existingContact.email !== newEmail;
      const phoneConflict = existingContact.phoneNumber && newPhoneNumber && 
                           existingContact.phoneNumber !== newPhoneNumber;

      if (!emailConflict && !phoneConflict) {
        return {
          success: true,
          data: {
            conflictResolved: true,
            strategy: 'no_conflict',
            resultingContact: existingContact,
          },
        };
      }

      // Strategy 1: Create secondary contact for conflicting information
      if (emailConflict || phoneConflict) {
        console.log('⚠️ Conflict detected, creating secondary contact');
        
        const primaryContact = await this.findPrimaryInChain(existingContact);
        if (!primaryContact) {
          return {
            success: false,
            error: 'Cannot find primary contact for conflict resolution',
          };
        }

        const secondaryResult = await this.contactService.createSecondaryContact(
          primaryContact.id,
          newEmail ?? null,
          newPhoneNumber ?? null
        );

        if (secondaryResult.success && secondaryResult.data) {
          return {
            success: true,
            data: {
              conflictResolved: true,
              strategy: 'secondary_contact_created',
              resultingContact: secondaryResult.data,
            },
          };
        }
      }

      return {
        success: false,
        error: 'Unable to resolve conflicting information',
      };
    } catch (error) {
      console.error('Error handling conflicting information:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling conflicts',
      };
    }
  }

  /**
   * Handle database inconsistency scenarios
   */
  async handleDatabaseInconsistencies(): Promise<DatabaseResult<{
    inconsistenciesFound: number;
    inconsistenciesFixed: number;
    issues: string[];
  }>> {
    try {
      const issues: string[] = [];
      let inconsistenciesFound = 0;
      let inconsistenciesFixed = 0;

      // Check for orphaned secondary contacts
      const orphanCheck = await this.findOrphanedSecondaries();
      if (orphanCheck.success && orphanCheck.data && orphanCheck.data.length > 0) {
        issues.push(`Found ${orphanCheck.data.length} orphaned secondary contacts`);
        inconsistenciesFound += orphanCheck.data.length;

        // Fix orphaned secondaries
        for (const orphan of orphanCheck.data) {
          const fixResult = await this.fixOrphanedSecondary(orphan);
          if (fixResult.success) {
            inconsistenciesFixed++;
          }
        }
      }

      // Check for secondary contacts pointing to other secondaries
      const invalidSecondaryCheck = await this.findInvalidSecondaryReferences();
      if (invalidSecondaryCheck.success && invalidSecondaryCheck.data && invalidSecondaryCheck.data.length > 0) {
        issues.push(`Found ${invalidSecondaryCheck.data.length} secondary contacts with invalid references`);
        inconsistenciesFound += invalidSecondaryCheck.data.length;

        // Fix invalid secondary references
        for (const invalid of invalidSecondaryCheck.data) {
          const fixResult = await this.fixInvalidSecondaryReference(invalid);
          if (fixResult.success) {
            inconsistenciesFixed++;
          }
        }
      }

      return {
        success: true,
        data: {
          inconsistenciesFound,
          inconsistenciesFixed,
          issues,
        },
      };
    } catch (error) {
      console.error('Error handling database inconsistencies:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling inconsistencies',
      };
    }
  }

  // Private helper methods

  private async checkIfSpecificCombinationExists(
    primaryId: number,
    email: string,
    phoneNumber: string
  ): Promise<boolean> {
    try {
      const chainResult = await this.contactRepository.getAllLinkedContacts(primaryId);
      
      if (!chainResult.success || !chainResult.data) {
        return true; // Create new secondary if we can't check
      }

      // Check if this specific combination already exists
      return !chainResult.data.some(contact => 
        contact.email === email && contact.phoneNumber === phoneNumber
      );
    } catch (error) {
      console.error('Error checking specific combination:', error);
      return true; // Create new secondary if we can't check
    }
  }

  private async getAllContacts(): Promise<Contact[]> {
    // This would need proper implementation to get ALL contacts from database
    const primaryResult = await this.contactRepository.findPrimaryContacts();
    
    if (!primaryResult.success || !primaryResult.data) {
      return [];
    }

    // This is simplified - would need to get all contacts, not just primaries
    return primaryResult.data;
  }

  private async hasCircularReference(contact: Contact, allContacts: Contact[]): Promise<boolean> {
    if (!contact.linkedId) {
      return false;
    }

    const visited = new Set<number>();
    let currentId: number | null = contact.linkedId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      
      const linkedContact = allContacts.find(c => c.id === currentId);
      if (!linkedContact) {
        break;
      }

      if (linkedContact.id === contact.id) {
        return true; // Circular reference found
      }

      currentId = linkedContact.linkedId;
    }

    return false;
  }

  private async fixCircularReference(contact: Contact): Promise<DatabaseResult<boolean>> {
  
    const updateResult = await this.contactRepository.updateContactLinkage(contact.id, {
      linkPrecedence: LinkPrecedence.PRIMARY,
      linkedId: null,
    });

    return {
      success: updateResult.success,
      data: updateResult.success,
      error: updateResult.error ?? "",
    };
  }

  private async fixInvalidContact(contact: Contact): Promise<DatabaseResult<boolean>> {
    const deleteResult = await this.contactRepository.softDeleteContact(contact.id);
    return {
      success: deleteResult.success,
      data: deleteResult.success,
    };
  }

  private async processSingleMergeRequest(request: IdentifyRequest): Promise<DatabaseResult<{
    wasExisting: boolean;
  }>> {
    try {
      const existingResult = await this.contactService.findExistingContacts(
        request.email?? null,
        request.phoneNumber?? null
      );

      return {
        success: true,
        data: {
          wasExisting: existingResult.success && existingResult.data!.contacts.length > 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async findPrimaryInChain(contact: Contact): Promise<Contact | null> {
    if (contact.linkPrecedence === LinkPrecedence.PRIMARY) {
      return contact;
    }

    if (contact.linkedId) {
      const linkedResult = await this.contactRepository.findContactById(contact.linkedId);
      if (linkedResult.success && linkedResult.data) {
        return linkedResult.data;
      }
      return null;
    }

    return null;
  }

  private async findOrphanedSecondaries(): Promise<DatabaseResult<Contact[]>> {
    // This would need proper implementation to find orphaned secondaries
    return {
      success: true,
      data: [],
    };
  }

  private async findInvalidSecondaryReferences(): Promise<DatabaseResult<Contact[]>> {
    // This would need proper implementation to find invalid references
    return {
      success: true,
      data: [],
    };
  }

  private async fixOrphanedSecondary(contact: Contact): Promise<DatabaseResult<boolean>> {
    // Convert to primary
    const updateResult = await this.contactRepository.updateContactLinkage(contact.id, {
      linkPrecedence: LinkPrecedence.PRIMARY,
      linkedId: null,
    });

    return {
      success: updateResult.success,
      data: updateResult.success,
    };
  }

  private async fixInvalidSecondaryReference(contact: Contact): Promise<DatabaseResult<boolean>> {
    // Convert secondary pointing to another secondary into a primary
    const updateResult = await this.contactRepository.updateContactLinkage(contact.id, {
      linkPrecedence: LinkPrecedence.PRIMARY,
      linkedId: null,
    });

    return {
      success: updateResult.success,
      data: updateResult.success,
    };
  }
}