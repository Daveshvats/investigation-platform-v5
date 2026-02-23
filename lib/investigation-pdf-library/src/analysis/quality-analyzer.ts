/**
 * Data Quality Analyzer
 * Analyzes data quality dimensions and generates quality reports
 */

import {
  DataQualityReport,
  QualityDimension,
  DataQualityIssue,
  FieldQualityAnalysis,
  BaseEntity,
} from '../core/types';

export interface QualityAnalyzerConfig {
  requiredFields: string[];
  customValidators?: Map<string, (value: unknown) => boolean>;
}

export class QualityAnalyzer {
  private config: QualityAnalyzerConfig;

  constructor(config?: Partial<QualityAnalyzerConfig>) {
    this.config = {
      requiredFields: config?.requiredFields || ['name', 'type'],
      customValidators: config?.customValidators || new Map(),
    };
  }

  /**
   * Analyze data quality for entities
   */
  public analyze(entities: BaseEntity[]): DataQualityReport {
    const dimensions = this.calculateDimensions(entities);
    const issues = this.identifyIssues(entities);
    const fieldAnalysis = this.analyzeFields(entities);
    const recommendations = this.generateRecommendations(dimensions, issues);

    const overallScore = this.calculateOverallScore(dimensions);

    return {
      overallScore,
      dimensions,
      issues,
      recommendations,
      fieldAnalysis,
    };
  }

  /**
   * Calculate quality dimensions
   */
  private calculateDimensions(entities: BaseEntity[]): QualityDimension[] {
    return [
      this.calculateCompleteness(entities),
      this.calculateAccuracy(entities),
      this.calculateConsistency(entities),
      this.calculateTimeliness(entities),
      this.calculateValidity(entities),
      this.calculateUniqueness(entities),
    ];
  }

  /**
   * Calculate completeness dimension
   */
  private calculateCompleteness(entities: BaseEntity[]): QualityDimension {
    let totalFields = 0;
    let filledFields = 0;

    for (const entity of entities) {
      // Check required fields
      for (const field of this.config.requiredFields) {
        totalFields++;
        if (this.hasValue(entity.attributes[field])) {
          filledFields++;
        }
      }

      // Check all attributes
      for (const [key, value] of Object.entries(entity.attributes)) {
        totalFields++;
        if (this.hasValue(value)) {
          filledFields++;
        }
      }
    }

    const score = totalFields > 0 ? filledFields / totalFields : 0;

    return {
      name: 'completeness',
      score,
      weight: 0.25,
      details: `${filledFields} of ${totalFields} fields have values`,
    };
  }

  /**
   * Calculate accuracy dimension
   */
  private calculateAccuracy(entities: BaseEntity[]): QualityDimension {
    let accurateRecords = 0;
    let totalChecked = 0;

    for (const entity of entities) {
      totalChecked++;
      let isAccurate = true;

      // Check email format
      const email = entity.attributes.email as string;
      if (email && !this.isValidEmail(email)) {
        isAccurate = false;
      }

      // Check phone format
      const phone = entity.attributes.phone as string;
      if (phone && !this.isValidPhone(phone)) {
        isAccurate = false;
      }

      // Check date formats
      const dob = entity.attributes.dob as string;
      if (dob && !this.isValidDate(dob)) {
        isAccurate = false;
      }

      if (isAccurate) accurateRecords++;
    }

    const score = totalChecked > 0 ? accurateRecords / totalChecked : 1;

    return {
      name: 'accuracy',
      score,
      weight: 0.2,
      details: `${accurateRecords} of ${totalChecked} records have valid formats`,
    };
  }

  /**
   * Calculate consistency dimension
   */
  private calculateConsistency(entities: BaseEntity[]): QualityDimension {
    let consistentRecords = 0;
    let totalChecked = 0;

    // Check for naming consistency
    const nameVariants = new Map<string, Set<string>>();
    
    for (const entity of entities) {
      if (entity.name) {
        const normalized = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!nameVariants.has(normalized)) {
          nameVariants.set(normalized, new Set());
        }
        nameVariants.get(normalized)!.add(entity.name);
      }
    }

    // Count inconsistent name variants
    let inconsistentNames = 0;
    for (const [, variants] of nameVariants) {
      if (variants.size > 1) {
        inconsistentNames += variants.size;
      }
    }

    totalChecked = entities.length;
    consistentRecords = totalChecked - inconsistentNames;
    const score = totalChecked > 0 ? consistentRecords / totalChecked : 1;

