import type { FieldDescriptor, FieldMapping } from "../../shared/types";
import { getElement, getGroup } from "../elementRegistry";
import { isVisible } from "../extractor/scan";
import { flashSuccess, markForReview } from "./highlight";

export interface WriteOutcome {
  fieldId: string;
  status: "written" | "skipped";
  reason?: string;
}

const TRUTHY = new Set(["true", "yes", "checked", "1", "on"]);
const FALSY = new Set(["false", "no", "unchecked", "0", "off"]);

function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function writeSingle(
  el: HTMLElement,
  descriptor: FieldDescriptor,
  mapping: FieldMapping,
): WriteOutcome {
  if (descriptor.type === "file") {
    return { fieldId: mapping.fieldId, status: "skipped", reason: "file inputs can't be filled programmatically" };
  }
  if (!isVisible(el)) {
    return { fieldId: mapping.fieldId, status: "skipped", reason: "field is not visible" };
  }

  if (el instanceof HTMLSelectElement) {
    const index = descriptor.options.findIndex((opt) => opt === mapping.value);
    if (index === -1) {
      return { fieldId: mapping.fieldId, status: "skipped", reason: "value did not exactly match an option" };
    }
    el.selectedIndex = index;
    dispatchInputEvents(el);
    return { fieldId: mapping.fieldId, status: "written" };
  }

  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    const normalized = mapping.value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) {
      el.checked = true;
    } else if (FALSY.has(normalized)) {
      el.checked = false;
    } else {
      return { fieldId: mapping.fieldId, status: "skipped", reason: "value was not a recognizable boolean" };
    }
    dispatchInputEvents(el);
    return { fieldId: mapping.fieldId, status: "written" };
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = mapping.value;
    dispatchInputEvents(el);
    return { fieldId: mapping.fieldId, status: "written" };
  }

  return { fieldId: mapping.fieldId, status: "skipped", reason: "unsupported element" };
}

function writeGroup(
  inputs: HTMLInputElement[],
  descriptor: FieldDescriptor,
  mapping: FieldMapping,
): WriteOutcome {
  // descriptor.options[i] corresponds to inputs[i] -- both were built from
  // the same `inputs.map(...)` call at scan time (see extractor/scan.ts).
  if (descriptor.type === "radio") {
    const index = descriptor.options.findIndex((opt) => opt === mapping.value);
    if (index === -1 || !inputs[index]) {
      return { fieldId: mapping.fieldId, status: "skipped", reason: "value did not exactly match an option" };
    }
    if (!isVisible(inputs[index])) {
      return { fieldId: mapping.fieldId, status: "skipped", reason: "field is not visible" };
    }
    inputs[index].checked = true;
    dispatchInputEvents(inputs[index]);
    return { fieldId: mapping.fieldId, status: "written" };
  }

  // checkbox group: accept a comma/semicolon-separated list of selected options
  const tokens = mapping.value
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  let anyWritten = false;
  tokens.forEach((token) => {
    const index = descriptor.options.findIndex((opt) => opt === token);
    if (index !== -1 && inputs[index] && isVisible(inputs[index])) {
      inputs[index].checked = true;
      dispatchInputEvents(inputs[index]);
      anyWritten = true;
    }
  });
  if (!anyWritten) {
    return { fieldId: mapping.fieldId, status: "skipped", reason: "no values matched the available options" };
  }
  return { fieldId: mapping.fieldId, status: "written" };
}

function representativeElement(inputs: HTMLInputElement[]): HTMLElement | undefined {
  return inputs.find((i) => isVisible(i)) ?? inputs[0];
}

export function writeMappings(
  descriptors: FieldDescriptor[],
  mappings: FieldMapping[],
): WriteOutcome[] {
  const byId = new Map(descriptors.map((d) => [d.id, d]));

  return mappings.map((mapping) => {
    const descriptor = byId.get(mapping.fieldId);
    if (!descriptor) {
      return { fieldId: mapping.fieldId, status: "skipped", reason: "unknown field id" };
    }

    const group = getGroup(mapping.fieldId);
    const outcome = group
      ? writeGroup(group, descriptor, mapping)
      : (() => {
          const el = getElement(mapping.fieldId);
          if (!el) return { fieldId: mapping.fieldId, status: "skipped" as const, reason: "element no longer in DOM" };
          return writeSingle(el, descriptor, mapping);
        })();

    if (outcome.status === "written") {
      const target = group ? representativeElement(group) : getElement(mapping.fieldId);
      if (target) {
        if (mapping.confidence === "low") {
          markForReview(target, mapping.reasoning ?? "AI wasn't confident about this field -- please review.");
        } else {
          flashSuccess(target);
        }
      }
    }

    return outcome;
  });
}
