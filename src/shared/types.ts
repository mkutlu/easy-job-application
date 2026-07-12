// Shared types crossing the content script <-> background <-> options boundaries.
// Keep these framework-free (no DOM types beyond string/primitive fields) so they
// can be freely JSON-serialized across chrome.runtime message passing.

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "url"
  | "password"
  | "select"
  | "radio"
  | "checkbox"
  | "textarea"
  | "date"
  | "file"
  | "unknown";

export interface FieldDescriptor {
  id: string; // ephemeral per-scan id; source of truth for writes is elementRegistry, not domSelector
  domSelector: string; // best-effort CSS path for debugging/round-tripping, not used to locate the live element
  type: FieldType;
  label: string | null;
  labelSource:
    | "for"
    | "wrapping"
    | "aria-label"
    | "aria-labelledby"
    | "placeholder"
    | "nearestText"
    | "none";
  placeholder: string | null;
  name: string | null;
  autocomplete: string | null;
  options: string[];
  required: boolean;
  surroundingText: string | null;
  sectionHeading: string | null;
}

// Sourced from the page's own schema.org JobPosting structured data (see
// content/extractor/jobPosting.ts) -- describes the *position*, never the
// applicant. Used so the AI can answer "which location are you applying
// for?"-style questions from the posting itself instead of leaving them in
// missingInfo or, worse, confusing them with the applicant's home address.
export interface JobPostingContext {
  title: string | null;
  location: string | null;
  company: string | null;
  employmentType: string | null;
}

export interface PageContext {
  url: string;
  pageTitle: string;
  detectedFormHeadings: string[];
  jobPosting: JobPostingContext | null;
}

export type Confidence = "high" | "medium" | "low";

export interface FieldMapping {
  fieldId: string;
  value: string;
  confidence: Confidence;
  reasoning?: string;
  // Only meaningful when the request included entryHints: names the single
  // profile[section][index] key this value was copied from verbatim (e.g.
  // "startDate"), so background/anthropicClient.ts can cache the field-label
  // -> key correspondence and reapply it to later entries of the same
  // repeated modal without another API call. Omitted whenever the value
  // isn't a direct single-field copy (computed/combined/reasoned about).
  sourceKey?: string;
}

export interface MissingInfoItem {
  fieldId: string;
  label: string;
  question: string;
  suggestedKey: string;
}

export interface AIResponse {
  mappings: FieldMapping[];
  missingInfo: MissingInfoItem[];
}

// --- Profile store (JSON-Resume-inspired core + application-specific extras) ---

export interface ProfileLocation {
  address?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface ProfileBasics {
  name: string;
  email: string;
  phone: string;
  url?: string;
  summary?: string;
  location: ProfileLocation;
}

export interface WorkExperience {
  id: string;
  name: string; // company name
  position: string;
  location?: string; // e.g. "New York, NY" or "Remote"
  startDate: string;
  endDate: string; // empty string = present
  url?: string;
  summary?: string;
  highlights: string[];
}

export interface Education {
  id: string;
  institution: string;
  area: string;
  studyType: string;
  startDate: string;
  endDate: string;
}

export interface Language {
  id: string;
  language: string;
  fluency?: string;
}

export interface Skill {
  id: string;
  name: string;
  level?: string;
  keywords: string[];
}

export interface EeoAnswers {
  gender?: string;
  race?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
}

export interface ApplicationExtras {
  workAuthorization?: string;
  requiresSponsorship?: string;
  desiredSalary?: string;
  noticePeriod?: string;
  howHeardAboutUs?: string;
  eeo: EeoAnswers;
}

export interface Profile {
  basics: ProfileBasics;
  work: WorkExperience[];
  education: Education[];
  languages: Language[];
  skills: Skill[];
  extras: ApplicationExtras;
  // Flat bucket for missingInfo answers keyed by the AI's suggestedKey.
  // Always sent to the AI alongside the structured sections above so the
  // model stops asking about things the user already answered once.
  extraQA: Record<string, string>;
}

export const EMPTY_PROFILE: Profile = {
  basics: { name: "", email: "", phone: "", location: {} },
  work: [],
  education: [],
  languages: [],
  skills: [],
  extras: { eeo: {} },
  extraQA: {},
};

// Profile array sections that some ATSes only let you fill one entry of at a
// time (an "Add work experience" modal, reopened per entry) rather than as a
// single repeatable list on the page. See content/ui/Overlay.tsx.
export type RepeatSection = "work" | "education" | "languages";
export type RepeatEntryHints = Partial<Record<RepeatSection, number>>;

// --- Message passing between content script and background service worker ---

export interface MapFieldsRequest {
  type: "MAP_FIELDS";
  descriptors: FieldDescriptor[];
  pageContext: PageContext;
  entryHints?: RepeatEntryHints;
}

export interface MapFieldsResponse {
  ok: boolean;
  result?: AIResponse;
  error?: string;
}

export interface SaveAnswerRequest {
  type: "SAVE_ANSWER";
  suggestedKey: string;
  value: string;
}

export interface SaveAnswerResponse {
  ok: boolean;
  error?: string;
}

export type BackgroundRequest = MapFieldsRequest | SaveAnswerRequest;
