/**
 * Smart Field Detection Engine
 * Automatically detects field types from any database schema
 * Works with any naming convention and data format
 */

export type DetectedFieldType = 
  | 'person_name'
  | 'company_name'
  | 'address'
  | 'phone'
  | 'email'
  | 'date'
  | 'datetime'
  | 'amount'
  | 'currency'
  | 'id_number'
  | 'pan_number'
  | 'aadhaar_number'
  | 'account_number'
  | 'ifsc_code'
  | 'case_number'
  | 'fir_number'
  | 'vehicle_number'
  | 'ip_address'
  | 'url'
  | 'age'
  | 'gender'
  | 'occupation'
  | 'relation'
  | 'location'
  | 'district'
  | 'state'
  | 'country'
  | 'pincode'
  | 'description'
  | 'status'
  | 'category'
  | 'priority'
  | 'unknown';

export interface FieldProfile {
  fieldName: string;
  detectedType: DetectedFieldType;
  confidence: number;
  patterns: string[];
  sampleValues: unknown[];
  statistics: {
    filled: number;
    empty: number;
    unique: number;
    total: number;
  };
}

export interface TableProfile {
  tableName: string;
  totalRecords: number;
  fields: FieldProfile[];
  detectedPurpose: 'master_data' | 'transaction_data' | 'case_data' | 'reference_data' | 'logs' | 'unknown';
  keyFields: string[];
  primaryKey?: string;
  suggestedRelationships: Array<{
    field: string;
    targetTable: string;
    targetField: string;
    confidence: number;
  }>;
}

