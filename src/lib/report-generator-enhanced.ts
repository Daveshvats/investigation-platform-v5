/**
 * Enhanced PDF Report Generator
 * Fixed: No duplications, proper text rendering
 */

import { jsPDF } from 'jspdf';

// ============================================================================
// TYPES
// ============================================================================

interface SearchResult {
  id: string;
  table?: string;
  tableName: string;
  record?: Record<string, unknown>;
  data?: Record<string, unknown>;
  matchedFields?: string[];
  matchedEntities?: string[];
  score?: number;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  entityType: string;
  value: string;
  connections: string[];
  occurrences: number;
  sources: string[];
  riskScore?: number;
}

interface CorrelationGraph {
  nodes: GraphNode[];
  edges: any[];
}

interface Insights {
  highValueMatches?: number;
  totalConnections?: number;
  entityBreakdown?: Record<string, number>;
  topEntities?: Array<{ value: string; type: string; occurrences: number }>;
  redFlags?: string[];
  patterns?: string[];
  recommendations?: string[];
}

interface Extraction {
  entities: Array<{
    type: string;
    value: string;
    priority: string;
    confidence: number;
  }>;
  highValue?: Array<{ type: string; value: string }>;
  mediumValue?: Array<{ type: string; value: string }>;
  lowValue?: Array<{ type: string; value: string }>;
}

interface ReportData {
  query: string;
  extraction?: Extraction;
  results: SearchResult[];
  correlationGraph?: CorrelationGraph | null;
  insights?: Insights;
  metadata?: {
    searchTime?: number;
    entitiesSearched?: number;
    iterationsPerformed?: number;
    totalRecordsSearched?: number;
    apiCalls?: number;
    totalFetched?: number;
    v2Enabled?: boolean;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  primary: [31, 78, 121],
  secondary: [66, 133, 244],
  accent: [237, 125, 49],
  success: [40, 167, 69],
  danger: [220, 53, 69],
  warning: [255, 193, 7],
  dark: [33, 37, 41],
  gray: [108, 117, 125],
  lightGray: [248, 249, 250],
  white: [255, 255, 255],
  headerBg: [240, 240, 240],
  highlightBg: [255, 255, 200],
};

const SKIP_COLUMNS = new Set([
  'global_id',
  's_indx',
  'is_updated',
  'is_deleted',
  'updated_at',
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRecordData(result: SearchResult): Record<string, unknown> {
  return result.data || result.record || {};
}

function categorizeResults(results: SearchResult[]): Record<string, SearchResult[]> {
  const categories: Record<string, SearchResult[]> = {};
  for (const result of results) {
    const table = result.tableName || result.table || 'unknown';
    if (!categories[table]) {
      categories[table] = [];
    }
    categories[table].push(result);
  }
  return categories;
}

function filterRecordFields(record: Record<string, unknown>): Array<[string, string]> {
  const filtered: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(record)) {
    const keyLower = key.toLowerCase();
    if (SKIP_COLUMNS.has(keyLower)) continue;
    if (value === null || value === undefined) continue;
    
    let displayValue: string;
    if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
    } else if (value instanceof Date) {
      displayValue = value.toLocaleString();
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else {
      displayValue = String(value);
    }
    
    if (!displayValue.trim()) continue;
    filtered.push([key, displayValue]);
  }
  return filtered;
}

function extractAllInfo(results: SearchResult[]) {
  const info = {
    names: new Set<string>(),
    phones: new Set<string>(),
    emails: new Set<string>(),
    addresses: new Set<string>(),
    companies: new Set<string>(),
    locations: new Set<string>(),
    websites: new Set<string>(),
    designations: new Set<string>(),
  };
  
  const patterns = {
    phone: ['phone', 'mobile', 'contact', 'telephone', 'cell'],
    email: ['email', 'mail', 'e_mail'],
    address: ['address', 'add', 'street', 'addr'],
    name: ['name', 'owner', 'contact_person'],
    company: ['company', 'business', 'organization', 'firm'],
    location: ['city', 'state', 'country', 'region', 'area', 'district', 'pincode', 'zipcode'],
    website: ['website', 'url', 'web', 'domain'],
    designation: ['designation', 'title', 'position', 'role'],
  };
  
  for (const result of results) {
    const r = getRecordData(result);
    for (const [key, value] of Object.entries(r)) {
      if (value === null || value === undefined || value === '') continue;
      const keyLower = key.toLowerCase();
      const valueStr = String(value).trim();
      if (!valueStr || valueStr === 'null') continue;
      
      if (patterns.phone.some(p => keyLower.includes(p)) && valueStr.length >= 6) {
        info.phones.add(valueStr);
      } else if (patterns.email.some(p => keyLower.includes(p)) && valueStr.includes('@')) {
        info.emails.add(valueStr);
      } else if (patterns.address.some(p => keyLower.includes(p))) {
        info.addresses.add(valueStr);
      } else if (patterns.name.some(p => keyLower.includes(p))) {
        info.names.add(valueStr);
      } else if (patterns.company.some(p => keyLower.includes(p))) {
        info.companies.add(valueStr);
      } else if (patterns.location.some(p => keyLower.includes(p))) {
        info.locations.add(valueStr);
      } else if (patterns.website.some(p => keyLower.includes(p))) {
        info.websites.add(valueStr);
      } else if (patterns.designation.some(p => keyLower.includes(p))) {
        info.designations.add(valueStr);
      }
    }
  }
  return info;
}

// ============================================================================
// PDF GENERATOR CLASS
// ============================================================================

export class EnhancedReportGenerator {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number;
  private currentY: number;
  private highlightTerms: Set<string>;
  private totalPages: number = 1;

  constructor() {
    this.doc = new jsPDF('p', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.margin = 12;
    this.currentY = this.margin;
    this.highlightTerms = new Set<string>();
  }

  private setHighlightTerms(extraction?: Extraction, query?: string): void {
    this.highlightTerms = new Set<string>();
    if (extraction?.entities) {
      for (const entity of extraction.entities) {
        this.highlightTerms.add(entity.value.toLowerCase());
      }
    }
    if (query) {
      const words = query.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 3) this.highlightTerms.add(word);
      }
    }
  }

  private newPage(): void {
    this.doc.addPage();
    this.totalPages++;
    this.currentY = this.margin;
  }

  private checkBreak(needed: number): void {
    if (this.currentY + needed > this.pageHeight - 20) {
      this.newPage();
    }
  }

  private sectionTitle(title: string): void {
    this.checkBreak(15);
    this.doc.setFillColor(...COLORS.secondary);
    this.doc.rect(this.margin, this.currentY, 3, 7, 'F');
    this.doc.setFontSize(12);
    this.doc.setTextColor(...COLORS.dark);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin + 5, this.currentY + 5);
    this.currentY += 10;
  }