    return {
      name: 'consistency',
      score,
      weight: 0.15,
      details: `${inconsistentNames} potential naming inconsistencies found`,
    };
  }

  /**
   * Calculate timeliness dimension
   */
  private calculateTimeliness(entities: BaseEntity[]): QualityDimension {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    let timelyRecords = 0;
    let totalChecked = 0;

    for (const entity of entities) {
      const updatedAt = entity.attributes.updatedAt as Date || 
                        entity.attributes.UPDATED_AT as Date;
      
      if (updatedAt) {
        totalChecked++;
        const updateDate = new Date(updatedAt);
        if (updateDate >= oneYearAgo) {
          timelyRecords++;
        }
      }
    }

    const score = totalChecked > 0 ? timelyRecords / totalChecked : 0.5;

    return {
      name: 'timeliness',
      score,
      weight: 0.15,
      details: `${timelyRecords} of ${totalChecked} records updated within last year`,
    };
  }

  /**
   * Calculate validity dimension
   */
  private calculateValidity(entities: BaseEntity[]): QualityDimension {
    let validRecords = 0;
    let totalChecked = 0;

    for (const entity of entities) {
      totalChecked++;
      let isValid = true;

      // Check entity type validity
      const validTypes = [
        'person', 'company', 'address', 'phone', 'email',
        'bank_account', 'document', 'vehicle', 'property',
        'transaction', 'website', 'ip_address', 'custom'
      ];
      
      if (!validTypes.includes(entity.type)) {
        isValid = false;
      }

      // Check name validity
      if (!entity.name || entity.name.trim().length === 0) {
        isValid = false;
      }

      // Run custom validators
      for (const [field, validator] of this.config.customValidators) {
        if (entity.attributes[field] && !validator(entity.attributes[field])) {
          isValid = false;
        }
      }

      if (isValid) validRecords++;
    }

    const score = totalChecked > 0 ? validRecords / totalChecked : 1;

    return {
      name: 'validity',
      score,
      weight: 0.15,
      details: `${validRecords} of ${totalChecked} records pass all validation rules`,
    };
  }

  /**
   * Calculate uniqueness dimension
   */
  private calculateUniqueness(entities: BaseEntity[]): QualityDimension {
    const seen = new Map<string, number>();
    let duplicates = 0;

    for (const entity of entities) {
      const key = this.generateEntityKey(entity);
      const count = seen.get(key) || 0;
      if (count > 0) {
        duplicates++;
      }
      seen.set(key, count + 1);
    }

    const uniqueCount = entities.length - duplicates;
    const score = entities.length > 0 ? uniqueCount / entities.length : 1;

    return {
      name: 'uniqueness',
      score,
      weight: 0.1,
      details: `${duplicates} potential duplicate entities found`,
    };
  }

  /**
   * Identify data quality issues
   */
  private identifyIssues(entities: BaseEntity[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const entity of entities) {
      // Check for missing required fields
      for (const field of this.config.requiredFields) {
        if (!this.hasValue(entity.attributes[field]) && field !== 'name') {
          issues.push({
            id: `issue-${issues.length}`,
            severity: 'high',
            type: 'missing',
            field,
            recordId: entity.id,
            description: `Required field '${field}' is empty`,
            impact: 'Data completeness affected',
          });
        }
      }

      // Check for invalid email
      const email = entity.attributes.email as string;
      if (email && !this.isValidEmail(email)) {
        issues.push({
          id: `issue-${issues.length}`,
          severity: 'medium',
          type: 'invalid',
          field: 'email',
          recordId: entity.id,
          description: `Invalid email format: ${email}`,
          suggestedFix: 'Verify and correct email format',
          impact: 'Contact reliability affected',
        });
      }

      // Check for invalid phone
      const phone = entity.attributes.phone as string;
      if (phone && !this.isValidPhone(phone)) {
        issues.push({
          id: `issue-${issues.length}`,
          severity: 'low',
          type: 'format_error',
          field: 'phone',
          recordId: entity.id,
          description: `Phone number may have formatting issues: ${phone}`,
          suggestedFix: 'Standardize phone format',
          impact: 'Contact reliability affected',
        });
      }

      // Check for empty name
      if (!entity.name || entity.name.trim().length === 0) {
        issues.push({
          id: `issue-${issues.length}`,
          severity: 'critical',
          type: 'missing',
          field: 'name',
          recordId: entity.id,
          description: 'Entity has no name',
          impact: 'Entity identification impossible',
        });
      }
    }

    return issues;
  }

  /**
   * Analyze field-level quality
   */
  private analyzeFields(entities: BaseEntity[]): FieldQualityAnalysis[] {
    const fieldStats = new Map<string, {
      present: number;
      valid: number;
      unique: Set<string>;
      values: Map<string, number>;
    }>();

    // Initialize stats for common fields
    const commonFields = ['name', 'email', 'phone', 'address', 'company', 'dob'];
    for (const field of commonFields) {
      fieldStats.set(field, {
        present: 0,
        valid: 0,
        unique: new Set(),
        values: new Map(),
      });
    }

    // Collect statistics
    for (const entity of entities) {
      for (const [field, stats] of fieldStats) {
        const value = entity.attributes[field];
        
        if (this.hasValue(value)) {
          stats.present++;
          
          // Check validity
          if (this.isFieldValid(field, value)) {
            stats.valid++;
          }
          
          // Track unique values
          const strValue = String(value);
          stats.unique.add(strValue);
          
          // Track value frequency
          const count = stats.values.get(strValue) || 0;
          stats.values.set(strValue, count + 1);
        }
      }
    }

    // Build analysis results
    const results: FieldQualityAnalysis[] = [];
    
    for (const [field, stats] of fieldStats) {
      const commonValues = Array.from(stats.values.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));

      results.push({
        fieldName: field,
        completeness: entities.length > 0 ? stats.present / entities.length : 0,
        validity: stats.present > 0 ? stats.valid / stats.present : 0,
        uniqueness: stats.present > 0 ? stats.unique.size / stats.present : 0,
        commonValues,
        issues: this.getFieldIssues(field, stats, entities.length),
      });
    }

    return results;
  }

  /**
   * Get field-specific issues
   */
  private getFieldIssues(
    field: string,
    stats: { present: number; valid: number; unique: Set<string>; values: Map<string, number> },
    totalRecords: number
  ): string[] {
    const issues: string[] = [];

    const missingRate = 1 - (stats.present / totalRecords);
    if (missingRate > 0.5) {
      issues.push(`High missing rate: ${(missingRate * 100).toFixed(1)}%`);
    }

    const invalidRate = stats.present > 0 ? 1 - (stats.valid / stats.present) : 0;
    if (invalidRate > 0.2) {
      issues.push(`High invalid rate: ${(invalidRate * 100).toFixed(1)}%`);
    }

    const duplicateRate = stats.present > 0 ? 1 - (stats.unique.size / stats.present) : 0;
    if (duplicateRate > 0.3) {
      issues.push(`High duplication: ${(duplicateRate * 100).toFixed(1)}%`);
    }

    return issues;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    dimensions: QualityDimension[],
    issues: DataQualityIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Based on dimensions
    for (const dim of dimensions) {
      if (dim.score < 0.5) {
        switch (dim.name) {
          case 'completeness':
            recommendations.push('Implement mandatory field validation at data entry');
            recommendations.push('Review data collection process for missing fields');
            break;
          case 'accuracy':
            recommendations.push('Add format validation for email and phone fields');
            recommendations.push('Implement real-time validation during data entry');
            break;
          case 'consistency':
            recommendations.push('Standardize naming conventions');
            recommendations.push('Implement data normalization rules');
            break;
          case 'timeliness':
            recommendations.push('Schedule regular data review and update cycles');
            recommendations.push('Implement automated data freshness checks');
            break;
          case 'validity':
            recommendations.push('Review entity type classifications');
            recommendations.push('Add business rule validations');
            break;
          case 'uniqueness':
            recommendations.push('Implement duplicate detection before insertion');
            recommendations.push('Review data integration processes');
            break;
        }
      }
    }

    // Based on critical issues
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(`Address ${criticalIssues.length} critical data quality issues immediately`);
    }

    // Deduplicate
    return [...new Set(recommendations)];
  }

  /**
   * Calculate overall score
   */
  private calculateOverallScore(dimensions: QualityDimension[]): number {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const dim of dimensions) {
      weightedScore += dim.score * dim.weight;
      totalWeight += dim.weight;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  // Helper methods
  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  private isValidDate(date: string): boolean {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }

  private isFieldValid(field: string, value: unknown): boolean {
    switch (field) {
      case 'email':
        return this.isValidEmail(String(value));
      case 'phone':
        return this.isValidPhone(String(value));
      case 'dob':
        return this.isValidDate(String(value));
      default:
        return this.hasValue(value);
    }
  }

  private generateEntityKey(entity: BaseEntity): string {
    const parts = [
      entity.type,
      entity.name?.toLowerCase().replace(/[^a-z0-9]/g, ''),
    ];
    
    // Add key attributes for uniqueness
    const email = entity.attributes.email as string;
    if (email) parts.push(email.toLowerCase());
    
    const phone = entity.attributes.phone as string;
    if (phone) parts.push(phone.replace(/[^0-9]/g, ''));

    return parts.filter(Boolean).join('|');
  }
}

export default QualityAnalyzer;
