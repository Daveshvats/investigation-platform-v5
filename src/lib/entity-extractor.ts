/**
 * Advanced Regex-Based Entity Extractor
 * Designed to minimize AI dependency for entity extraction
 * Supports Indian context: names, phones, addresses, PAN, Aadhaar, etc.
 */

// ============================================================================
// ENTITY TYPES AND INTERFACES
// ============================================================================

export type EntityPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type EntityType =
  | 'phone'
  | 'email'
  | 'pan_number'
  | 'aadhaar_number'
  | 'account_number'
  | 'ifsc_code'
  | 'vehicle_number'
  | 'ip_address'
  | 'url'
  | 'address'
  | 'name'
  | 'company'
  | 'location'
  | 'date'
  | 'amount'
  | 'id_number'
  | 'pincode';

export interface Entity {
  type: EntityType;
  value: string;
  originalText: string;
  priority: EntityPriority;
  confidence: number;
  position?: { start: number; end: number };
  metadata?: Record<string, unknown>;
}

export interface ExtractedEntities {
  entities: Entity[];
  highValue: Entity[];
  mediumValue: Entity[];
  lowValue: Entity[];
  relationships: EntityRelationship[];
  originalQuery: string;
  extractionTime: number;
}

export interface EntityRelationship {
  entity1: Entity;
  entity2: Entity;
  relationshipType: 'location' | 'association' | 'family' | 'contact' | 'ownership' | 'employment';
  context: string;
}

// ============================================================================
// PRIORITY CLASSIFICATION
// ============================================================================

const ENTITY_PRIORITY_MAP: Record<EntityType, EntityPriority> = {
  // HIGH priority - unique identifiers, excellent for search
  phone: 'HIGH',
  email: 'HIGH',
  pan_number: 'HIGH',
  ifsc_code: 'HIGH',
  vehicle_number: 'HIGH',
  ip_address: 'HIGH',
  url: 'HIGH',
  // MEDIUM priority - useful for finding related records
  address: 'MEDIUM', // Addresses can find people at same location
  account_number: 'MEDIUM', // Only with explicit context like "account: XXXXX"
  // LOW priority - not useful for iterative search, only for filtering
  aadhaar_number: 'LOW', // Only extract with explicit "aadhaar:" prefix from user query
  amount: 'LOW', // Currency amounts not useful for search
  pincode: 'LOW',
  date: 'LOW',
  name: 'LOW',
  company: 'LOW',
  location: 'LOW',
  id_number: 'LOW',
};

// ============================================================================
// COMPREHENSIVE REGEX PATTERNS
// ============================================================================

const PATTERNS = {
  // Phone numbers - Indian formats with country code support
  phone: [
    // Indian mobile: +91-XXXXXXXXXX, +91 XXXXXXXXXX, +91XXXXXXXXXX
    /\+91[-.\s]?[6-9]\d{9}\b/gi,
    // Indian mobile without country code: XXXXXXXXXX, XXXXX-XXXXX
    /\b[6-9]\d{4}[-.\s]?\d{5}\b/g,
    // With spaces: XXXXX XXXXX
    /\b[6-9]\d{2}\s\d{3}\s\d{4}\b/g,
    // Landline: 0XX-XXXXXXX, 0XXXXXXXXXX
    /\b0\d{2,4}[-.\s]?\d{6,8}\b/g,
    // International: +XX-XXXXXXXXXX
    /\+\d{1,3}[-.\s]?\d{8,14}\b/g,
  ],

  // Email addresses
  email: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ],

  // PAN Card: ABCDE1234F (5 letters, 4 digits, 1 letter)
  pan_number: [
    /\b[A-Z]{3}[ABCFGHLJPTF][A-Z]\d{4}[A-Z]\b/gi,
    // With PAN prefix: PAN ABCDE1234F
    /\bPAN[:\s]+[A-Z]{5}\d{4}[A-Z]\b/gi,
  ],

  // Aadhaar: XXXX XXXX XXXX or XXXXXXXXXXXX
  // ONLY match with explicit context to avoid false positives from IDs
  aadhaar_number: [
    // With Aadhaar prefix explicitly
    /\bAadhaar?[:\s]+\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
    // With UID prefix
    /\bUID[:\s]+\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
  ],

  // Bank Account Numbers - ONLY with explicit context
  account_number: [
    // With A/C prefix
    /\b(?:a\/c|account|acc|acct)[:\s]+\d{9,18}\b/gi,
  ],

  // IFSC Code: SBIN0001234 (4 letters, 0, 6 digits)
  ifsc_code: [
    /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    // With IFSC prefix
    /\bIFSC[:\s]+[A-Z]{4}0[A-Z0-9]{6}\b/gi,
  ],

  // Vehicle Registration (Indian format)
  vehicle_number: [
    // Standard: MH12AB1234, DL1CA1234
    /\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4}\b/gi,
    // With prefix
    /\b(?:vehicle|reg|registration)[:\s]+[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4}\b/gi,
  ],

  // IP Addresses
  ip_address: [
    // IPv4
    /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  ],

  // URLs
  url: [
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi,
    /www\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi,
  ],

  // Pincodes (6 digits, Indian) - ONLY with explicit context to avoid false positives
  pincode: [
    // With prefix
    /\b(?:pin|pincode|postal|zip)[:\s]+\d{6}\b/gi,
  ],

  // Amounts with currency - MUST have currency context to avoid false positives
  amount: [
    // Indian currency: Rs. 1,00,000, ₹50000, INR 50000
    /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d{2})?/gi,
    // With lakhs/crores: 5 lakh, 10 crores
    /\b\d+(?:\.\d+)?\s*(?:lakh|lac|crore|million|billion)s?\b/gi,
    // With currency prefix: $500, €100
    /[$€£¥]\s*\d+(?:,\d{3})*(?:\.\d{2})?\b/g,
  ],

  // Dates
  date: [
    // DD/MM/YYYY, DD-MM-YYYY
    /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/g,
    // Month names: 15 January 2024, Jan 15 2024
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4}\b/gi,
    // YYYY-MM-DD
    /\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/g,
  ],
};

// ============================================================================
// INDIAN CONTEXT DATA
// ============================================================================