  private text(text: string, size: number = 10): void {
    this.doc.setFontSize(size);
    this.doc.setTextColor(...COLORS.dark);
    this.doc.setFont('helvetica', 'normal');
    const lines = this.doc.splitTextToSize(text, this.pageWidth - 2 * this.margin);
    this.doc.text(lines, this.margin, this.currentY);
    this.currentY += lines.length * (size * 0.4) + 3;
  }

  private keyValue(items: Array<[string, string]>): void {
    const keyW = 35;
    const valW = this.pageWidth - 2 * this.margin - keyW - 5;
    for (const [key, val] of items) {
      this.checkBreak(6);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.setTextColor(...COLORS.primary);
      this.doc.text(key + ':', this.margin, this.currentY + 3);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(...COLORS.dark);
      const lines = this.doc.splitTextToSize(val, valW);
      this.doc.text(lines, this.margin + keyW, this.currentY + 3);
      this.currentY += Math.max(lines.length * 4, 5);
    }
    this.currentY += 3;
  }

  private drawRecord(num: number, fields: Array<[string, string]>): void {
    this.checkBreak(20);
    
    // Record header
    this.doc.setFillColor(...COLORS.headerBg);
    this.doc.rect(this.margin, this.currentY, this.pageWidth - 2 * this.margin, 7, 'F');
    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.dark);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(`Record #${num}  ${fields.length} fields`, this.margin + 3, this.currentY + 5);
    this.currentY += 9;

    const keyW = 40;
    const valW = this.pageWidth - 2 * this.margin - keyW - 5;

