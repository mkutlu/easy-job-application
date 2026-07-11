// MVP: the user supplies their own Anthropic API key, stored in plain text in
// chrome.storage.local (not synced). The options page UI must make this
// storage/cost/data-sharing tradeoff explicit to the user -- see
// ApiKeyEditor.tsx. This is intentionally the only place that reads/writes
// the key so a future hosted backend proxy can replace it without touching
// anything else (see background/anthropicClient.ts).
const STORAGE_KEY = "anthropicApiKey";

export async function getApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as string | undefined) ?? "";
}

export async function saveApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: key });
}
