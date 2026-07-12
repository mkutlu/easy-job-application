import type {
  FieldDescriptor,
  MapFieldsRequest,
  MapFieldsResponse,
  PageContext,
  RepeatEntryHints,
  SaveAnswerRequest,
  SaveAnswerResponse,
} from "../shared/types";

export async function requestFieldMapping(
  descriptors: FieldDescriptor[],
  pageContext: PageContext,
  entryHints?: RepeatEntryHints,
): Promise<MapFieldsResponse> {
  const message: MapFieldsRequest = { type: "MAP_FIELDS", descriptors, pageContext, entryHints };
  return chrome.runtime.sendMessage(message);
}

export async function saveAnswer(
  suggestedKey: string,
  value: string,
): Promise<SaveAnswerResponse> {
  const message: SaveAnswerRequest = { type: "SAVE_ANSWER", suggestedKey, value };
  return chrome.runtime.sendMessage(message);
}