    this.doc.setFontSize(8);
    for (const [key, val] of fields) {
      this.checkBreak(6);
      
      this.doc.setFont('helvetica', 'bold');
      this.doc.setTextColor(...COLORS.primary);
      const k = key.length > 18 ? key.substring(0, 15) + '...' : key;
      this.doc.text(k, this.margin, this.currentY + 3);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(...COLORS.dark);
      
      const lowerVal = val.toLowerCase();
      const shouldHL = Array.from(this.highlightTerms).some(t => lowerVal.includes(t));
      
      const lines = this.doc.splitTextToSize(val, valW);
      if (shouldHL) {
        const maxW = Math.max(...lines.map(l => this.doc.getTextWidth(l))) + 2;
        this.doc.setFillColor(...COLORS.highlightBg);
        this.doc.rect(this.margin + keyW - 1, this.currentY - 1, Math.min(maxW, valW + 2), lines.length * 4 + 2, 'F');
        this.doc.setTextColor(...COLORS.dark);
      }
      this.doc.text(lines, this.margin + keyW, this.currentY + 3);
      this.currentY += Math.max(lines.length * 4, 5);
    }
    this.currentY += 4;
  }

  async generateReport(data: ReportData): Promise<Buffer> {
    this.setHighlightTerms(data.extraction, data.query);
    const allInfo = extractAllInfo(data.results || []);
    const categories = categorizeResults(data.results || []);

    // ========== COVER PAGE ==========
    this.doc.setFillColor(...COLORS.primary);
    this.doc.rect(0, 0, this.pageWidth, 35, 'F');
    this.doc.setFontSize(10);
    this.doc.setTextColor(...COLORS.white);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('HIGHPERF DESKTOP', this.margin, 10);
    this.doc.setFontSize(22);
    this.doc.text('Investigation Report', this.pageWidth / 2, 25, { align: 'center' });
    
    this.currentY = 45;
    
    // Query box
    this.doc.setFillColor(...COLORS.lightGray);
    this.doc.roundedRect(this.margin, this.currentY, this.pageWidth - 2 * this.margin, 20, 2, 2, 'F');
    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.gray);
    this.doc.text('Search Query:', this.margin + 4, this.currentY + 6);
    this.doc.setFontSize(11);
    this.doc.setTextColor(...COLORS.dark);
    this.doc.setFont('helvetica', 'bold');
    const qLines = this.doc.splitTextToSize(`"${data.query}"`, this.pageWidth - 2 * this.margin - 8);
    this.doc.text(qLines.slice(0, 2), this.margin + 4, this.currentY + 13);
    this.currentY += 28;

    // Stats
    const stats = [
      { label: 'Records', value: String(data.results?.length || 0), color: COLORS.secondary },
      { label: 'Sources', value: String(Object.keys(categories).length), color: COLORS.success },
      { label: 'API Calls', value: String(data.metadata?.apiCalls || 0), color: COLORS.accent },
      { label: 'Time', value: `${data.metadata?.searchTime || 0}ms`, color: COLORS.primary },
    ];
    const boxW = (this.pageWidth - 2 * this.margin - 12) / 4;
    let x = this.margin;
    for (const s of stats) {
      this.doc.setFillColor(...s.color);
      this.doc.roundedRect(x, this.currentY, boxW, 20, 2, 2, 'F');
      this.doc.setTextColor(...COLORS.white);
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(s.value, x + boxW / 2, this.currentY + 9, { align: 'center' });
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(s.label, x + boxW / 2, this.currentY + 16, { align: 'center' });
      x += boxW + 4;
    }
    this.currentY += 28;

    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.gray);
    this.doc.text(`Generated: ${new Date().toLocaleString()}`, this.margin, this.currentY);

    // ========== CONTENT PAGES ==========
    this.newPage();

    // 1. Executive Summary
    this.sectionTitle('1. Executive Summary');
    const summary: string[] = [
      `This report presents findings from: "${data.query}".`,
      `Found ${data.results?.length || 0} records from ${Object.keys(categories).length} source(s).`,
    ];
    const found: string[] = [];
    if (allInfo.names.size) found.push(`${allInfo.names.size} name(s)`);
    if (allInfo.phones.size) found.push(`${allInfo.phones.size} phone(s)`);
    if (allInfo.emails.size) found.push(`${allInfo.emails.size} email(s)`);
    if (allInfo.addresses.size) found.push(`${allInfo.addresses.size} address(es)`);
    if (found.length) summary.push(`Key info: ${found.join(', ')}.`);
    if (data.correlationGraph?.nodes?.length) {
      summary.push(`${data.correlationGraph.nodes.length} entities, ${data.correlationGraph.edges?.length || 0} connections.`);
    }
    this.text(summary.join(' '));

    // 2. Entities
    if (data.extraction?.entities?.length) {
      this.sectionTitle('2. Entities Extracted');
      this.text('Keywords extracted from query:', 9);
      
      // Table header
      const cols = [30, 100, 30];
      this.doc.setFillColor(...COLORS.primary);
      let px = this.margin;
      for (const h of ['Type', 'Value', 'Priority']) {
        this.doc.rect(px, this.currentY, cols[px === this.margin ? 0 : px === this.margin + 30 ? 1 : 2], 7, 'F');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...COLORS.white);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(h, px + 2, this.currentY + 5);
        px += cols[px === this.margin ? 0 : 1];
      }
      this.currentY += 7;
      
      for (const e of data.extraction.entities) {
        this.checkBreak(8);
        this.doc.setFillColor(...COLORS.lightGray);
        this.doc.rect(this.margin, this.currentY, 160, 6, 'F');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...COLORS.dark);
        this.doc.setFont('helvetica', 'normal');
        this.doc.text(e.type.toUpperCase(), this.margin + 2, this.currentY + 4);
        
        const v = e.value.length > 45 ? e.value.substring(0, 42) + '...' : e.value;
        this.doc.setFillColor(...COLORS.highlightBg);
        this.doc.rect(this.margin + 30, this.currentY + 0.5, this.doc.getTextWidth(v) + 4, 5, 'F');
        this.doc.text(v, this.margin + 32, this.currentY + 4);
        
        const pc = e.priority === 'HIGH' ? COLORS.danger : e.priority === 'MEDIUM' ? COLORS.warning : COLORS.success;
        this.doc.setTextColor(...pc);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(e.priority, this.margin + 132, this.currentY + 4);
        this.currentY += 7;
      }
      this.currentY += 5;
    }

    // 3. Key Info
    const hasKey = allInfo.names.size || allInfo.phones.size || allInfo.emails.size || allInfo.addresses.size || allInfo.companies.size || allInfo.locations.size;
    if (hasKey) {
      this.sectionTitle('3. Key Information Found');
      const items: Array<[string, string]> = [];
      if (allInfo.names.size) items.push(['Names', Array.from(allInfo.names).slice(0, 10).join(', ')]);
      if (allInfo.phones.size) items.push(['Phones', Array.from(allInfo.phones).slice(0, 10).join(', ')]);
      if (allInfo.emails.size) items.push(['Emails', Array.from(allInfo.emails).slice(0, 10).join(', ')]);
      if (allInfo.addresses.size) items.push(['Addresses', Array.from(allInfo.addresses).slice(0, 5).join('; ')]);
      if (allInfo.companies.size) items.push(['Companies', Array.from(allInfo.companies).slice(0, 10).join(', ')]);
      if (allInfo.locations.size) items.push(['Locations', Array.from(allInfo.locations).slice(0, 10).join(', ')]);
      this.keyValue(items);
    }

    // 4. Data Records
    this.sectionTitle('4. Complete Data Records');
    this.text('Full records with highlighted matches:', 9);

    for (const [table, records] of Object.entries(categories)) {
      this.checkBreak(30);
      this.doc.setFillColor(...COLORS.secondary);
      this.doc.rect(this.margin, this.currentY, this.pageWidth - 2 * this.margin, 8, 'F');
      this.doc.setFontSize(10);
      this.doc.setTextColor(...COLORS.white);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`Table: ${table} (${records.length} records)`, this.margin + 3, this.currentY + 5);
      this.currentY += 12;

      let n = 1;
      for (const rec of records) {
        this.drawRecord(n, filterRecordFields(getRecordData(rec)));
        n++;
      }
      this.currentY += 5;
    }

    // 5. Relationships
    if (data.correlationGraph?.nodes?.length) {
      this.newPage();
      this.sectionTitle('5. Relationships & Connections');
      this.text(`${data.correlationGraph.nodes.length} entities, ${data.correlationGraph.edges?.length || 0} connections.`);
      
      const top = [...data.correlationGraph.nodes].sort((a, b) => b.connections.length - a.connections.length).slice(0, 15);
      this.doc.setFontSize(9);
      this.doc.setTextColor(...COLORS.gray);
      this.doc.text('Most Connected:', this.margin, this.currentY);
      this.currentY += 6;
      
      for (let i = 0; i < top.length; i++) {
        this.checkBreak(6);
        const node = top[i];
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...COLORS.primary);
        this.doc.text(`${i + 1}.`, this.margin, this.currentY + 3);
        this.doc.setFont('helvetica', 'normal');
        
        const hl = Array.from(this.highlightTerms).some(t => node.label.toLowerCase().includes(t));
        if (hl) {
          const tw = this.doc.getTextWidth(`${node.label} (${node.entityType}) - ${node.connections.length} connections`) + 2;
          this.doc.setFillColor(...COLORS.highlightBg);
          this.doc.rect(this.margin + 5, this.currentY - 1, tw, 5, 'F');
        }
        this.doc.setTextColor(...COLORS.dark);
        this.doc.text(`${node.label} (${node.entityType}) - ${node.connections.length} connections`, this.margin + 8, this.currentY + 3);
        this.currentY += 5;
      }
    }

    // 6. Risk
    if (data.insights?.redFlags?.length || data.insights?.patterns?.length) {
      this.checkBreak(30);
      this.sectionTitle('6. Risk Indicators & Patterns');
      
      if (data.insights.redFlags?.length) {
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.danger);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`Red Flags (${data.insights.redFlags.length}):`, this.margin, this.currentY);
        this.currentY += 6;
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(...COLORS.dark);
        for (const f of data.insights.redFlags) {
          this.checkBreak(6);
          this.doc.setTextColor(...COLORS.danger);
          this.doc.text('•', this.margin, this.currentY + 3);
          this.doc.setTextColor(...COLORS.dark);
          const l = this.doc.splitTextToSize(f, this.pageWidth - 2 * this.margin - 8);
          this.doc.text(l, this.margin + 5, this.currentY + 3);
          this.currentY += l.length * 4 + 2;
        }
        this.currentY += 5;
      }
      
      if (data.insights.patterns?.length) {
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.warning);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('Patterns:', this.margin, this.currentY);
        this.currentY += 6;
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(...COLORS.dark);
        for (const p of data.insights.patterns) {
          this.checkBreak(6);
          this.doc.setTextColor(...COLORS.warning);
          this.doc.text('•', this.margin, this.currentY + 3);
          this.doc.setTextColor(...COLORS.dark);
          const l = this.doc.splitTextToSize(p, this.pageWidth - 2 * this.margin - 8);
          this.doc.text(l, this.margin + 5, this.currentY + 3);
          this.currentY += l.length * 4 + 2;
        }
      }
    }

    // 7. Recommendations
    if (data.insights?.recommendations?.length) {
      this.checkBreak(20);
      this.sectionTitle('7. Recommendations');
      for (let i = 0; i < data.insights.recommendations.length; i++) {
        this.checkBreak(8);
        this.doc.setFontSize(9);
        this.doc.setTextColor(...COLORS.primary);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${i + 1}.`, this.margin, this.currentY + 3);
        this.doc.setTextColor(...COLORS.dark);
        this.doc.setFont('helvetica', 'normal');
        const l = this.doc.splitTextToSize(data.insights.recommendations[i], this.pageWidth - 2 * this.margin - 10);
        this.doc.text(l, this.margin + 8, this.currentY + 3);
        this.currentY += l.length * 4 + 4;
      }
    }

    // 8. Metadata
    this.checkBreak(40);
    this.sectionTitle('8. Search Metadata');
    this.keyValue([
      ['Search Time', `${data.metadata?.searchTime || 0}ms`],
      ['API Calls', String(data.metadata?.apiCalls || 0)],
      ['Records Fetched', String(data.metadata?.totalFetched || data.results?.length || 0)],
      ['Iterations', String(data.metadata?.iterationsPerformed || 0)],
      ['Entities Searched', String(data.metadata?.entitiesSearched || 0)],
      ['V2 Engine', data.metadata?.v2Enabled ? 'Enabled' : 'Disabled'],
    ]);

    // Add footers ONCE
    for (let i = 1; i <= this.totalPages; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setTextColor(...COLORS.gray);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(
        'Confidential',
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: 'center' }
      );
      this.doc.text(`${i} / ${this.totalPages}`, this.pageWidth - this.margin, this.pageHeight - 10, { align: 'right' });
    }

    return Buffer.from(this.doc.output('arraybuffer'));
  }
}

export const enhancedReportGenerator = new EnhancedReportGenerator();