// Detection patterns
const FIELD_PATTERNS: Record<DetectedFieldType, {
  namePatterns: RegExp[];
  valuePatterns: RegExp[];
  keywords: string[];
}> = {
  person_name: {
    namePatterns: [/name/i, /full_?name/i, /first_?name/i, /last_?name/i, /suspect/i, /victim/i, /witness/i, /accused/i, /complainant/i, /applicant/i, /father_?name/i, /mother_?name/i, /spouse/i, /nominee/i],
    valuePatterns: [/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/, /^[A-Z]+$/],
    keywords: ['name', 'suspect', 'victim', 'witness', 'accused', 'complainant', 'applicant'],
  },
  company_name: {
    namePatterns: [/company/i, /firm/i, /organization/i, /org_?name/i, /business/i, /employer/i, /establishment/i],
    valuePatterns: [/PVT\.?\s*LTD\.?$/i, /LIMITED$/i, /LLP$/i, /INC\.?$/i, /CORP\.?$/i, /CO\.?$/i],
    keywords: ['company', 'firm', 'organization', 'business', 'employer'],
  },
  address: {
    namePatterns: [/address/i, /addr/i, /location/i, /street/i, /residence/i, /perm_?addr/i, /present_?addr/i, /house/i, /building/i],
    valuePatterns: [/^\d+/, /street/i, /road/i, /colony/i, /sector/i, /village/i, /mandal/i, /district/i, /pin.*\d{6}/i],
    keywords: ['address', 'location', 'residence', 'street', 'house'],
  },
  phone: {
    namePatterns: [/phone/i, /mobile/i, /contact/i, /cell/i, /tel/i, /mob/i, /phone_?no/i],
    valuePatterns: [/^[+]?[\d\s\-\(\)]{10,15}$/, /^\d{10}$/, /^[+]?91\d{10}$/],
    keywords: ['phone', 'mobile', 'contact', 'cell'],
  },
  email: {
    namePatterns: [/email/i, /mail/i, /e_?mail/i],
    valuePatterns: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/],
    keywords: ['email', 'mail'],
  },
  date: {
    namePatterns: [/date/i, /_date$/i, /^dt_/i, /dob/i, /birth/i, /reg_?date/i, /created/i, /updated/i],
    valuePatterns: [/^\d{4}-\d{2}-\d{2}$/, /^\d{2}\/\d{2}\/\d{4}$/, /^\d{2}-\d{2}-\d{4}$/],
    keywords: ['date', 'dob', 'birth', 'created', 'updated'],
  },
  datetime: {
    namePatterns: [/datetime/i, /timestamp/i, /created_at/i, /updated_at/i, /time/i],
    valuePatterns: [/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/],
    keywords: ['datetime', 'timestamp', 'created_at', 'updated_at'],
  },
  amount: {
    namePatterns: [/amount/i, /amt/i, /value/i, /price/i, /cost/i, /fee/i, /balance/i, /deposit/i, /withdrawal/i, /transaction/i, /sum/i],
    valuePatterns: [/^[\d,]+\.?\d*$/, /^Rs\.?\s*\d/i, /^\$\s*\d/, /^INR\s*\d/i],
    keywords: ['amount', 'value', 'price', 'cost', 'balance', 'deposit'],
  },
  currency: {
    namePatterns: [/currency/i, /curr/i],
    valuePatterns: [/^INR$/i, /^USD$/i, /^EUR$/i, /^₹$/],
    keywords: ['currency'],
  },
  id_number: {
    namePatterns: [/id/i, /_id$/i, /^id_/i, /identifier/i],
    valuePatterns: [/^\d+$/, /^[A-Z0-9\-]{5,30}$/],
    keywords: ['id', 'identifier'],
  },
  pan_number: {
    namePatterns: [/pan/i, /pan_?no/i, /pan_?card/i],
    valuePatterns: [/^[A-Z]{5}\d{4}[A-Z]$/],
    keywords: ['pan'],
  },
  aadhaar_number: {
    namePatterns: [/aadhaar/i, /aadhar/i, /uid/i, /uidai/i],
    valuePatterns: [/^\d{4}\s?\d{4}\s?\d{4}$/, /^\d{12}$/],
    keywords: ['aadhaar', 'aadhar', 'uid'],
  },
  account_number: {
    namePatterns: [/account/i, /acc/i, /acc_?no/i, /bank_?acc/i],
    valuePatterns: [/^\d{9,18}$/],
    keywords: ['account', 'acc'],
  },
  ifsc_code: {
    namePatterns: [/ifsc/i, /bank_?code/i],
    valuePatterns: [/^[A-Z]{4}0[A-Z0-9]{6}$/],
    keywords: ['ifsc'],
  },
  case_number: {
    namePatterns: [/case_?no/i, /case_?id/i, /fir_?no/i, /sc_?no/i, /cc_?no/i, /crl_?no/i],
    valuePatterns: [/^\d+\/\d{4}$/, /^[A-Z]+\/\d+\/\d{4}$/, /^FIR\s*\d+/i],
    keywords: ['case', 'fir', 'sc', 'cc', 'crl'],
  },
  fir_number: {
    namePatterns: [/fir/i, /fir_?no/i, /fir_?number/i],
    valuePatterns: [/^\d+\/\d{4}$/, /^FIR\s*\d+/i],
    keywords: ['fir'],
  },
  vehicle_number: {
    namePatterns: [/vehicle/i, /reg_?no/i, /number_?plate/i, /chassis/i, /engine/i],
    valuePatterns: [/^[A-Z]{2}\d{1,2}[A-Z]{1,2}\d{4}$/i, /^[A-Z]{3}\d{4}$/i],
    keywords: ['vehicle', 'reg_no', 'number_plate'],
  },
  ip_address: {
    namePatterns: [/ip/i, /ip_?address/i],
    valuePatterns: [/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/],
    keywords: ['ip', 'ip_address'],
  },
  url: {
    namePatterns: [/url/i, /website/i, /link/i, /domain/i],
    valuePatterns: [/^https?:\/\//i, /^www\./i],
    keywords: ['url', 'website', 'link'],
  },
  age: {
    namePatterns: [/age/i, /_age$/i],
    valuePatterns: [/^\d{1,3}$/, /^(1[0-5]|[1-9]\d?)$/],
    keywords: ['age'],
  },
  gender: {
    namePatterns: [/gender/i, /sex/i],
    valuePatterns: [/^[MF]$/i, /^male$/i, /^female$/i, /^other$/i],
    keywords: ['gender', 'sex'],
  },
  occupation: {
    namePatterns: [/occupation/i, /profession/i, /job/i, /designation/i, /role/i],
    valuePatterns: [],
    keywords: ['occupation', 'profession', 'job', 'designation'],
  },
  relation: {
    namePatterns: [/relation/i, /relationship/i, /relative/i, /kin/i, /guardian/i],
    valuePatterns: [/S\/O/i, /D\/O/i, /W\/O/i, /H\/O/i, /son of/i, /daughter of/i],
    keywords: ['relation', 'relationship', 'relative', 'kin'],
  },
  location: {
    namePatterns: [/place/i, /spot/i, /area/i, /locality/i, /venue/i, /scene/i],
    valuePatterns: [],
    keywords: ['place', 'spot', 'area', 'locality', 'venue'],
  },
  district: {
    namePatterns: [/district/i, /dist/i, /zilla/i],
    valuePatterns: [],
    keywords: ['district', 'dist'],
  },
  state: {
    namePatterns: [/state/i, /province/i],
    valuePatterns: [],
    keywords: ['state'],
  },
  country: {
    namePatterns: [/country/i, /nation/i, /nationality/i],
    valuePatterns: [/^INDIA$/i, /^USA$/i, /^IN$/i],
    keywords: ['country', 'nation', 'nationality'],
  },
  pincode: {
    namePatterns: [/pin/i, /pincode/i, /postal/i, /zip/i],
    valuePatterns: [/^\d{6}$/, /^\d{5}$/],
    keywords: ['pin', 'pincode', 'postal', 'zip'],
  },
  description: {
    namePatterns: [/description/i, /desc/i, /details/i, /remarks/i, /notes/i, /narrative/i, /summary/i, /comment/i, /observation/i],
    valuePatterns: [],
    keywords: ['description', 'details', 'remarks', 'notes', 'narrative'],
  },
  status: {
    namePatterns: [/status/i, /stage/i, /state$/i],
    valuePatterns: [/^(active|inactive|pending|closed|open|resolved|under.*investigation)$/i],
    keywords: ['status', 'stage'],
  },
  category: {
    namePatterns: [/category/i, /type/i, /classification/i, /kind/i],
    valuePatterns: [],
    keywords: ['category', 'type', 'classification'],
  },
  priority: {
    namePatterns: [/priority/i, /urgency/i, /importance/i],
    valuePatterns: [/^(high|medium|low|critical|urgent)$/i],
    keywords: ['priority', 'urgency'],
  },
  unknown: {
    namePatterns: [],
    valuePatterns: [],
    keywords: [],
  },
};

