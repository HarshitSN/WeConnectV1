// ── User & Auth ───────────────────────────────────────────────────────────────
export type UserRole = "wob_owner" | "team_member" | "assessor" | "buyer" | "admin" | "super_admin";

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  mfa_enabled: boolean;
  created_at: string;
}

// ── Business ──────────────────────────────────────────────────────────────────
export type BusinessStatus = "draft" | "pending_verification" | "verified" | "certified" | "rejected" | "suspended";
export type CertType = "none" | "self" | "digital" | "auditor";
export type CertStatus = "pending" | "in_progress" | "active" | "expired" | "revoked";
export type VerificationStatus = "pending" | "running" | "passed" | "manual_review" | "failed";

export interface OwnershipEntry {
  name: string;
  gender: "female" | "male" | "non_binary" | "other";
  percent: number;
}

export interface Business {
  id: string;
  user_id: string;
  legal_name: string;
  dba?: string;
  ein?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip?: string;
  industry_codes: string[];      // NAICS
  category_codes: string[];      // UNSPSC
  designations: string[];
  additional_certs: string[];
  num_employees?: string;
  revenue_range?: string;
  founded_date?: string;
  ownership_structure: OwnershipEntry[];
  business_description: string;
  women_owned: boolean;
  webank_certified?: boolean;
  visa_type?: string;
  status: BusinessStatus;
  registration_step: number;     // 1-8, tracks wizard progress
  registration_complete: boolean;
}

// ── Registration ──────────────────────────────────────────────────────────────
export interface RegistrationState {
  // Q1
  business_name: string;
  // Q2
  women_owned: boolean | null;
  // Q3
  country: string;
  us_citizen?: boolean | null;
  webank_certified?: boolean | null;
  visa_type?: string;
  // Q4
  naics_codes: string[];
  // Q5
  unspsc_codes: string[];
  // Q6
  designations: string[];
  // Q7
  additional_certs: string;
  // Q8
  business_description: string;
  // Extra profile fields
  ein?: string;
  address?: string;
  num_employees?: string;
  revenue_range?: string;
  ownership_structure: OwnershipEntry[];
  // Payment
  cert_type?: CertType;
  payment_complete?: boolean;
}

export type ConversationMessageType = "bot_question" | "user_answer" | "bot_confirm" | "system_hint";

export interface ConversationMessage {
  id: string;
  type: ConversationMessageType;
  text: string;
  timestamp: string;
  pointer?: ConversationPointer;
}

export type ConversationStepId =
  | "business_name"
  | "women_owned"
  | "country"
  | "us_citizen"
  | "visa_type"
  | "webank_certified"
  | "naics_codes"
  | "unspsc_codes"
  | "designations"
  | "owner_details"
  | "owner_add_more"
  | "num_employees"
  | "revenue_range"
  | "additional_certs"
  | "business_description"
  | "cert_type"
  | "assessor"
  | "done";

export interface ConversationPointer {
  stepId: ConversationStepId;
  ownerIndex?: number;
}

export interface StepValidationResult {
  ok: boolean;
  error?: string;
}

export interface AgentParseResult {
  ok: boolean;
  confidence: number;
  updates?: Partial<RegistrationState>;
  ownershipUpdate?: OwnershipEntry[];
  assessorId?: string;
  confirmation: string;
  clarification?: string;
  next: ConversationPointer;
  done?: boolean;
}

// ── Verification ──────────────────────────────────────────────────────────────
export interface VerificationResult {
  id: string;
  business_id: string;
  status: VerificationStatus;
  risk_score: number;           // 0-100; higher = safer per PRD
  sanctions_check: "clear" | "flagged" | "pending";
  entity_check: "verified" | "not_found" | "mismatch" | "pending";
  address_check: "valid" | "invalid" | "pending";
  duplicate_check: "unique" | "duplicate" | "pending";
  notes?: string;
  created_at: string;
}

// ── Certification ─────────────────────────────────────────────────────────────
export interface Certificate {
  id: string;
  business_id: string;
  cert_number: string;
  cert_type: CertType;
  status: CertStatus;
  issue_date?: string;
  expiration_date?: string;
  qid_blockchain_hash?: string;
  verification_url?: string;
  pdf_path?: string;
  renewal_count: number;
  assessor_id?: string;
}

// ── Assessor ──────────────────────────────────────────────────────────────────
export interface Assessor {
  id: string;
  name: string;
  credentials: string[];
  rating: number;
  review_count: number;
  fee_self: number;
  fee_digital: number;
  fee_industry: number;
  bio: string;
  verified: boolean;
}

// ── Document ──────────────────────────────────────────────────────────────────
export type DocType =
  | "articles_of_incorporation"
  | "ownership_docs"
  | "governance_docs"
  | "shareholder_docs"
  | "webank_cert"
  | "other";

export interface Document {
  id: string;
  business_id: string;
  type: DocType;
  filename: string;
  size: number;
  uploaded_at: string;
  ocr_status: "pending" | "complete" | "failed";
  verification_status: "pending" | "verified" | "rejected";
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface ReviewQueueItem {
  id: string;
  business: Business;
  verification: VerificationResult;
  risk_score: number;
  age_hours: number;
  documents: Document[];
  ai_summary?: string;
}

// ── Buyer ─────────────────────────────────────────────────────────────────────
export interface SupplierSearchParams {
  query?: string;
  cert_type?: CertType;
  cert_status?: CertStatus;
  naics_code?: string;
  country?: string;
  women_owned?: boolean;
  blockchain_verified?: boolean;
  page?: number;
}