// Common Indian first names
const COMMON_INDIAN_FIRST_NAMES = new Set([
  // Male names
  'aakash', 'aaditya', 'aamir', 'aamod', 'aanan', 'anan', 'aankush', 'aansh',
  'aarambh', 'aarav', 'aarush', 'aaryan', 'aryan', 'aashish', 'ashish', 'aashutosh',
  'abhishek', 'aditya', 'agam', 'agarwal', 'ahana', 'ahmad', 'ahmed', 'ajay',
  'akhil', 'akshay', 'akshay', 'aman', 'amar', 'amit', 'amitabh', 'amrendra',
  'anand', 'ankit', 'anmol', 'anurag', 'anush', 'arjun', 'arman', 'armaan',
  'arun', 'arvind', 'ashok', 'ashutosh', 'atul', 'avinash', 'ayush', 'ayushman',
  'babu', 'badal', 'bahadur', 'balaji', 'balbir', 'bala', 'banwari', 'bhagat',
  'bhagwan', 'bhai', 'bhanu', 'bharat', 'bharti', 'bhavesh', 'bheem', 'bhola',
  'bhopal', 'bhuwan', 'bipin', 'bishal', 'brajesh', 'budh', 'chandan', 'chandra',
  'charan', 'chetan', 'chitrang', 'daksh', 'damodar', 'daniel', 'darshan', 'dashrath',
  'deepak', 'deeptesh', 'dev', 'devansh', 'devendra', 'dhananjay', 'dhiraj', 'dhruv',
  'dilip', 'dinesh', 'divyansh', 'durga', 'dwarka', 'gajendra', 'ganesh', 'gaurav',
  'gautam', 'gaurav', 'girdhar', 'girish', 'gopal', 'gopi', 'govind', 'guddu',
  'gulab', 'guru', 'hans', 'hari', 'harish', 'harsh', 'harshad', 'harshvardhan',
  'hemant', 'hitesh', 'hrithik', 'ikbal', 'indra', 'ishan', 'jack', 'jagat',
  'jagdish', 'jai', 'jaidev', 'jatin', 'jay', 'jayant', 'jignesh', 'jitendra',
  'john', 'jugal', 'kailash', 'karan', 'karthik', 'kartik', 'kashi', 'keshav',
  'kiran', 'kishan', 'kishore', 'krishna', 'krish', 'kuber', 'kumar', 'kunal',
  'lakhan', 'lakshman', 'lal', 'lalit', 'lokesh', 'madhav', 'madhur', 'mahesh',
  'manas', 'manish', 'manoj', 'mohan', 'mohit', 'mukesh', 'mukul', 'murali',
  'nabin', 'nadeem', 'nagesh', 'nakul', 'nandan', 'naresh', 'narendra', 'narayan',
  'naveen', 'navin', 'nayana', 'neeraj', 'nikhil', 'nilesh', 'nimai', 'niranjan',
  'nirmal', 'nitesh', 'om', 'omkar', 'onkar', 'pappu', 'param', 'parmesh',
  'parth', 'pavan', 'piyush', 'prabal', 'pradeep', 'prakash', 'pramod', 'pranab',
  'pranav', 'prasad', 'prashant', 'pratap', 'prateek', 'pravin', 'prem', 'priyansh',
  'puneet', 'punit', 'purushottam', 'raghav', 'raghu', 'rahul', 'rajan', 'rajat',
  'rajeev', 'rajendra', 'rajesH', 'rajiv', 'raju', 'rakesh', 'ramesh', 'ram',
  'ranjit', 'rashmi', 'ratan', 'rathin', 'raunak', 'ravi', 'ravindra', 'rayan',
  'rehman', 'rishi', 'rishabh', 'rohan', 'rohit', 'romi', 'ronak', 'ruchi',
  'rudra', 'rupal', 'rupesh', 'sachin', 'sadiq', 'sagar', 'sahil', 'saikat',
  'sai', 'sajal', 'saket', 'salim', 'sam', 'samir', 'sameer', 'sanchit',
  'sandip', 'sandeep', 'sanjay', 'sanjiv', 'sanket', 'santanu', 'santosh', 'sarab',
  'saran', 'sarthak', 'satish', 'satyam', 'satya', 'saurabh', 'savan', 'sayan',
  'seema', 'shakti', 'sham', 'shambhu', 'shankar', 'shantanu', 'shashi', 'shashi',
  'shikhar', 'shishir', 'shiva', 'shreyas', 'shrikant', 'shriram', 'shubham', 'shyam',
  'siddharth', 'siddhant', 'siddhartha', 'sikha', 'som', 'sonu', 'soumen', 'sourav',
  'sourabh', 'srinivas', 'subham', 'subhash', 'subodh', 'subrata', 'sudhir', 'sudhanshu',
  'sujan', 'sukanta', 'sukesh', 'suman', 'suman', 'sumit', 'sundeep', 'sunil',
  'sunny', 'suraj', 'suresh', 'surya', 'sushant', 'sushil', 'swapan', 'swapnil',
  'swarup', 'tapan', 'tarun', 'tejas', 'tonmoy', 'udit', 'ujjwal', 'umang',
  'upendra', 'uttam', 'vaibhav', 'vicky', 'vikas', 'vikram', 'vimal', 'vinay',
  'virendra', 'vishal', 'vishnu', 'vivek', 'yash', 'yogesh', 'yogendra', 'yuvraj',
  // Female names
  'aadhya', 'aalia', 'aarti', 'aashna', 'aastha', 'aditi', 'advika', 'aganya',
  'ahana', 'aina', 'aira', 'aisha', 'aishwarya', 'akshara', 'akshita', 'alisha',
  'amaira', 'amara', 'ambika', 'amisha', 'amrita', 'anamika', 'ananya', 'anika',
  'anisha', 'anita', 'anjali', 'ankita', 'annapurna', 'anshika', 'antara', 'anvi',
  'anu', 'anuradha', 'aparna', 'archana', 'arushi', 'arya', 'ashwini', 'avni',
  'babita', 'bani', 'barkha', 'bhavana', 'bhavya', 'bimla', 'bindiya', 'chanda',
  'chandni', 'chhavi', 'damini', 'danya', 'deepa', 'deepali', 'deeksha', 'deena',
  'devika', 'dhanashree', 'dhara', 'disha', 'divya', 'dyuti', 'ela', 'elina',
  'ganga', 'gargi', 'gauri', 'gayatri', 'geeta', 'geetanjali', 'gita', 'gopi',
  'hansa', 'hema', 'hemali', 'heena', 'honey', 'indira', 'indu', 'ishita',
  'jagruti', 'jahnvi', 'jalaja', 'janaki', 'jaya', 'jaya', 'jayashree', 'jhanvi',
  'jyoti', 'kajal', 'kalyani', 'kamakshi', 'kamini', 'kanchan', 'kanika', 'kanti',
  'karishma', 'kashish', 'kavita', 'khushi', 'kiran', 'kirti', 'komal', 'krishna',
  'kumkum', 'kumari', 'laila', 'lakshmi', 'lalita', 'latha', 'leela', 'leena',
  'madhuri', 'madhu', 'mahi', 'mahima', 'mamta', 'manasi', 'manisha', 'manju',
  'manya', 'maya', 'meena', 'meenakshi', 'megha', 'mehak', 'menka', 'mira',
  'mohini', 'mona', 'mridula', 'mukta', 'mumbai', 'muna', 'naina', 'nandini',
  'nanaki', 'neelam', 'neena', 'neha', 'niharika', 'nikita', 'nisha', 'nishi',
  'nita', 'nitika', 'nitya', 'palak', 'pallavi', 'pampa', 'panchi', 'pankaj',
  'pari', 'paridhi', 'parul', 'parvati', 'payal', 'poonam', 'poornima', 'prachi',
  'pragati', 'pratima', 'pratibha', 'prema', 'premlata', 'priya', 'priyanka', 'priyanshi',
  'purnima', 'puru', 'purvi', 'radha', 'radhika', 'ragini', 'rahul', 'raji',
  'rajni', 'rati', 'ratna', 'reema', 'rekha', 'ria', 'richa', 'rinki',
  'rithika', 'rohini', 'roma', 'roshni', 'rupali', 'rupa', 'sabnam', 'sachi',
  'sadhana', 'sadhvi', 'sagarika', 'sahana', 'sailee', 'sakshi', 'sana', 'sangita',
  'saniya', 'sanjana', 'sanjana', 'santana', 'santosh', 'sanya', 'sara', 'sarla',
  'sarita', 'shailja', 'shakshi', 'shampa', 'shanti', 'sharada', 'sharmila', 'shashi',
  'sheetal', 'shikha', 'shilpa', 'shobha', 'shreya', 'shriya', 'shruti', 'shubha',
  'siddhi', 'simran', 'sita', 'smriti', 'sneha', 'sonakshi', 'sonam', 'sonia',
  'sonu', 'subha', 'suchitra', 'sudha', 'sujata', 'sukanya', 'suman', 'sumati',
  'sumitra', 'sunita', 'sunaina', 'supriya', 'surabhi', 'surbhi', 'sushma', 'swara',
  'swati', 'sweta', 'tanvi', 'tanushree', 'tara', 'trishna', 'udita', 'uma',
  'urvi', 'usha', 'vaishali', 'vanaja', 'vanisha', 'varsha', 'vastav', 'veena',
  'vidya', 'vijaya', 'vimala', 'vimla', 'vinod', 'viraj', 'vishakha', 'yaana',
  'yamini', 'yashoda', 'yogita', 'zara', 'zarina',
]);

