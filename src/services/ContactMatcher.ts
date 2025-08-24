
import { Contact } from '@prisma/client';
import { LinkPrecedence } from '../types';

/**
 * ContactMatcher handles the logic for determining how contacts should be linked
 */
export class ContactMatcher {
 
  shouldLink(contact1: Contact, contact2: Contact): boolean {
    return this.hasSharedEmail(contact1, contact2) || this.hasSharedPhone(contact1, contact2);
  }

  
  hasSharedEmail(contact1: Contact, contact2: Contact): boolean {
    return !!(contact1.email && contact2.email && contact1.email === contact2.email);
  }

  
  hasSharedPhone(contact1: Contact, contact2: Contact): boolean {
    return !!(contact1.phoneNumber && contact2.phoneNumber && contact1.phoneNumber === contact2.phoneNumber);
  }

  analyzeContactLinkage(contacts: Contact[]): {
    primaryContacts: Contact[];
    secondaryContacts: Contact[];
    linkableGroups: Contact[][];
    isolatedContacts: Contact[];
  } {
    const primaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    const secondaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.SECONDARY);

    
    const linkableGroups = this.groupLinkableContacts(contacts);
    
    
    const linkedContactIds = new Set();
    linkableGroups.forEach(group => {
      group.forEach(contact => linkedContactIds.add(contact.id));
    });

    const isolatedContacts = contacts.filter(c => !linkedContactIds.has(c.id));