/**
 * Detect field type from name and sample values
 */
export function detectFieldType(
  fieldName: string,
  sampleValues: unknown[]
): { type: DetectedFieldType; confidence: number } {
  const normalizedName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Check each field type
  for (const [type, patterns] of Object.entries(FIELD_PATTERNS)) {
    if (type === 'unknown') continue;
    
    // Check name patterns
    for (const namePattern of patterns.namePatterns) {
      if (namePattern.test(fieldName) || namePattern.test(normalizedName)) {
        return { type: type as DetectedFieldType, confidence: 0.9 };
      }
    }
    
    // Check keywords
    for (const keyword of patterns.keywords) {
      if (normalizedName.includes(keyword)) {
        return { type: type as DetectedFieldType, confidence: 0.7 };
      }
    }
  }
  
  // Check value patterns
  if (sampleValues && sampleValues.length > 0) {
    const nonEmptyValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '');
    if (nonEmptyValues.length > 0) {
      for (const [type, patterns] of Object.entries(FIELD_PATTERNS)) {
        if (type === 'unknown') continue;
        
        let matchCount = 0;
        for (const value of nonEmptyValues.slice(0, 10)) {
          const strValue = String(value);
          for (const valuePattern of patterns.valuePatterns) {
            if (valuePattern.test(strValue)) {
              matchCount++;
              break;
            }
          }
        }
        
        if (matchCount > nonEmptyValues.length * 0.5) {
          return { type: type as DetectedFieldType, confidence: 0.8 };
        }
      }
    }
  }
  
  return { type: 'unknown', confidence: 0 };
}

/**
 * Profile a table to understand its structure
 */