// Common Indian surnames
const COMMON_INDIAN_SURNAMES = new Set([
  'agrawal', 'agrawala', 'aggarwal', 'ahire', 'ahluwalia', 'aich', 'arya', 'arya',
  'babu', 'baidya', 'bajaj', 'bajpai', 'bakshi', 'bala', 'balakrishnan', 'balan',
  'banerjee', 'banik', 'bansal', 'banoth', 'baral', 'barkataki', 'barman', 'barthakur',
  'barua', 'baruah', 'baruah', 'baruah', 'batabyal', 'bathula', 'battini', 'bedi',
  'bhadani', 'bhadoria', 'bhagat', 'bhagwat', 'bhai', 'bhakta', 'bhandari', 'bhangare',
  'bharadwaj', 'bharati', 'bhat', 'bhatia', 'bhatnagar', 'bhatt', 'bhattacharjee', 'bhattacharya',
  'bhaumik', 'bhavsar', 'bhel', 'bhoi', 'bhopale', 'bhowmick', 'bhuban', 'bora',
  'borah', 'bordoloi', 'bose', 'brahma', 'brahmbhatt', 'chaudhary', 'chaudhary', 'chaudhri',
  'chaudhuri', 'chauhan', 'chawla', 'cherukuri', 'chopra', 'choudhary', 'choudhury', 'choudhury',
  'chowdhury', 'chowdhury', 'das', 'dass', 'datta', 'david', 'de', 'deka',
  'dey', 'dhaliwal', 'dhanraj', 'dhawan', 'dhillon', 'dikshit', 'dixit', 'dobhal',
  'dodiya', 'dongre', 'dube', 'dubey', 'dugar', 'dutta', 'dwivedi', 'gaba',
  'gadhavi', 'gandhi', 'ganguly', 'garg', 'garodia', 'gaur', 'gautam', 'gawli',
  'ghai', 'ghose', 'ghosh', 'gill', 'gogoi', 'gokhale', 'gopal', 'gopalan',
  'goswami', 'goud', 'goyal', 'grewal', 'grover', 'guha', 'gupta', 'halder',
  'handa', 'hans', 'hari', 'hazarika', 'hela', 'hora', 'iyengar', 'iyer',
  'jadhav', 'jaggi', 'jain', 'jaiswal', 'jakhar', 'jani', 'janorkar', 'jarngal',
  'javali', 'jayaraman', 'jha', 'jhaveri', 'johar', 'joshi', 'junjappa', 'kabra',
  'kadam', 'kadian', 'kadyan', 'kakkar', 'kalra', 'kamal', 'kamble', 'kanda',
  'kant', 'kapoor', 'kapoor', 'kar', 'karam', 'karnik', 'karthik', 'karthik',
  'karunakaran', 'kashyap', 'kaul', 'kaur', 'kawatra', 'kedia', 'keer', 'khadka',
  'khalid', 'khan', 'khanna', 'kharwar', 'khatri', 'khatri', 'khatun', 'khatri',
  'khurana', 'kochhar', 'koli', 'konda', 'konwar', 'koren', 'kothari', 'krishna',
  'krishnamurthy', 'krishnan', 'kulkarni', 'kumar', 'kumari', 'kundu', 'kurian', 'kurmi',
  'kurup', 'kushwaha', 'kwatra', 'lad', 'lal', 'lakshmi', 'lakshman', 'lanka',
  'laskar', 'latha', 'lau', 'luther', 'madan', 'madhav', 'madhavan', 'mahajan',
  'mahal', 'mahanta', 'mahato', 'maheshwari', 'mahi', 'majhi', 'majumdar', 'malhotra',
  'malik', 'mallick', 'malla', 'mammen', 'mandal', 'mane', 'mangal', 'mangat',
  'manjhi', 'manjrekar', 'manral', 'marar', 'masih', 'mathur', 'maurya', 'meena',
  'meena', 'mehta', 'mehto', 'menon', 'mer', 'mishra', 'mistry', 'mittal',
  'mohan', 'mohanty', 'mukherjee', 'mukhopadhyay', 'munda', 'murthy', 'murmu', 'musaddi',
  'nagi', 'nagpal', 'nagpure', 'naidu', 'naik', 'naik', 'nair', 'nakra',
  'nanavati', 'nanda', 'nandrajog', 'narang', 'narendran', 'narula', 'nashine', 'nath',
  'nawal', 'nehra', 'nigam', 'oberoi', 'pal', 'palekar', 'palli', 'pande',
  'pandey', 'pandit', 'pandya', 'pant', 'parashar', 'parida', 'parmar', 'parmar',
  'parmar', 'parsana', 'parthiban', 'parveen', 'paswan', 'patel', 'pathak', 'patil',
  'patnaik', 'patri', 'pattanayak', 'paul', 'pawar', 'phadke', 'phogat', 'pillai',
  'poddar', 'prabhakar', 'prabhu', 'pradhan', 'prasad', 'prasad', 'pratap', 'prem',
  'puri', 'pujari', 'pulkit', 'purohit', 'radhakrishnan', 'raghavan', 'raghuvanshi', 'raikwar',
  'raipuria', 'raju', 'ramesh', 'ramesh', 'ranganathan', 'rao', 'rastogi', 'rath',
  'rathod', 'rathore', 'raut', 'ravi', 'rawal', 'rawat', 'ray', 'razdan',
  'reddy', 'reddy', 'revri', 'rewar', 'reyansh', 'riya', 'rohith', 'roy',
  'roy', 'rughani', 'saha', 'sahani', 'sahay', 'saikia', 'saini', 'salvi',
  'sampath', 'samuel', 'sandilya', 'sane', 'sanghvi', 'sangma', 'sangwan', 'sania',
  'sankar', 'santosh', 'sanyal', 'sapra', 'sarangi', 'sarma', 'sarraf', 'saraf',
  'sashi', 'sasidharan', 'sathe', 'saxena', 'seal', 'sehgal', 'sem', 'sen',
  'seth', 'sethi', 'shah', 'shah', 'shandilya', 'shanmugam', 'sharma', 'sharma',
  'sharma', 'sharraf', 'shashi', 'shastri', 'shelke', 'shende', 'sherwal', 'shetty',
  'shiv', 'shome', 'shrikant', 'shroff', 'shukla', 'siddiqui', 'sidhu', 'singh',
  'singh', 'sinha', 'sodhi', 'solanki', 'som', 'soman', 'somani', 'sonar',
  'soni', 'soni', 'sonkar', 'sontake', 'sood', 'sridhar', 'srinivasan', 'srivastava',
  'subramanian', 'subramaniam', 'sud', 'sudhir', 'sugathan', 'sule', 'sultana', 'sunder',
  'sundaram', 'sundararajan', 'surana', 'sureka', 'suresh', 'suri', 'surve', 'swaminathan',
  'swamy', 'tandon', 'taneja', 'tank', 'tanwar', 'tapan', 'tarafdar', 'tewari',
  'thakkar', 'thakur', 'thakur', 'thanvi', 'thapa', 'thapar', 'tharakan', 'tharoor',
  'thigala', 'thakur', 'thombre', 'thorat', 'tiwari', 'tomar', 'tripathi', 'tripathi',
  'tyagi', 'tyagi', 'ujjwal', 'umar', 'upadhyay', 'uppal', 'vaidya', 'vaish',
  'vaishnav', 'vajpayee', 'vani', 'varma', 'varma', 'varshney', 'varughese', 'venkatesh',
  'venkataraman', 'verma', 'verma', 'vidya', 'vig', 'vij', 'vijay', 'vijayan',
  'vijayaraghavan', 'vikram', 'vikramaditya', 'vinod', 'virat', 'viswanathan', 'vohra', 'vyas',
  'wadhwa', 'wagle', 'walia', 'wali', 'warrier', 'wattal', 'yadav', 'yadav',
  'yogi', 'yadav', 'yadav', 'zakaria', 'zehra', 'zinta',
]);

