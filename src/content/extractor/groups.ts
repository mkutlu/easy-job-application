export interface RadioCheckboxGroup {
  name: string;
  type: "radio" | "checkbox";
  inputs: HTMLInputElement[];
}

let formCounter = 0;
const formKeys = new WeakMap<HTMLFormElement, string>();
function getFormKey(form: HTMLFormElement): string {
  let key = formKeys.get(form);
  if (!key) {
    key = `form-${formCounter++}`;
    formKeys.set(form, key);
  }
  return key;
}

// Radios sharing a `name` are always one logical field. Checkboxes sharing a
// `name` with 2+ elements are treated as a multi-select group too (e.g. "which
// of these apply"); a checkbox with a unique/empty name stays a standalone
// boolean field. Field order/count is never assumed stable across scans, so
// this re-groups from scratch every time it's called.
export function groupRadiosAndCheckboxes(inputs: HTMLInputElement[]): {
  groups: RadioCheckboxGroup[];
  standalone: HTMLInputElement[];
} {
  const byKey = new Map<string, { type: "radio" | "checkbox"; list: HTMLInputElement[] }>();
  const standalone: HTMLInputElement[] = [];

  for (const input of inputs) {
    if (input.type !== "radio" && input.type !== "checkbox") continue;
    const name = input.name?.trim();
    if (!name) {
      standalone.push(input);
      continue;
    }
    const formKey = input.form ? getFormKey(input.form) : "no-form";
    const key = `${formKey}::${input.type}::${name}`;
    const entry = byKey.get(key) ?? { type: input.type, list: [] };
    entry.list.push(input);
    byKey.set(key, entry);
  }

  const groups: RadioCheckboxGroup[] = [];
  byKey.forEach(({ type, list }) => {
    if (type === "radio" || list.length > 1) {
      groups.push({ name: list[0].name, type, inputs: list });
    } else {
      standalone.push(...list);
    }
  });

  return { groups, standalone };
}
