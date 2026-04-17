// ── NAICS codes (19 major sectors) ───────────────────────────────────────────
export const NAICS_CODES = [
  { code: "11",    label: "Agriculture, Forestry, Fishing and Hunting" },
  { code: "21",    label: "Mining, Quarrying, and Oil and Gas Extraction" },
  { code: "22",    label: "Utilities" },
  { code: "23",    label: "Construction" },
  { code: "31-33", label: "Manufacturing" },
  { code: "42",    label: "Wholesale Trade" },
  { code: "44-45", label: "Retail Trade" },
  { code: "48-49", label: "Transportation and Warehousing" },
  { code: "51",    label: "Information" },
  { code: "52",    label: "Finance and Insurance" },
  { code: "53",    label: "Real Estate and Rental" },
  { code: "54",    label: "Professional, Scientific, and Technical Services" },
  { code: "55",    label: "Management of Companies and Enterprises" },
  { code: "56",    label: "Administrative and Support Services" },
  { code: "61",    label: "Educational Services" },
  { code: "62",    label: "Health Care and Social Assistance" },
  { code: "71",    label: "Arts, Entertainment, and Recreation" },
  { code: "72",    label: "Accommodation and Food Services" },
  { code: "81",    label: "Other Services" },
];

// ── UNSPSC codes (45+ categories) ────────────────────────────────────────────
export const UNSPSC_CODES = [
  { code: "10000000", label: "Live Plant and Animal Material" },
  { code: "11000000", label: "Mineral and Textile Materials" },
  { code: "12000000", label: "Chemicals including Bio Chemicals" },
  { code: "13000000", label: "Resin, Rosin and Rubber" },
  { code: "14000000", label: "Paper Materials and Products" },
  { code: "15000000", label: "Fuels, Fuel Additives and Lubricants" },
  { code: "20000000", label: "Mining and Well Drilling Machinery" },
  { code: "23000000", label: "Industrial Machinery and Equipment" },
  { code: "24000000", label: "Material Handling Machinery" },
  { code: "25000000", label: "Vehicles and Transport Equipment" },
  { code: "26000000", label: "Power Generation and Distribution" },
  { code: "27000000", label: "Tools and General Machinery" },
  { code: "30000000", label: "Structures and Building Materials" },
  { code: "31000000", label: "Manufacturing Components and Supplies" },
  { code: "39000000", label: "Electrical Systems and Lighting" },
  { code: "40000000", label: "Distribution and Conditioning Systems" },
  { code: "41000000", label: "Laboratory Equipment" },
  { code: "42000000", label: "Medical Equipment and Accessories" },
  { code: "43000000", label: "Information Technology" },
  { code: "44000000", label: "Office Equipment and Supplies" },
  { code: "45000000", label: "Printing and Photographic Equipment" },
  { code: "46000000", label: "Safety and Security Equipment" },
  { code: "47000000", label: "Cleaning Equipment and Supplies" },
  { code: "48000000", label: "Service Industry Machinery" },
  { code: "49000000", label: "Sports and Recreation Equipment" },
  { code: "50000000", label: "Food and Beverage Products" },
  { code: "51000000", label: "Drugs and Pharmaceutical Products" },
  { code: "53000000", label: "Apparel and Luggage" },
  { code: "55000000", label: "Published Products" },
  { code: "56000000", label: "Furniture and Furnishings" },
  { code: "60000000", label: "Musical Instruments and Games" },
  { code: "70000000", label: "Farming and Fishing" },
  { code: "72000000", label: "Building and Construction Services" },
  { code: "73000000", label: "Industrial Production Services" },
  { code: "76000000", label: "Industrial Cleaning Services" },
  { code: "77000000", label: "Environmental Services" },
  { code: "78000000", label: "Transportation and Storage Services" },
  { code: "80000000", label: "Management and Business Professionals Services" },
  { code: "81000000", label: "Engineering and Research Services" },
  { code: "82000000", label: "Editorial and Design Services" },
  { code: "83000000", label: "Public Utilities and Public Sector" },
  { code: "84000000", label: "Financial and Insurance Services" },
  { code: "85000000", label: "Healthcare Services" },
  { code: "86000000", label: "Education and Training Services" },
  { code: "90000000", label: "Travel and Food Services" },
  { code: "91000000", label: "Personal and Domestic Services" },
];

// ── Business Designations ─────────────────────────────────────────────────────
export const BUSINESS_DESIGNATIONS = [
  "Small Business",
  "Women-Led Business",
  "Women-Managed Business",
  "Minority-Owned Business",
  "LGBTQ+-Owned Business",
  "Veteran-Owned Business",
  "Disability-Owned Business",
];

// ── Employee ranges ───────────────────────────────────────────────────────────
export const EMPLOYEE_RANGES = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+",
];

// ── Revenue ranges ────────────────────────────────────────────────────────────
export const REVENUE_RANGES = [
  "Under $100K", "$100K–$500K", "$500K–$1M", "$1M–$5M", "$5M–$25M", "$25M+",
];

// ── Visa types ────────────────────────────────────────────────────────────────
export const VISA_TYPES = [
  "H-1B", "L-1", "O-1", "E-2", "TN", "F-1 OPT", "Other",
];

// ── Certification pricing (PRD uses $x/$y placeholders) ──────────────────────
export const CERT_PRICING = {
  self:    { price: 199,  label: "Self-Certification",    annual: true },
  digital: { price: 799,  label: "Digital Certification", annual: true },
  auditor: { price: null,  label: "Third-Party Auditor",  annual: false },
};

