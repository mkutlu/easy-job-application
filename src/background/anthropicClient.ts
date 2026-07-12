import {
  ANTHROPIC_API_URL,
  ANTHROPIC_VERSION,
  CHUNK_FIELD_COUNT,
  MAX_REQUEST_TOKENS_ESTIMATE,
  MAX_TOKENS,
  MODEL_ID,
} from "../shared/constants";
import type {
  AIResponse,
  FieldDescriptor,
  PageContext,
  Profile,
  RepeatEntryHints,
  RepeatSection,
} from "../shared/types";

// This is the one seam through which the extension talks to a model. The
// extractor and DOM writer never know an LLM is involved; they only deal in
// FieldDescriptor[] and AIResponse. Swapping the user-supplied-key model for
// a hosted backend proxy (e.g. a Spring Boot BFF) later means changing only
// this file's request plumbing, not the callers.

const SYSTEM_PROMPT = `You map a job applicant's existing profile data onto the fields of a job application form.

Rules:
- Only use facts present in the profile JSON you are given. Never invent or guess employment history, dates, salary figures, work-authorization status, or any other fact not present in the profile.
- The profile's "extraQA" object holds answers the user already gave to questions asked on previous forms, keyed by a short slug (the key names are informal, not stable identifiers). Before adding a field to "missingInfo", check whether any extraQA entry (by its value, or by a key name close to the field's label/topic) already answers it -- if so, map it directly instead of asking again.
- For yes/no fields asking whether the applicant has ever worked for, been employed by, contracted for, or is otherwise affiliated with a specific named company (commonly the hiring company itself or one of its subsidiaries) -- answer this directly by checking whether that company name appears (case-insensitive, substring match) in any profile.work[].name. If it does not appear, confidently map "No" rather than adding it to missingInfo. If it does appear, map "Yes". Only fall back to missingInfo if the field asks about a relationship that genuinely cannot be determined from company names alone (e.g. it names a parent company whose subsidiaries you cannot identify from the profile). Do not put this class of question in missingInfo just because the profile doesn't happen to have an extraQA entry for it -- prior employment is derivable from profile.work every time and should never need to be asked or cached.
- "pageContext.jobPosting" (when present) describes the job posting/position itself -- its title, location, employer, employment type -- sourced from the page's own structured data, not from the applicant. Use it only to answer questions about the position (e.g. "which location are you applying to?", "which role is this for?"). Never use it to answer a question about the applicant's own location, address, or citizenship -- those must come from profile.basics/extras or missingInfo, even if pageContext.jobPosting.location happens to look similar.
- If a field still cannot be confidently filled from the profile (including extraQA) or pageContext.jobPosting where applicable, put it in "missingInfo" instead of guessing a value.
- For "select", "radio", and "checkbox" fields, the "value" you return must exactly match one of that field's provided "options" strings (character for character). If none fit, use missingInfo instead.
- If the request includes "entryHints" (e.g. { "work": 1 }), the fields being mapped are a single repeated sub-entry form -- such as an "Add work experience" modal that only ever holds one entry's worth of fields on screen at a time, reopened once per entry. For each key present in entryHints, map those fields from profile.<key>[index] using the given zero-based index specifically, not index 0, because lower indices were already filled and saved in earlier instances of this same modal. If profile.<key> has no entry at that index, leave those fields in missingInfo instead of reusing an already-used entry. Treat every field in the request as belonging to that one entry even if the field's own "sectionHeading" is null or generic -- many ATS modals don't mark up their title as a real heading, so entryHints is the more reliable signal of context here, not the absence of a sectionHeading.
- When entryHints is present, also include a "sourceKey" on each mapping identifying the single profile field that value was copied from verbatim, so the same field->key correspondence can be reapplied to later entries of this same modal without asking you again: for "work" use one of "name" (company), "position", "location", "startDate", "endDate", "url", "summaryOrHighlights" (role/duties description, per the rule below); for "education" use one of "institution", "area", "studyType", "startDate", "endDate"; for "languages" use one of "language", "fluency". Omit "sourceKey" entirely for any mapping whose value you combined, computed, or reasoned about rather than copying directly -- an incorrect sourceKey would cause a wrong value to be silently reused on every later entry, so only include it when certain.
- A free-text ("textarea" or long-answer) field that is part of a work experience entry (per entryHints, a matching sectionHeading, or surrounding context) and asks to describe the role, position, duties, or responsibilities -- phrasings like "Role description", "Job description", "Description of duties", "Responsibilities", "What did you do in this role?" -- is answered by that entry's profile.work[].summary; if summary is empty, join profile.work[].highlights with newlines instead. This is directly derivable profile data, not a question for the applicant -- only fall back to missingInfo if both summary and highlights are empty for that entry. profile.education[] has no equivalent free-text description field, so a similar "describe this" field on an education entry has nothing to draw from and genuinely belongs in missingInfo.
- Respond with JSON only. No prose, no markdown code fences, no explanation outside the JSON.

Respond with exactly this JSON shape:
{
  "mappings": [{ "fieldId": string, "value": string, "confidence": "high" | "medium" | "low", "reasoning": string (optional, short), "sourceKey": string (optional, only when entryHints is present, see rule above) }],
  "missingInfo": [{ "fieldId": string, "label": string, "question": string, "suggestedKey": string }]
}`;