// Common Indian cities
const COMMON_INDIAN_CITIES = new Set([
  // Metro cities
  'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad',
  // State capitals
  'bhopal', 'bhubaneswar', 'chandigarh', 'dehradun', 'dispur', 'gangtok', 'hyderabad', 'imphal',
  'itanagar', 'jaipur', 'jammu', 'kohima', 'lucknow', 'panaji', 'patna', 'raipur', 'ranchi',
  'shillong', 'shimla', 'srinagar', 'thiruvananthapuram', 'trivandrum',
  // Major cities
  'agra', 'ajmer', 'aligarh', 'allahabad', 'prayagraj', 'amritsar', 'aurangabad', 'bareilly',
  'belgaum', 'bhavnagar', 'bhiwandi', 'bhopal', 'bhubaneswar', 'bikaner', 'bilaspur', 'coimbatore',
  'cuttack', 'davanagere', 'dhanbad', 'durgapur', 'erode', 'farrukhabad', 'firozabad', 'gaya',
  'ghaziabad', 'gorakhpur', 'gulbarga', 'guntur', 'gurgaon', 'guwahati', 'gwalior', 'howrah',
  'hubli', 'indore', 'jabalpur', 'jalandhar', 'jammu', 'jamnagar', 'jamshedpur', 'jhansi',
  'jodhpur', 'kakinada', 'kannur', 'kanpur', 'kochi', 'kollam', 'kota', 'kottayam',
  'kozhikode', 'ludhiana', 'madurai', 'malegaon', 'mangalore', 'meerut', 'mirzapur', 'moradabad',
  'muzaffarnagar', 'muzaffarpur', 'mysore', 'nagpur', 'nanded', 'nashik', 'nellore', 'noida',
  'palakkad', 'patiala', 'rajahmundry', 'rajkot', 'rourkela', 'saharanpur', 'salem', 'sangli',
  'satara', 'shillong', 'siliguri', 'solapur', 'srinagar', 'surat', 'thanjavur', 'thiruppur',
  'thrissur', 'tiruchirappalli', 'tirunelveli', 'tirupati', 'udaipur', 'udupi', 'ujjain', 'vadodara',
  'varanasi', 'vijayawada', 'visakhapatnam', 'vizag', 'warangal',
  // Union Territories
  'port blair', 'chandigarh', 'daman', 'diu', 'kavaratti', 'puducherry', 'pondicherry',
  // Districts and smaller cities
  'alwar', 'bardhaman', 'bharatpur', 'bhilwara', 'bijapur', 'bulandshahr', 'darbhanga', 'dharwad',
  'english bazar', 'etawah', 'fatehpur', 'gandhidham', 'gandhinagar', 'haldia', 'hazaribag', 'jehanabad',
  'junagadh', 'khandwa', 'kharagpur', 'maheshtala', 'mathura', 'maunath bhanjan', 'mango', 'navi mumbai',
  'nizamabad', 'proddatur', 'rohtak', 'sambalpur', 'silchar', 'sirsa', 'sonipat', 'south dumdum',
  'sultan pur majra', 'tinsukia', 'tumkur', 'west dumdum',
]);

