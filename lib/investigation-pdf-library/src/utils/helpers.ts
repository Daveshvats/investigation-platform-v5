/**
 * Utility Helper Functions
 * Common functions for data processing, string matching, and ID generation
 */

import { BaseEntity, EntityType } from '../core/types';

/**
 * Normalize a string for comparison
 */
export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\s\-_.,;:'"()]+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Generate a unique entity ID
 */
export function generateEntityId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract entities from a data record
 */
export function extractEntitiesFromRecord(
  record: Record<string, unknown>,
  sourceTable: string
): BaseEntity[] {
  const entities: BaseEntity[] = [];
  const id = generateEntityId();

  // Field mappings for common entity types
  const personFields = ['name', 'NAME', 'first_name', 'FIRST_NAME', 'customer_name', 'client_name'];
  const companyFields = ['company_name', 'COMPANY_NAME', 'company', 'organization'];
  const addressFields = ['address', 'ADDRESS', 'CADD1', 'CADD2', 'ADD1', 'ADD2'];
  const phoneFields = ['phone', 'PHONE', 'mobile', 'MOBILE', 'contact', 'CMOBILE'];
  const emailFields = ['email', 'EMAIL', 'email1', 'EMAIL1'];
  const bankAccountFields = ['bank_account', 'BANK_ACCNO', 'account_number'];

  // Extract person entity
  const personName = findFieldValue(record, personFields);
  if (personName && typeof personName === 'string') {
    entities.push({
      id: generateEntityId(),
      type: 'person',
      name: personName,
      attributes: {
        ...extractRelevantFields(record, ['father_name', 'FATHER_HUSBAND_NAME', 'dob', 'DOB', 'gender']),
        address: combineFields(record, addressFields),
        phone: findFieldValue(record, phoneFields),
        email: findFieldValue(record, emailFields),
        company: findFieldValue(record, companyFields),
        createdAt: parseDate(record.OPEN_DATE || record.createdAt || record.created_at),
        sourceTable,
      },
      sources: [sourceTable],
    });
  }

  // Extract company entity
  const companyName = findFieldValue(record, companyFields);
  if (companyName && typeof companyName === 'string') {
    entities.push({
      id: generateEntityId(),
      type: 'company',
      name: companyName,
      attributes: {
        ...extractRelevantFields(record, ['designation', 'DESIGNATION', 'industry', 'country', 'state', 'city']),
        address: combineFields(record, addressFields),
        phone: findFieldValue(record, phoneFields),
        email: findFieldValue(record, emailFields),
        website: findFieldValue(record, ['website', 'WEBSITE']),
        createdAt: parseDate(record.OPEN_DATE || record.createdAt || record.created_at),
        sourceTable,
      },
      sources: [sourceTable],
    });
  }

  // Extract bank account entity if present
  const bankAccount = findFieldValue(record, bankAccountFields);
  if (bankAccount && typeof bankAccount === 'string') {
    entities.push({
      id: generateEntityId(),
      type: 'bank_account',
      name: `Account: ${bankAccount}`,
      attributes: {
        accountNumber: bankAccount,
        bankName: findFieldValue(record, ['bank_name', 'BANK_NAME']),
        ifsc: findFieldValue(record, ['ifsc', 'IFSC']),
        sourceTable,
      },
      sources: [sourceTable],
    });
  }

  return entities;
}

/**
 * Find a field value from record using multiple possible field names
 */
function findFieldValue(
  record: Record<string, unknown>,
  fieldNames: string[]
): unknown {
  for (const field of fieldNames) {
    if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
      return record[field];
    }
  }
  return undefined;
}

/**
 * Extract relevant fields from record
 */
function extractRelevantFields(
  record: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
      result[field.toLowerCase()] = record[field];
    }
  }
  return result;
}

/**
 * Combine multiple fields into one string
 */
function combineFields(
  record: Record<string, unknown>,
  fieldNames: string[]
): string {
  const parts: string[] = [];
  for (const field of fieldNames) {
    if (record[field] && typeof record[field] === 'string' && record[field].trim()) {
      parts.push(record[field].trim());
    }
  }
  return parts.join(', ');
}

/**
 * Parse date from various formats
 */
export function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  
  if (value instanceof Date) return value;
  
  if (typeof value === 'string') {
    // Try ISO format
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) return isoDate;
    
    // Try DD/MM/YYYY format
    const dmyMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmyMatch) {
      return new Date(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`);
    }
    
    // Try MM/DD/YYYY format
    const mdyMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mdyMatch) {
      return new Date(`${mdyMatch[3]}-${mdyMatch[1]}-${mdyMatch[2]}`);
    }
  }
  
  return undefined;
}

/**
 * Calculate date proximity (days between dates)
 */
export function calculateDateProximity(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Format date for display
 */
export function formatDate(date: Date | undefined, format: 'short' | 'long' = 'short'): string {
  if (!date) return '—';
  
  const options: Intl.DateTimeFormatOptions = format === 'long'
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  
  return date.toLocaleDateString('en-US', options);
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Truncate string with ellipsis
 */
export function truncateString(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Sort by multiple fields
 */
export function sortBy<T>(
  array: T[],
  ...keys: Array<{ key: keyof T; order: 'asc' | 'desc' }>
): T[] {
  return [...array].sort((a, b) => {
    for (const { key, order } of keys) {
      const aVal = a[key];
      const bVal = b[key];
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/**
 * Get entity type display name
 */
export function getEntityTypeDisplayName(type: EntityType): string {
  const displayNames: Record<EntityType, string> = {
    person: 'Person',
    company: 'Company',
    address: 'Address',
    phone: 'Phone Number',
    email: 'Email Address',
    bank_account: 'Bank Account',
    document: 'Document',
    vehicle: 'Vehicle',
    property: 'Property',
    transaction: 'Transaction',
    website: 'Website',
    ip_address: 'IP Address',
    custom: 'Custom Entity',
  };
  return displayNames[type] || type;
}

/**
 * Generate random color for entity types
 */
export function getEntityTypeColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    person: '#4A90D9',
    company: '#E67E22',
    address: '#27AE60',
    phone: '#9B59B6',
    email: '#3498DB',
    bank_account: '#E74C3C',
    document: '#F39C12',
    vehicle: '#1ABC9C',
    property: '#8E44AD',
    transaction: '#2ECC71',
    website: '#16A085',
    ip_address: '#D35400',
    custom: '#7F8C8D',
  };
  return colors[type] || colors.custom;
}

/**
 * Convert severity to color
 */
export function getSeverityColor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  const colors = {
    low: '#3498DB',
    medium: '#F39C12',
    high: '#E74C3C',
    critical: '#C0392B',
  };
  return colors[severity];
}

/**
 * Escape XML/HTML special characters
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