    return {
      primaryContacts,
      secondaryContacts,
      linkableGroups,
      isolatedContacts,
    };
  }

  
  private groupLinkableContacts(contacts: Contact[]): Contact[][] {
    const groups: Contact[][] = [];
    const processed = new Set<number>();

    for (const contact of contacts) {
      if (processed.has(contact.id)) {
        continue;
      }

      
      const group = [contact];
      processed.add(contact.id);

      
      this.findLinkedContacts(contact, contacts, group, processed);
      
      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  
  private findLinkedContacts(
    baseContact: Contact,
    allContacts: Contact[],
    group: Contact[],
    processed: Set<number>
  ): void {
    for (const contact of allContacts) {
      if (processed.has(contact.id)) {
        continue;
      }

      if (this.shouldLink(baseContact, contact)) {
        group.push(contact);
        processed.add(contact.id);
        
        
        this.findLinkedContacts(contact, allContacts, group, processed);
      }
    }
  }

    
  determinePrimary(contacts: Contact[]): Contact {
    
    const existingPrimary = contacts.find(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    if (existingPrimary) {
      return existingPrimary;
    }

    
    return contacts.reduce((oldest, current) => 
      oldest.createdAt < current.createdAt ? oldest : current
    );
  }

  
  hasExactMatch(contacts: Contact[], email?: string | null, phoneNumber?: string | null): boolean {
    return contacts.some(contact => 
      contact.email === email && contact.phoneNumber === phoneNumber
    );
  }

  
  wouldAddValue(
    existingContacts: Contact[],
    email?: string | null,
    phoneNumber?: string | null
  ): boolean {
   
    if (this.hasExactMatch(existingContacts, email, phoneNumber)) {
      return false;
    }

    
    const hasNewEmail = Boolean(email) && !existingContacts.some(c => c.email === email);
    const hasNewPhone = Boolean(phoneNumber) && !existingContacts.some(c => c.phoneNumber === phoneNumber);

    return hasNewEmail || hasNewPhone;
  }

  
  findMatchingCriteria(
    contacts: Contact[],
    email?: string | null,
    phoneNumber?: string | null
  ): {
    matchingEmails: string[];
    matchingPhones: string[];
    hasEmailMatch: boolean;
    hasPhoneMatch: boolean;
  } {
    const matchingEmails: string[] = [];
    const matchingPhones: string[] = [];

    for (const contact of contacts) {
      if (email && contact.email === email) {
        matchingEmails.push(contact.email);
      }
      if (phoneNumber && contact.phoneNumber === phoneNumber) {
        matchingPhones.push(contact.phoneNumber);
      }
    }

    return {
      matchingEmails: Array.from(new Set(matchingEmails)),
      matchingPhones: Array.from(new Set(matchingPhones)),
      hasEmailMatch: matchingEmails.length > 0,
      hasPhoneMatch: matchingPhones.length > 0,
    };
  }

  
  shouldMergePrimaryContacts(primary1: Contact, primary2: Contact): {
    shouldMerge: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  } {
    if (primary1.id === primary2.id) {
      return {
        shouldMerge: false,
        reason: 'Same contact',
        confidence: 'high',
      };
    }

    
    if (this.hasSharedEmail(primary1, primary2)) {
      return {
        shouldMerge: true,
        reason: 'Shared email address',
        confidence: 'high',
      };
    }

    if (this.hasSharedPhone(primary1, primary2)) {
      return {
        shouldMerge: true,
        reason: 'Shared phone number',
        confidence: 'high',
      };
    }

    return {
      shouldMerge: false,
      reason: 'No shared contact information',
      confidence: 'high',
    };
  }

  
  scoreContactMatch(
    contact: Contact,
    email?: string | null,
    phoneNumber?: string | null
  ): {
    score: number;
    factors: string[];
    isExactMatch: boolean;
  } {
    let score = 0;
    const factors: string[] = [];

    
    if (contact.email === email && contact.phoneNumber === phoneNumber) {
      return {
        score: 100,
        factors: ['Exact match: same email and phone'],
        isExactMatch: true,
      };
    }

    
    if (email && contact.email === email) {
      score += 50;
      factors.push('Email match');
    }

    
    if (phoneNumber && contact.phoneNumber === phoneNumber) {
      score += 50;
      factors.push('Phone match');
    }

    
    if (email && !contact.email && contact.phoneNumber === phoneNumber) {
      score += 30;
      factors.push('Phone match with missing email');
    }

    if (phoneNumber && !contact.phoneNumber && contact.email === email) {
      score += 30;
      factors.push('Email match with missing phone');
    }

    return {
      score,
      factors,
      isExactMatch: false,
    };
  }

  
  findBestMatch(
    contacts: Contact[],
    email?: string | null,
    phoneNumber?: string | null
  ): {
    bestMatch: Contact | null;
    score: number;
    factors: string[];
  } {
    if (contacts.length === 0) {
      return {
        bestMatch: null,
        score: 0,
        factors: [],
      };
    }

    let bestMatch: Contact | null = null;
    let bestScore = 0;
    let bestFactors: string[] = [];

    for (const contact of contacts) {
      const { score, factors } = this.scoreContactMatch(contact, email, phoneNumber);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = contact;
        bestFactors = factors;
      }
    }

    return {
      bestMatch,
      score: bestScore,
      factors: bestFactors,
    };
  }

  
  validateContactChain(contacts: Contact[]): {
    isValid: boolean;
    issues: string[];
    primaryCount: number;
    orphanedSecondaries: Contact[];
  } {
    const issues: string[] = [];
    const primaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
    const secondaryContacts = contacts.filter(c => c.linkPrecedence === LinkPrecedence.SECONDARY);
    
    const primaryCount = primaryContacts.length;

    
    if (primaryCount > 1) {
      issues.push(`Multiple primary contacts found: ${primaryCount}`);
    }

    
    const orphanedSecondaries = secondaryContacts.filter(secondary => {
      const linkedPrimary = contacts.find(c => c.id === secondary.linkedId);
      return !linkedPrimary || linkedPrimary.linkPrecedence !== LinkPrecedence.PRIMARY;
    });

    if (orphanedSecondaries.length > 0) {
      issues.push(`Orphaned secondary contacts: ${orphanedSecondaries.length}`);
    }

    
    const invalidSecondaries = secondaryContacts.filter(secondary => {
      const linkedContact = contacts.find(c => c.id === secondary.linkedId);
      return linkedContact && linkedContact.linkPrecedence === LinkPrecedence.SECONDARY;
    });

    if (invalidSecondaries.length > 0) {
      issues.push(`Secondary contacts linked to other secondaries: ${invalidSecondaries.length}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      primaryCount,
      orphanedSecondaries,
    };
  }
}