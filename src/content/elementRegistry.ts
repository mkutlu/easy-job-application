// In-memory Map from a scan's ephemeral fieldId to the live element(s) it
// describes. This -- not FieldDescriptor.domSelector -- is the source of
// truth the DOM writer uses: elements never leave this JS realm (even ones
// reached inside same-origin iframes/shadow roots), so a direct reference is
// simpler and more reliable than re-querying by a generated selector. The
// registry is rebuilt on every scan since field order/count can change
// between scans (dynamic forms, multi-step flows).
const singleElements = new Map<string, HTMLElement>();
const groupElements = new Map<string, HTMLInputElement[]>();

export function resetRegistry(): void {
  singleElements.clear();
  groupElements.clear();
}

export function registerElement(id: string, el: HTMLElement): void {
  singleElements.set(id, el);
}

export function registerGroup(id: string, inputs: HTMLInputElement[]): void {
  groupElements.set(id, inputs);
}

export function getElement(id: string): HTMLElement | undefined {
  return singleElements.get(id);
}

export function getGroup(id: string): HTMLInputElement[] | undefined {
  return groupElements.get(id);
}
