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