// ── Assessor fees (PRD Phase 2 ranges) ───────────────────────────────────────
export const ASSESSOR_FEES = {
  self:     { min: 100,  max: 300  },
  digital:  { min: 300,  max: 600  },
  industry: { min: 150,  max: 350  },
  audit:    { min: 500,  max: 2000 },
};

// ── Document types required per cert path ────────────────────────────────────
export const REQUIRED_DOCS = {
  self: [
    { type: "articles_of_incorporation", label: "Articles of Incorporation" },
    { type: "ownership_docs",            label: "Ownership Documents" },
  ],
  digital: [
    { type: "articles_of_incorporation", label: "Articles of Incorporation" },
    { type: "ownership_docs",            label: "Ownership Documents" },
    { type: "governance_docs",           label: "Governance Documents" },
    { type: "shareholder_docs",          label: "Shareholder Documents" },
  ],
};

// ── AI Tips per registration question ────────────────────────────────────────
export const AI_TIPS: Record<number, string> = {
  1: "I'll verify this matches public business registry records and pre-fill additional info.",
  2: "51%+ women ownership is the core requirement for WOB certification.",
  3: "I'll check relevant certification requirements and business registry for your region.",
  4: "Select all industries that apply — this helps match you with relevant buyers.",
  5: "Select all product/service categories. This enables precise buyer-WOB matching.",
  6: "These designations increase your visibility to buyers with diversity spend goals.",
  7: "List any other certifications relevant for procurement (ISO 9001, B-Corp, etc.)",
  8: "A clear description helps AI match you with the right procurement opportunities.",
};

// ── Mock assessors ────────────────────────────────────────────────────────────
export const MOCK_ASSESSORS = [
  {
    id: "a1", name: "Sarah Chen, CPA", credentials: ["CPA", "WBENC Assessor"],
    rating: 4.9, review_count: 127, fee_self: 200, fee_digital: 450, fee_industry: 250,
    bio: "15 years experience in WOB certification and financial auditing.",
    verified: true,
  },
  {
    id: "a2", name: "Marcus Williams", credentials: ["MBA", "Certified Auditor"],
    rating: 4.7, review_count: 89, fee_self: 175, fee_digital: 375, fee_industry: 200,
    bio: "Specialising in manufacturing and professional services WOBs.",
    verified: true,
  },
  {
    id: "a3", name: "Priya Nair", credentials: ["JD", "Compliance Specialist"],
    rating: 4.8, review_count: 203, fee_self: 225, fee_digital: 500, fee_industry: 300,
    bio: "Legal and compliance expert with focus on diverse supplier certification.",
    verified: true,
  },
];

// ── Mock supplier data for buyer portal ──────────────────────────────────────
export const MOCK_SUPPLIERS = [
  {
    id: "s1", business_name: "Greenfield Tech Solutions", country: "United States",
    industry_codes: ["54"], category_codes: ["43000000"],
    designations: ["Women-Owned","Small Business"], cert_type: "digital" as const,
    cert_status: "active" as const, trust_score: 94, blockchain_verified: true,
    women_owned: true, last_verified: "2026-04-10",
    business_summary: "Cloud-native IT and procurement automation partner for enterprise buyers.",
    clients_worked_with: "Worked with 14 enterprise clients (mock)",
  },
  {
    id: "s2", business_name: "Aurora Manufacturing Co.", country: "Canada",
    industry_codes: ["31-33"], category_codes: ["23000000"],
    designations: ["Women-Led Business"], cert_type: "self" as const,
    cert_status: "active" as const, trust_score: 87, blockchain_verified: false,
    women_owned: true, last_verified: "2026-04-01",
    business_summary: "Precision manufacturing supplier focused on sustainable materials.",
    clients_worked_with: "Worked with 9 regional clients (mock)",
  },
  {
    id: "s3", business_name: "Pacific Logistics Group", country: "United Kingdom",
    industry_codes: ["48-49"], category_codes: ["78000000"],
    designations: ["Women-Owned","Women-Managed"], cert_type: "digital" as const,
    cert_status: "active" as const, trust_score: 91, blockchain_verified: true,
    women_owned: true, last_verified: "2026-03-28",
    business_summary: "Cross-border logistics and warehousing for global distribution networks.",
    clients_worked_with: "Worked with 21 logistics buyers (mock)",
  },
  {
    id: "s4", business_name: "Sunrise Consulting LLC", country: "Australia",
    industry_codes: ["54"], category_codes: ["80000000"],
    designations: ["Small Business"], cert_type: "self" as const,
    cert_status: "active" as const, trust_score: 79, blockchain_verified: false,
    women_owned: true, last_verified: "2026-03-18",
    business_summary: "Operations and strategy consulting for SME procurement transformation.",
    clients_worked_with: "Worked with 6 consulting clients (mock)",
  },
  {
    id: "s5", business_name: "Bright Futures Education", country: "India",
    industry_codes: ["61"], category_codes: ["86000000"],
    designations: ["Women-Led Business","Small Business"], cert_type: "none" as const,
    cert_status: "pending" as const, trust_score: 61, blockchain_verified: false,
    women_owned: true, last_verified: "2026-02-26",
    business_summary: "Education services provider focused on digital workforce upskilling.",
    clients_worked_with: "Worked with 4 institutional clients (mock)",
  },
];
