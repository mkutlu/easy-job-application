import { getApiKey } from "../shared/apiKeyStore";
import { getProfile, saveExtraAnswer } from "../shared/profileStore";
import type {
  BackgroundRequest,
  MapFieldsResponse,
  SaveAnswerResponse,
} from "../shared/types";
import { mapFields } from "./anthropicClient";

// The API key never leaves this service worker: content scripts (which run
// in page context) only ever send/receive plain descriptors and mappings
// over chrome.runtime messaging, never the key itself.

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  if (message.type === "MAP_FIELDS") {
    (async () => {
      try {
        const [apiKey, profile] = await Promise.all([getApiKey(), getProfile()]);
        const result = await mapFields(apiKey, message.descriptors, message.pageContext, profile);
        const response: MapFieldsResponse = { ok: true, result };
        sendResponse(response);
      } catch (err) {
        const response: MapFieldsResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      }
    })();
    return true; // keep the message channel open for the async response
  }

  if (message.type === "SAVE_ANSWER") {
    (async () => {
      try {
        await saveExtraAnswer(message.suggestedKey, message.value);
        const response: SaveAnswerResponse = { ok: true };
        sendResponse(response);
      } catch (err) {
        const response: SaveAnswerResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(response);
      }
    })();
    return true;
  }

  return false;
});