// Common Indian states
const COMMON_INDIAN_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
  'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra',
  'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'orissa', 'punjab', 'rajasthan',
  'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'uttaranchal',
  'west bengal',
  // Union Territories
  'andaman and nicobar', 'chandigarh', 'dadra and nagar haveli', 'daman and diu', 'delhi', 'jammu and kashmir',
  'ladakh', 'lakshadweep', 'puducherry', 'pondicherry',
]);

// Common relationship keywords
const RELATIONSHIP_PATTERNS = {
  location: ['from', 'in', 'at', 'living in', 'residing in', 'based in', 'staying in', 'located in'],
  association: ['connected to', 'linked to', 'associated with', 'related to', 'relation to', 'knows', 'friend of', 'colleague of'],
  family: ['son of', 'daughter of', 'father of', 'mother of', 'brother of', 'sister of', 'husband of', 'wife of', 'cousin of', 'uncle of', 'aunt of'],
  contact: ['having phone', 'phone number', 'mobile', 'contact', 'email', 'mail'],
  ownership: ['owns', 'owner of', 'possesses', 'has'],
  employment: ['works at', 'working for', 'employed at', 'employee of', 'job at'],
};

// Words that should NOT be extracted as names
const FORBIDDEN_NAME_WORDS = new Set([
  // Query words
  'find', 'search', 'look', 'show', 'get', 'list', 'all', 'any', 'who', 'what', 'where', 'when', 'how',
  'having', 'with', 'from', 'connected', 'linked', 'related', 'relation', 'having', 'phone', 'mobile',
  'email', 'address', 'location', 'city', 'state', 'country', 'company', 'bank', 'account',
  // Common verbs/adjectives
  'and', 'or', 'the', 'a', 'an', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'by', 'about',
  'like', 'through', 'over', 'before', 'after', 'between', 'under', 'again', 'further', 'then', 'once',
  // Entity type words
  'person', 'people', 'man', 'woman', 'boy', 'girl', 'individual', 'suspect', 'victim', 'witness',
  'transaction', 'record', 'data', 'information', 'details', 'number', 'type', 'status', 'date',
  'transaction', 'amount', 'balance', 'credit', 'debit', 'transfer', 'payment',
  // Relationship indicators
  'relationship', 'relationships', 'types', 'type', 'connections', 'connection', 'associated',
]);

// ============================================================================
// ENTITY EXTRACTOR CLASS
// ============================================================================

export class EntityExtractor {
  private phoneCache: Map<string, string> = new Map();

  /**
   * Main extraction method - extracts all entities from text
   */
  extract(text: string): ExtractedEntities {
    const startTime = Date.now();
    const entities: Entity[] = [];
    const relationships: EntityRelationship[] = [];

    // Extract HIGH priority entities first
    const phones = this.extractPhones(text);
    const emails = this.extractEmails(text);
    const panNumbers = this.extractPANNumbers(text);
    const aadhaarNumbers = this.extractAadhaarNumbers(text);
    const accountNumbers = this.extractAccountNumbers(text);
    const ifscCodes = this.extractIFSCCodes(text);
    const vehicleNumbers = this.extractVehicleNumbers(text);
    const ipAddresses = this.extractIPAddresses(text);
    const urls = this.extractURLs(text);

    // Extract MEDIUM priority entities
    const pincodes = this.extractPincodes(text);
    const addresses = this.extractAddresses(text);
    const dates = this.extractDates(text);
    const amounts = this.extractAmounts(text);

    // Extract LOW priority entities (only after HIGH/MEDIUM are done)
    const names = this.extractNames(text, entities);
    const locations = this.extractLocations(text);
    const companies = this.extractCompanies(text);

    // Combine all entities
    entities.push(
      ...phones, ...emails, ...panNumbers, ...aadhaarNumbers,
      ...accountNumbers, ...ifscCodes, ...vehicleNumbers, ...ipAddresses, ...urls,
      ...pincodes, ...addresses, ...dates, ...amounts,
      ...names, ...locations, ...companies
    );

    // Remove duplicates
    const uniqueEntities = this.deduplicateEntities(entities);

    // Extract relationships
    const extractedRelationships = this.extractRelationships(text, uniqueEntities);
    relationships.push(...extractedRelationships);

    // Categorize by priority
    const highValue = uniqueEntities.filter(e => e.priority === 'HIGH');
    const mediumValue = uniqueEntities.filter(e => e.priority === 'MEDIUM');
    const lowValue = uniqueEntities.filter(e => e.priority === 'LOW');

    const extractionTime = Date.now() - startTime;

    return {
      entities: uniqueEntities,
      highValue,
      mediumValue,
      lowValue,
      relationships,
      originalQuery: text,
      extractionTime,
    };
  }

