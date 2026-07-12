// Model id is a config constant so it's swappable without touching the
// extractor/mapping/writer logic.
export const MODEL_ID = "claude-haiku-4-5";

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const MAX_TOKENS = 4096;

// Heuristic, not an exact token count: past this many fields in one form,
// split the mapping call into sequential chunks to stay under context/latency
// budgets.
export const CHUNK_FIELD_COUNT = 40;

// Safety ceiling on a single request's estimated input token count (see
// estimateTokens() in anthropicClient.ts). Chunking already keeps normal
// requests well under this; it exists to catch a mistake -- a mis-extraction,
// runaway profile data, etc. -- producing an unexpectedly huge payload, and
// refuse to send it rather than silently spending on it.
export const MAX_REQUEST_TOKENS_ESTIMATE = 20000;

// Shared between content/index.tsx (which sets it) and the extractor's
// open-overlay heuristic (which must never mistake the floating "Fill this
// form" host for a page modal).
export const OVERLAY_HOST_ID = "easy-job-application-host";
