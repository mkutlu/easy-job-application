import {
  ANTHROPIC_API_URL,
  ANTHROPIC_VERSION,
  CHUNK_FIELD_COUNT,
  MAX_TOKENS,
  MODEL_ID,
} from "../shared/constants";
import type {
  AIResponse,
  FieldDescriptor,
  PageContext,
  Profile,
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
- Respond with JSON only. No prose, no markdown code fences, no explanation outside the JSON.

Respond with exactly this JSON shape:
{
  "mappings": [{ "fieldId": string, "value": string, "confidence": "high" | "medium" | "low", "reasoning": string (optional, short) }],
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

async function callAnthropic(
  apiKey: string,
  descriptors: FieldDescriptor[],
  pageContext: PageContext,
  profile: Profile,
): Promise<AIResponse> {
  const scopedProfile: Profile = {
    ...profile,
    extraQA: filterRelevantExtraQA(profile.extraQA, descriptors),
  };
  const userMessage = JSON.stringify({ pageContext, fields: descriptors, profile: scopedProfile });

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

export async function mapFields(
  apiKey: string,
  descriptors: FieldDescriptor[],
  pageContext: PageContext,
  profile: Profile,
): Promise<AIResponse> {
  if (!apiKey) {
    throw new Error("No Anthropic API key configured. Set one in the extension options page.");
  }
  if (descriptors.length === 0) {
    return { mappings: [], missingInfo: [] };
  }

  if (descriptors.length <= CHUNK_FIELD_COUNT) {
    return callAnthropic(apiKey, descriptors, pageContext, profile);
  }

  // Chunk large forms into sequential calls and merge results.
  const merged: AIResponse = { mappings: [], missingInfo: [] };
  for (let i = 0; i < descriptors.length; i += CHUNK_FIELD_COUNT) {
    const chunk = descriptors.slice(i, i + CHUNK_FIELD_COUNT);
    const result = await callAnthropic(apiKey, chunk, pageContext, profile);
    merged.mappings.push(...result.mappings);
    merged.missingInfo.push(...result.missingInfo);
  }
  return merged;
}