export function profileTable(
  tableName: string,
  records: Record<string, unknown>[]
): TableProfile {
  if (!records || records.length === 0) {
    return {
      tableName,
      totalRecords: 0,
      fields: [],
      detectedPurpose: 'unknown',
      keyFields: [],
    };
  }

  const fieldNames = Object.keys(records[0]);
  const fields: FieldProfile[] = [];

  for (const fieldName of fieldNames) {
    const sampleValues = records.slice(0, 50).map(r => r[fieldName]);
    const { type, confidence } = detectFieldType(fieldName, sampleValues);
    
    const filled = records.filter(r => r[fieldName] !== null && r[fieldName] !== undefined && r[fieldName] !== '').length;
    const uniqueValues = new Set(records.map(r => String(r[fieldName])));
    
    fields.push({
      fieldName,
      detectedType: type,
      confidence,
      patterns: [],
      sampleValues: sampleValues.slice(0, 5),
      statistics: {
        filled,
        empty: records.length - filled,
        unique: uniqueValues.size,
        total: records.length,
      },
    });
  }

  // Detect table purpose
  const detectedPurpose = detectTablePurpose(tableName, fields);
  
  // Find key fields
  const keyFields = fields
    .filter(f => f.detectedType === 'case_number' || 
                 f.detectedType === 'person_name' || 
                 f.detectedType === 'id_number' ||
                 f.fieldName.toLowerCase().includes('id'))
    .map(f => f.fieldName);

  // Find primary key candidate
  const primaryKey = fields.find(f => 
    f.fieldName.toLowerCase() === 'id' || 
    f.fieldName.toLowerCase() === `${tableName.toLowerCase()}_id`
  )?.fieldName;

  return {
    tableName,
    totalRecords: records.length,
    fields,
    detectedPurpose,
    keyFields,
    primaryKey,
    suggestedRelationships: [],
  };
}

/**
 * Detect the purpose of a table
 */
function detectTablePurpose(
  tableName: string,
  fields: FieldProfile[]
): TableProfile['detectedPurpose'] {
  const name = tableName.toLowerCase();
  const fieldTypes = fields.map(f => f.detectedType);
  
  // Check for case-related tables
  if (name.includes('case') || name.includes('fir') || name.includes('crime') || name.includes('incident')) {
    return 'case_data';
  }
  
  // Check for transaction tables
  if (name.includes('transaction') || name.includes('payment') || name.includes('transfer') || name.includes('log')) {
    if (fieldTypes.includes('amount') || fieldTypes.includes('datetime')) {
      return 'transaction_data';
    }
  }
  
  // Check for master data
  if (name.includes('master') || name.includes('master_data') || name.includes('registry')) {
    return 'master_data';
  }
  
  // Heuristic: if many names and addresses, likely master data
  const nameCount = fieldTypes.filter(t => t === 'person_name' || t === 'company_name').length;
  const addressCount = fieldTypes.filter(t => t === 'address').length;
  
  if (nameCount >= 2 && addressCount >= 1) {
    return 'master_data';
  }
  
  // If has datetime and no names, likely logs
  if (fieldTypes.includes('datetime') && nameCount === 0) {
    return 'logs';
  }
  
  return 'reference_data';
}

/**
 * Find potential relationships between tables
 */
export function findTableRelationships(
  profiles: TableProfile[]
): Array<{ sourceTable: string; sourceField: string; targetTable: string; targetField: string; confidence: number }> {
  const relationships: Array<{ sourceTable: string; sourceField: string; targetTable: string; targetField: string; confidence: number }> = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const profile1 = profiles[i];
      const profile2 = profiles[j];

      // Check for matching field types
      for (const field1 of profile1.fields) {
        for (const field2 of profile2.fields) {
          if (field1.detectedType === field2.detectedType && 
              field1.detectedType !== 'unknown' &&
              field1.detectedType !== 'description') {
            
            // Check for matching values
            const values1 = new Set(field1.sampleValues.map(v => String(v).toLowerCase()));
            const values2 = new Set(field2.sampleValues.map(v => String(v).toLowerCase()));
            
            const intersection = new Set([...values1].filter(x => values2.has(x)));
            
            if (intersection.size > 0) {
              relationships.push({
                sourceTable: profile1.tableName,
                sourceField: field1.fieldName,
                targetTable: profile2.tableName,
                targetField: field2.fieldName,
                confidence: intersection.size / Math.min(values1.size, values2.size),
              });
            }
          }
        }
      }
    }
  }

  return relationships.sort((a, b) => b.confidence - a.confidence);
}