interface RawAIResponse {
  mappings?: unknown;
  missingInfo?: unknown;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

function coerceResponse(raw: RawAIResponse): AIResponse {
  const mappings = Array.isArray(raw.mappings)
    ? raw.mappings.filter(
        (m): m is AIResponse["mappings"][number] =>
          !!m &&
          typeof m === "object" &&
          typeof (m as Record<string, unknown>).fieldId === "string" &&
          typeof (m as Record<string, unknown>).value === "string",
      )
    : [];
  const missingInfo = Array.isArray(raw.missingInfo)
    ? raw.missingInfo.filter(
        (m): m is AIResponse["missingInfo"][number] =>
          !!m &&
          typeof m === "object" &&
          typeof (m as Record<string, unknown>).fieldId === "string" &&
          typeof (m as Record<string, unknown>).suggestedKey === "string",
      )
    : [];
  return { mappings, missingInfo };
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "you", "your", "yours", "i", "me", "my", "we", "our", "us",
  "do", "does", "did", "have", "has", "had", "will", "would", "should", "could",
  "this", "that", "these", "those", "it", "its",
  "for", "of", "to", "in", "on", "at", "with", "by", "as", "or", "and", "if",
  "please", "select", "enter", "field", "yes", "no", "not",
]);

function wordsOf(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> two words
      .split(/[^a-zA-Z0-9]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

// extraQA grows without bound as the user answers more one-off questions
// across sites, but only a handful of entries are ever relevant to a given
// form. Sending the whole bag on every AI call would waste tokens (and grow
// unboundedly over time), so only entries that share a meaningful word with
// one of the current page's field labels/context are included.
function filterRelevantExtraQA(
  extraQA: Record<string, string>,
  descriptors: FieldDescriptor[],
): Record<string, string> {
  const fieldWords = new Set<string>();
  for (const d of descriptors) {
    for (const w of wordsOf(d.label)) fieldWords.add(w);
    for (const w of wordsOf(d.surroundingText)) fieldWords.add(w);
    for (const w of wordsOf(d.sectionHeading)) fieldWords.add(w);
    for (const w of wordsOf(d.placeholder)) fieldWords.add(w);
  }
  if (fieldWords.size === 0) return {};

  const relevant: Record<string, string> = {};
  for (const [key, value] of Object.entries(extraQA)) {
    const entryWords = new Set([...wordsOf(key), ...wordsOf(value)]);
    for (const w of entryWords) {
      if (fieldWords.has(w)) {
        relevant[key] = value;
        break;
      }
    }
  }
  return relevant;
}

// Rough, deterministic estimate (no tokenizer dependency) -- ~4 chars/token
// is a standard approximation for English/JSON text. Only needs to be good
// enough to catch payloads that are wildly larger than expected.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function callAnthropic(
  apiKey: string,
  descriptors: FieldDescriptor[],
  pageContext: PageContext,
  profile: Profile,
  entryHints: RepeatEntryHints | undefined,
): Promise<AIResponse> {
  const scopedProfile: Profile = {
    ...profile,
    extraQA: filterRelevantExtraQA(profile.extraQA, descriptors),
  };
  const userMessage = JSON.stringify({
    pageContext,
    fields: descriptors,
    profile: scopedProfile,
    ...(entryHints && Object.keys(entryHints).length > 0 ? { entryHints } : {}),
  });

  const estimatedTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(userMessage);
  if (estimatedTokens > MAX_REQUEST_TOKENS_ESTIMATE) {
    throw new Error(
      `Refusing to send request: estimated ~${estimatedTokens} input tokens exceeds the ` +
        `${MAX_REQUEST_TOKENS_ESTIMATE} safety limit. This usually means an unexpectedly large ` +
        `number of fields or profile data was collected -- check the page and your profile size.`,
    );
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      // Required because this fetch runs in the extension's (browser)
      // service worker rather than a server -- without it the Anthropic API
      // rejects the request as a disallowed CORS/browser call. This is safe
      // here specifically because the key is the user's own, entered and
      // stored locally by them (see shared/apiKeyStore.ts), never a
      // shared/embedded secret exposed to arbitrary page content.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");

  let parsed: RawAIResponse;
  try {
    parsed = JSON.parse(extractJson(text)) as RawAIResponse;
  } catch {
    return { mappings: [], missingInfo: [] };
  }
  return coerceResponse(parsed);
}

function normalizeLabel(label: string | null): string | null {
  if (!label) return null;
  const trimmed = label.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

const ALLOWED_SOURCE_KEYS: Record<RepeatSection, ReadonlySet<string>> = {
  work: new Set(["name", "position", "location", "startDate", "endDate", "url", "summaryOrHighlights"]),
  education: new Set(["institution", "area", "studyType", "startDate", "endDate"]),
  languages: new Set(["language", "fluency"]),
};

// Field-label -> sourceKey, per repeatable section. Populated the first time
// a section's modal is filled by the AI (see updateRepeatFieldCache) and
// consulted on every later entry of the same modal (see tryFillFromCache)
// so that filling entries 2..N is a local lookup instead of another API
// call -- the field labels are identical across reopens of the same modal,
// only the profile index changes. Lives for the service worker's lifetime;
// if it gets evicted (MV3 workers restart on idle) the next call just falls
// back to the AI and repopulates it, so there's no correctness risk to losing it.
const repeatFieldCache = new Map<RepeatSection, Map<string, string>>();

function getSingleEntryHintSection(entryHints: RepeatEntryHints | undefined): RepeatSection | null {
  if (!entryHints) return null;
  const keys = Object.keys(entryHints) as RepeatSection[];
  return keys.length === 1 ? keys[0] : null;
}

function resolveSourceValue(
  profile: Profile,
  section: RepeatSection,
  index: number,
  sourceKey: string,
): string | undefined {
  const entry = profile[section][index] as unknown as Record<string, unknown> | undefined;
  if (!entry) return undefined;
  if (section === "work" && sourceKey === "summaryOrHighlights") {
    const work = entry as unknown as { summary?: string; highlights: string[] };
    if (work.summary?.trim()) return work.summary;
    if (work.highlights.length > 0) return work.highlights.join("\n");
    return undefined;
  }
  const value = entry[sourceKey];
  return typeof value === "string" && value.trim() ? value : undefined;
}

// Only usable once a prior call for this section has populated the cache
// AND every field currently on screen has a cached label -- if the modal's
// field set differs even slightly (a field added/removed/relabeled), this
// bails out to null so the caller falls back to a real AI call rather than
// silently mis-filling based on a stale mapping.
function tryFillFromCache(
  profile: Profile,
  section: RepeatSection,
  index: number,
  descriptors: FieldDescriptor[],
): AIResponse | null {
  const cached = repeatFieldCache.get(section);
  if (!cached) return null;

  const labels = descriptors.map((d) => normalizeLabel(d.label));
  if (labels.some((l) => l === null || !cached.has(l))) return null;

  const mappings: AIResponse["mappings"] = [];
  for (let i = 0; i < descriptors.length; i++) {
    const sourceKey = cached.get(labels[i]!)!;
    const value = resolveSourceValue(profile, section, index, sourceKey);
    if (value !== undefined) {
      mappings.push({ fieldId: descriptors[i].id, value, confidence: "high" });
    }
  }
  return { mappings, missingInfo: [] };
}

function updateRepeatFieldCache(
  section: RepeatSection,
  descriptors: FieldDescriptor[],
  mappings: AIResponse["mappings"],
): void {
  const allowed = ALLOWED_SOURCE_KEYS[section];
  const byId = new Map(descriptors.map((d) => [d.id, d]));
  for (const m of mappings) {
    const sourceKey = m.sourceKey;
    if (typeof sourceKey !== "string" || !allowed.has(sourceKey)) continue;
    const label = normalizeLabel(byId.get(m.fieldId)?.label ?? null);
    if (!label) continue;
    let cache = repeatFieldCache.get(section);
    if (!cache) {
      cache = new Map();
      repeatFieldCache.set(section, cache);
    }
    cache.set(label, sourceKey);
  }
}

function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "field";
}

// entryHints{section: index} reflects how many times that section's modal
// has already been filled+saved (Overlay.tsx's sectionFillCountRef); if the
// index has caught up to (or passed) the number of entries actually saved
// in the profile, there is nothing left to map this modal instance from.
// The system prompt already tells the model not to reuse an earlier index
// in this situation, but that's advisory only -- observed in practice
// reusing the last real entry's data instead of leaving fields in
// missingInfo. Checking here is deterministic and doesn't depend on the
// model complying, and it's strictly cheaper too since it skips the API
// call entirely.
function findExhaustedSection(
  profile: Profile,
  entryHints: RepeatEntryHints | undefined,
): RepeatSection | null {
  if (!entryHints) return null;
  for (const [section, index] of Object.entries(entryHints) as [RepeatSection, number][]) {
    if (index >= profile[section].length) return section;
  }
  return null;
}

export async function mapFields(
  apiKey: string,
  descriptors: FieldDescriptor[],
  pageContext: PageContext,
  profile: Profile,
  entryHints?: RepeatEntryHints,
): Promise<AIResponse> {
  if (!apiKey) {
    throw new Error("No Anthropic API key configured. Set one in the extension options page.");
  }
  if (descriptors.length === 0) {
    return { mappings: [], missingInfo: [] };
  }

  const exhaustedSection = findExhaustedSection(profile, entryHints);
  if (exhaustedSection) {
    const count = profile[exhaustedSection].length;
    return {
      mappings: [],
      missingInfo: descriptors.map((d) => ({
        fieldId: d.id,
        label: d.label ?? "",
        question: `Your profile only has ${count} ${exhaustedSection} entr${count === 1 ? "y" : "ies"} saved -- add another one in the extension options if this entry should be filled automatically, or fill it in manually.`,
        suggestedKey: slugify(d.label ?? d.id),
      })),
    };
  }

  const singleSection = getSingleEntryHintSection(entryHints);
  if (singleSection) {
    const fastPath = tryFillFromCache(profile, singleSection, entryHints![singleSection]!, descriptors);
    if (fastPath) return fastPath;
  }

  if (descriptors.length <= CHUNK_FIELD_COUNT) {
    const result = await callAnthropic(apiKey, descriptors, pageContext, profile, entryHints);
    if (singleSection) updateRepeatFieldCache(singleSection, descriptors, result.mappings);
    return result;
  }

  // Chunk large forms into sequential calls and merge results.
  const merged: AIResponse = { mappings: [], missingInfo: [] };
  for (let i = 0; i < descriptors.length; i += CHUNK_FIELD_COUNT) {
    const chunk = descriptors.slice(i, i + CHUNK_FIELD_COUNT);
    const result = await callAnthropic(apiKey, chunk, pageContext, profile, entryHints);
    if (singleSection) updateRepeatFieldCache(singleSection, chunk, result.mappings);
    merged.mappings.push(...result.mappings);
    merged.missingInfo.push(...result.missingInfo);
  }
  return merged;
}