  /**
   * Extract phone numbers
   */
  private extractPhones(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.phone) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const rawPhone = match[0];
        // Normalize phone number
        const normalizedPhone = this.normalizePhoneNumber(rawPhone);
        if (normalizedPhone && !this.phoneCache.has(normalizedPhone)) {
          this.phoneCache.set(normalizedPhone, normalizedPhone);
          entities.push({
            type: 'phone',
            value: normalizedPhone,
            originalText: rawPhone,
            priority: 'HIGH',
            confidence: 0.95,
            position: { start: match.index || 0, end: (match.index || 0) + rawPhone.length },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Normalize phone number to standard format
   */
  private normalizePhoneNumber(phone: string): string | null {
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');

    // Handle Indian numbers
    if (digits.length === 10 && digits[0] >= '6' && digits[0] <= '9') {
      return digits; // Valid Indian mobile
    }

    // Remove country code if present
    if (digits.length === 12 && digits.startsWith('91')) {
      const withoutCode = digits.slice(2);
      if (withoutCode[0] >= '6' && withoutCode[0] <= '9') {
        return withoutCode;
      }
    }

    if (digits.length === 13 && digits.startsWith('091')) {
      const withoutCode = digits.slice(3);
      if (withoutCode[0] >= '6' && withoutCode[0] <= '9') {
        return withoutCode;
      }
    }

    // Valid international or landline
    if (digits.length >= 8 && digits.length <= 15) {
      return digits;
    }

    return null;
  }

  /**
   * Extract email addresses
   */
  private extractEmails(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.email) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          type: 'email',
          value: match[0].toLowerCase(),
          originalText: match[0],
          priority: 'HIGH',
          confidence: 0.98,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract PAN numbers
   */
  private extractPANNumbers(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.pan_number) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        // Clean up the match (remove PAN prefix if present)
        let pan = match[0].toUpperCase();
        pan = pan.replace(/^PAN[:\s]+/i, '');

        // Validate PAN format
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
          entities.push({
            type: 'pan_number',
            value: pan,
            originalText: match[0],
            priority: 'HIGH',
            confidence: 0.95,
            position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract Aadhaar numbers
   */
  private extractAadhaarNumbers(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.aadhaar_number) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        let aadhaar = match[0];
        // Clean up
        aadhaar = aadhaar.replace(/Aadhaar?[:\s]+/i, '');
        aadhaar = aadhaar.replace(/UID[:\s]+/i, '');
        const digits = aadhaar.replace(/\D/g, '');

        // Validate Aadhaar (12 digits, should not start with 0 or 1)
        if (digits.length === 12 && !['0', '1'].includes(digits[0])) {
          entities.push({
            type: 'aadhaar_number',
            value: digits,
            originalText: match[0],
            priority: 'MEDIUM', // Aadhaar requires explicit context to extract
            confidence: 0.92,
            position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract bank account numbers - ONLY with explicit context
   */
  private extractAccountNumbers(text: string): Entity[] {
    const entities: Entity[] = [];

    // Only match with explicit account mentions
    const explicitPattern = /\b(?:a\/c|account|acc|acct)[:\s]+(\d{9,18})\b/gi;
    const explicitMatches = text.matchAll(explicitPattern);
    for (const match of explicitMatches) {
      entities.push({
        type: 'account_number',
        value: match[1],
        originalText: match[0],
        priority: 'MEDIUM', // Account requires explicit context to extract
        confidence: 0.95,
        position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
      });
    }

    return entities;
  }

  /**
   * Extract IFSC codes
   */
  private extractIFSCCodes(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.ifsc_code) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        let ifsc = match[0].toUpperCase();
        ifsc = ifsc.replace(/^IFSC[:\s]+/i, '');

        entities.push({
          type: 'ifsc_code',
          value: ifsc,
          originalText: match[0],
          priority: 'HIGH',
          confidence: 0.95,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract vehicle registration numbers
   */
  private extractVehicleNumbers(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.vehicle_number) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        let vehicle = match[0].toUpperCase();
        vehicle = vehicle.replace(/(?:vehicle|reg|registration)[:\s]+/i, '');
        // Normalize format: MH12AB1234
        vehicle = vehicle.replace(/[-\s]/g, '');

        entities.push({
          type: 'vehicle_number',
          value: vehicle,
          originalText: match[0],
          priority: 'HIGH',
          confidence: 0.90,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract IP addresses
   */
  private extractIPAddresses(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.ip_address) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          type: 'ip_address',
          value: match[0],
          originalText: match[0],
          priority: 'HIGH',
          confidence: 0.90,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract URLs
   */
  private extractURLs(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.url) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          type: 'url',
          value: match[0],
          originalText: match[0],
          priority: 'HIGH',
          confidence: 0.95,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract pincodes
   */
  private extractPincodes(text: string): Entity[] {
    const entities: Entity[] = [];

    // Check for explicit pincode mentions
    const explicitPattern = /\b(?:pin|pincode|postal)[:\s]+(\d{6})\b/gi;
    const explicitMatches = text.matchAll(explicitPattern);
    for (const match of explicitMatches) {
      entities.push({
        type: 'pincode',
        value: match[1],
        originalText: match[0],
        priority: 'LOW', // Pincodes are not useful for iterative search
        confidence: 0.95,
        position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
      });
    }

    return entities;
  }

  /**
   * Extract addresses (complex pattern matching)
   */
  private extractAddresses(text: string): Entity[] {
    const entities: Entity[] = [];

    // Pattern for Indian addresses with house/flat numbers
    const addressPatterns = [
      // Flat/House/Plot numbers with area
      /\b(?:flat|fl|house|hs|plot|plt|shop|sh|office|off|room|rm)[:\s]*\d+[a-z]?(?:\s*[-,]?\s*(?:apartment|apt|building|bldg|floor|flr|wing|block|sector|sec))?[\w\s,-]{5,50}/gi,
      // Sector/Block patterns (common in Indian cities)
      /\b(?:sector|sec|block)\s*[-]?\s*\d+[a-z]?[\w\s,-]{5,50}/gi,
      // Street addresses
      /\b\d+[\w\s,-]*(?:street|st|road|rd|lane|ln|avenue|ave|colony|nagar|puram|layout|area|market|chowk|mandi)[\w\s,-]{5,50}/gi,
      // Near/Lane patterns (common in India)
      /\b\d+\s+(?:near|lane|lane|opposite|opp|behind|beside|adjacent)[\w\s,-]{5,80}/gi,
    ];

    for (const pattern of addressPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const address = match[0].trim();
        // Check if it's a specific address (has numbers)
        if (/\d/.test(address) && address.length > 10) {
          entities.push({
            type: 'address',
            value: address,
            originalText: address,
            priority: 'MEDIUM', // Addresses can find related people
            confidence: 0.80,
            position: { start: match.index || 0, end: (match.index || 0) + address.length },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract dates
   */
  private extractDates(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.date) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[0];
        
        // Skip very short matches (likely noise)
        if (dateStr.length < 6) continue;
        
        // Skip if it looks like a mathematical expression (e.g., "1-2-3")
        if (/^\d-\d-\d$/.test(dateStr)) continue;
        
        // Skip if it looks like a version number (e.g., "1.2.3")
        if (/^\d\.\d\.\d$/.test(dateStr)) continue;
        
        entities.push({
          type: 'date',
          value: dateStr,
          originalText: dateStr,
          priority: 'LOW', // Dates are not useful for iterative search
          confidence: 0.85,
          position: { start: match.index || 0, end: (match.index || 0) + dateStr.length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract amounts
   */
  private extractAmounts(text: string): Entity[] {
    const entities: Entity[] = [];

    for (const pattern of PATTERNS.amount) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const amount = match[0];
        
        // Extract numeric value
        const numericStr = amount.replace(/[^\d.]/g, '');
        const numericValue = parseFloat(numericStr);
        
        // Skip if not a valid number
        if (isNaN(numericValue)) continue;
        
        // Skip very small amounts (likely noise like country codes, IDs)
        if (numericValue < 100) continue;
        
        // Skip if it looks like a pincode (6 digits starting with 1-8)
        if (/^[1-8]\d{5}$/.test(numericStr)) continue;
        
        // Skip if it looks like a phone (10 digits starting with 6-9)
        if (/^[6-9]\d{9}$/.test(numericStr)) continue;
        
        // Skip very large numbers that look like IDs (more than 15 digits)
        if (numericStr.length > 15) continue;

        entities.push({
          type: 'amount',
          value: amount,
          originalText: amount,
          priority: 'MEDIUM',
          confidence: 0.85,
          position: { start: match.index || 0, end: (match.index || 0) + amount.length },
        });
      }
    }

    return entities;
  }

  /**
   * Extract names using dictionary-based approach
   */
  private extractNames(text: string, existingEntities: Entity[]): Entity[] {
    const entities: Entity[] = [];
    const foundNames = new Set<string>();

    // Get text positions that are already occupied by other entities
    const occupiedPositions: Array<{ start: number; end: number }> = existingEntities
      .filter(e => e.position)
      .map(e => e.position!);

    // Split text into words and check against name databases
    const words = text.split(/\s+/);
    let currentPosition = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[^a-z]/g, '');

      // Skip if word is forbidden
      if (FORBIDDEN_NAME_WORDS.has(word)) {
        currentPosition += words[i].length + 1;
        continue;
      }

      // Skip if word is too short or too long for a name
      if (word.length < 2 || word.length > 20) {
        currentPosition += words[i].length + 1;
        continue;
      }

      // Check if current position is occupied
      const isOccupied = occupiedPositions.some(
        pos => currentPosition >= pos.start && currentPosition < pos.end
      );
      if (isOccupied) {
        currentPosition += words[i].length + 1;
        continue;
      }

      // Check if it's a common first name
      if (COMMON_INDIAN_FIRST_NAMES.has(word) && !foundNames.has(word)) {
        // Check for surname after first name
        let fullName = word;
        let nextWordIdx = i + 1;

        while (nextWordIdx < words.length) {
          const nextWord = words[nextWordIdx].toLowerCase().replace(/[^a-z]/g, '');
          if (COMMON_INDIAN_SURNAMES.has(nextWord)) {
            fullName += ' ' + nextWord;
            nextWordIdx++;
          } else if (COMMON_INDIAN_FIRST_NAMES.has(nextWord)) {
            // Could be a middle name
            fullName += ' ' + nextWord;
            nextWordIdx++;
          } else {
            break;
          }
        }

        if (!foundNames.has(fullName)) {
          foundNames.add(fullName);
          entities.push({
            type: 'name',
            value: this.capitalizeName(fullName),
            originalText: fullName,
            priority: 'LOW',
            confidence: COMMON_INDIAN_SURNAMES.has(fullName.split(' ').pop() || '') ? 0.90 : 0.75,
          });
        }
      }
      // Check if it's a surname
      else if (COMMON_INDIAN_SURNAMES.has(word) && !foundNames.has(word)) {
        // Check for first name before surname
        if (i > 0) {
          const prevWord = words[i - 1].toLowerCase().replace(/[^a-z]/g, '');
          if (COMMON_INDIAN_FIRST_NAMES.has(prevWord)) {
            // Already captured as full name
            currentPosition += words[i].length + 1;
            continue;
          }
        }

        foundNames.add(word);
        entities.push({
          type: 'name',
          value: this.capitalizeName(word),
          originalText: word,
          priority: 'LOW',
          confidence: 0.70,
        });
      }

      currentPosition += words[i].length + 1;
    }

    // Extract multi-word names with relationship context
    const namePatterns = [
      /(?:name(?:d)?|called|known as)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /(?:mr\.?|mrs\.?|ms\.?|dr\.?|sri|smt|shri|shrimati)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    ];

    for (const pattern of namePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const name = match[1].toLowerCase();
        if (!foundNames.has(name) && !FORBIDDEN_NAME_WORDS.has(name.split(' ')[0])) {
          foundNames.add(name);
          entities.push({
            type: 'name',
            value: this.capitalizeName(match[1]),
            originalText: match[1],
            priority: 'LOW',
            confidence: 0.85,
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract locations (cities, states)
   */
  private extractLocations(text: string): Entity[] {
    const entities: Entity[] = [];
    const foundLocations = new Set<string>();

    const textLower = text.toLowerCase();

    // Check for cities
    for (const city of COMMON_INDIAN_CITIES) {
      if (textLower.includes(city) && !foundLocations.has(city)) {
        foundLocations.add(city);
        entities.push({
          type: 'location',
          value: this.capitalizeName(city),
          originalText: city,
          priority: 'LOW',
          confidence: 0.85,
        });
      }
    }

    // Check for states
    for (const state of COMMON_INDIAN_STATES) {
      if (textLower.includes(state) && !foundLocations.has(state)) {
        foundLocations.add(state);
        entities.push({
          type: 'location',
          value: this.capitalizeName(state),
          originalText: state,
          priority: 'LOW',
          confidence: 0.90,
        });
      }
    }

    return entities;
  }

  /**
   * Extract company names
   */
  private extractCompanies(text: string): Entity[] {
    const entities: Entity[] = [];

    // Pattern for company names
    const companyPatterns = [
      /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:Pvt\.?|Private)?\s*(?:Ltd\.?|Limited|Inc\.?|Corporation|Corp\.?|Company|Co\.?|LLP|LLC)\b/g,
      /\b(?:company|firm|business|enterprise)[:\s]+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/gi,
    ];

    for (const pattern of companyPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          type: 'company',
          value: match[1] || match[0],
          originalText: match[0],
          priority: 'LOW',
          confidence: 0.80,
        });
      }
    }

    return entities;
  }

  /**
   * Extract relationships between entities
   */
  extractRelationships(text: string, entities: Entity[]): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];
    const textLower = text.toLowerCase();

    // Get all entities by type for quick lookup
    const names = entities.filter(e => e.type === 'name');
    const locations = entities.filter(e => e.type === 'location');
    const phones = entities.filter(e => e.type === 'phone');
    const emails = entities.filter(e => e.type === 'email');

    // Extract "X from Y" relationships (person from location)
    for (const [pattern, relType] of Object.entries(RELATIONSHIP_PATTERNS)) {
      for (const keyword of relType) {
        const regex = new RegExp(`([\\w\\s]+)\\s+${keyword}\\s+([\\w\\s]+)`, 'gi');
        const matches = text.matchAll(regex);

        for (const match of matches) {
          const entity1Text = match[1].trim().toLowerCase();
          const entity2Text = match[2].trim().toLowerCase();

          // Find matching entities
          const entity1 = names.find(n => n.value.toLowerCase() === entity1Text) ||
                         names.find(n => n.value.toLowerCase().includes(entity1Text));
          const entity2 = locations.find(l => l.value.toLowerCase() === entity2Text) ||
                         names.find(n => n.value.toLowerCase() === entity2Text) ||
                         phones.find(p => p.value === entity2Text.replace(/\D/g, ''));

          if (entity1 && entity2 && entity1 !== entity2) {
            relationships.push({
              entity1,
              entity2,
              relationshipType: this.getRelationshipType(keyword),
              context: match[0],
            });
          }
        }
      }
    }

    // Extract implicit relationships (name + phone in same query)
    if (names.length > 0 && phones.length > 0) {
      for (const name of names) {
        for (const phone of phones) {
          // Check if they appear close together in the query
          const namePos = textLower.indexOf(name.value.toLowerCase());
          const phonePos = textLower.indexOf(phone.value.substring(0, 5));
          if (namePos !== -1 && phonePos !== -1 && Math.abs(namePos - phonePos) < 50) {
            relationships.push({
              entity1: name,
              entity2: phone,
              relationshipType: 'contact',
              context: `${name.value} has phone ${phone.value}`,
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Get relationship type from keyword
   */
  private getRelationshipType(keyword: string): EntityRelationship['relationshipType'] {
    if (RELATIONSHIP_PATTERNS.location.includes(keyword)) return 'location';
    if (RELATIONSHIP_PATTERNS.association.includes(keyword)) return 'association';
    if (RELATIONSHIP_PATTERNS.family.includes(keyword)) return 'family';
    if (RELATIONSHIP_PATTERNS.contact.includes(keyword)) return 'contact';
    if (RELATIONSHIP_PATTERNS.ownership.includes(keyword)) return 'ownership';
    if (RELATIONSHIP_PATTERNS.employment.includes(keyword)) return 'employment';
    return 'association';
  }

  /**
   * Smart parse query - handles complex natural language queries
   */
  smartParseQuery(text: string): {
    entities: ExtractedEntities;
    intent: 'search' | 'find' | 'connect' | 'analyze';
    filters: Record<string, string[]>;
  } {
    const entities = this.extract(text);
    const textLower = text.toLowerCase();

    // Determine intent
    let intent: 'search' | 'find' | 'connect' | 'analyze' = 'search';
    if (textLower.includes('find') || textLower.includes('search')) intent = 'find';
    if (textLower.includes('connect') || textLower.includes('related') || textLower.includes('linked')) intent = 'connect';
    if (textLower.includes('analyze') || textLower.includes('analysis')) intent = 'analyze';

    // Build filters from LOW value entities
    const filters: Record<string, string[]> = {
      names: entities.lowValue.filter(e => e.type === 'name').map(e => e.value),
      locations: entities.lowValue.filter(e => e.type === 'location').map(e => e.value),
      companies: entities.lowValue.filter(e => e.type === 'company').map(e => e.value),
    };

    return { entities, intent, filters };
  }

  /**
   * Remove duplicate entities
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.value}`;
      if (!seen.has(key)) {
        seen.set(key, entity);
      } else {
        // Keep the one with higher confidence
        const existing = seen.get(key)!;
        if (entity.confidence > existing.confidence) {
          seen.set(key, entity);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Capitalize name properly
   */
  private capitalizeName(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Extract entities with AI fallback (for complex cases only)
   * This is kept for backward compatibility but uses regex internally
   */
  async extractWithAI(text: string): Promise<ExtractedEntities> {
    // For now, just use regex-based extraction
    // AI is reserved for report generation only
    return this.extract(text);
  }

  /**
   * Extract entities and their relationships
   */
  extractWithRelationships(text: string): ExtractedEntities {
    return this.extract(text);
  }
}

// Export singleton instance
export const entityExtractor = new EntityExtractor();
