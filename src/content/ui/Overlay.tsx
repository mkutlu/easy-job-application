import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  AIResponse,
  FieldDescriptor,
  MissingInfoItem,
  RepeatSection,
} from "../../shared/types";
import { getElement, getGroup } from "../elementRegistry";
import { scanForFields } from "../extractor/scan";
import { requestFieldMapping, saveAnswer } from "../messaging";
import { writeMappings } from "../writer/domWriter";
import { MissingInfoPanel } from "./MissingInfoPanel";

// Some ATSes (e.g. Walmart's) only show one work-experience/education/language
// entry's worth of fields at a time, in an "Add X" modal reopened per entry,
// rather than a single repeatable list on the page. There's no per-site
// adapter for this -- just a generic keyword match against whatever heading
// dominates the currently-visible fields, same spirit as the rest of the
// extractor's label/section heuristics.
const REPEAT_SECTION_KEYWORDS: [RepeatSection, RegExp][] = [
  ["work", /\bwork\s*experience\b|\bemployment\b|\bjob\s*history\b|\bprevious\s*employer/i],
  ["education", /\beducation\b|\bacademic\b|\bschool(ing)?\b|\bdegree\b/i],
  ["languages", /\blanguages?\b/i],
];

// Picks the heading shared by the currently-visible fields (the open modal's
// own heading, when one is open). Wrong guesses aren't low-cost -- a wrong
// section desyncs the per-section fill counter from the entries actually on
// screen (e.g. reusing work[1] a second time, or advancing "education" while
// a work modal is open) -- so this only trusts per-field sectionHeading data,
// which is scoped to what's actually visible right now. It deliberately does
// NOT fall back to pageContext.detectedFormHeadings: that list is scanned
// from the whole document regardless of visibility, so if the page has, say,
// both a "Work Experience" and an "Education" heading anywhere in the DOM,
// using it while per-field headings are unresolved (common when a modal's
// title isn't a real heading tag) can match the wrong section depending on
// DOM order alone. No signal at all is preferable to a wrong one here.
function detectRepeatSection(descriptors: FieldDescriptor[]): RepeatSection | null {
  const headingCounts = new Map<string, number>();
  for (const d of descriptors) {
    if (d.sectionHeading) headingCounts.set(d.sectionHeading, (headingCounts.get(d.sectionHeading) ?? 0) + 1);
  }
  const candidates = [...headingCounts.entries()].sort((a, b) => b[1] - a[1]).map(([heading]) => heading);

  const matches = new Set<RepeatSection>();
  for (const heading of candidates) {
    const match = REPEAT_SECTION_KEYWORDS.find(([, re]) => re.test(heading));
    if (match) matches.add(match[0]);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

// Identifies "the same modal reopened" independent of heading detection --
// a fresh "Add work experience" modal always presents the same set of
// field labels every time it's opened, regardless of which entry it's
// about to hold. Used to cache detectRepeatSection's result per shape (see
// sectionInstancesRef) so a single successful heading match is trusted for
// every subsequent open of that same modal, rather than re-running
// (and re-risking) heading detection on every click.
function computeShapeSignature(descriptors: FieldDescriptor[]): string {
  return descriptors
    .map((d) => {
      const label = normalizeLabel(d.label);
      if (label) return label;
      // d.id is an ephemeral per-scan id (see FieldDescriptor) -- it's
      // different on every single scan even for the exact same on-screen
      // field, so it must never be used here. Using it as the fallback key
      // previously made the signature differ on every open whenever any
      // field in the modal had no resolvable label (common for custom date
      // pickers), which meant the shape never matched a cached entry --
      // every open was treated as a brand-new modal with count reset to 0,
      // so every entry silently got filled from profile[section][0]
      // regardless of which one was actually open. Built from stable DOM
      // attributes instead, none of which change between reopens of the
      // same modal.
      return `#${d.type}:${d.name ?? ""}:${d.placeholder ?? ""}:${d.autocomplete ?? ""}:${d.options.join(",")}:${d.sectionHeading ?? ""}`;
    })
    .sort()
    .join("|");
}

type Status =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

// Explicit trigger by design (brief section 10 default): scanning + calling
// the AI costs the user's own API budget and writes into the page, so it
// only happens on a deliberate click, never automatically on page load.
function normalizeLabel(label: string | null): string | null {
  if (!label) return null;
  const trimmed = label.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function Overlay() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [descriptors, setDescriptors] = useState<FieldDescriptor[]>([]);
  const [missingInfo, setMissingInfo] = useState<MissingInfoItem[]>([]);

  // Answers given inline this session, keyed by normalized field label. A
  // fresh scan assigns brand-new ephemeral fieldIds even for the same
  // on-screen field, and the AI has no guarantee of reconnecting a field to
  // an extraQA entry it wrote on a *previous* call -- so re-clicking "Fill
  // this form" on the same page must not depend on the model to avoid
  // re-asking a question the user just answered. This cache makes that
  // deterministic; profile.extraQA (see shared/profileStore.ts) is what
  // carries the answer across page loads/other forms instead.
  const answeredByLabelRef = useRef<Map<string, string>>(new Map());

  // Tracks each distinct repeat-entry modal (keyed by computeShapeSignature
  // -- its field labels, which are identical every time that modal is
  // reopened) to which RepeatSection it was detected as and how many times
  // it's already been filled (and had at least one field written) on this
  // page. Keyed by shape rather than by RepeatSection directly so that
  // detectRepeatSection's heading-keyword heuristic only has to succeed
  // ONCE per modal, the first time it's opened -- every later open of the
  // exact same modal reuses that cached section instead of re-running
  // (and re-risking) heading detection, since a flaky/ambiguous heading
  // match on a later open was observed desyncing the fill index (see
  // repeat-entry-modal-fill memory). count is the next zero-based index to
  // fill from profile[section], passed to the AI as entryHints.
  const sectionInstancesRef = useRef<Map<string, { section: RepeatSection; count: number }>>(new Map());

  // Reset a stale "done"/"error" status after a large DOM mutation batch
  // (e.g. the site advanced to the next step of a multi-step form), so the
  // button doesn't keep showing results from a form that's no longer on
  // screen. Deliberately does NOT auto-rescan or auto-refill -- filling only
  // ever happens on an explicit click.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    let mutationCount = 0;
    let timer: number | undefined;
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mutationCount > 20 && statusRef.current.kind !== "working") {
          setStatus({ kind: "idle" });
          setMissingInfo([]);
        }
        mutationCount = 0;
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const runFill = useCallback(async () => {
    setStatus({ kind: "working", label: "Scanning form..." });
    setMissingInfo([]);
    try {
      const { descriptors: found, pageContext, crossOriginIframeCount } = scanForFields();
      setDescriptors(found);

      if (found.length === 0) {
        setStatus({ kind: "error", message: "No fillable fields found on this page." });
        return;
      }

      const shapeSignature = computeShapeSignature(found);
      let instance = sectionInstancesRef.current.get(shapeSignature);
      if (!instance) {
        const detected = detectRepeatSection(found);
        if (detected) {
          instance = { section: detected, count: 0 };
          sectionInstancesRef.current.set(shapeSignature, instance);
        }
        console.info("[easy-job-application] repeat-entry detection", {
          shapeSignature,
          detected,
          cached: false,
        });
      } else {
        console.info("[easy-job-application] repeat-entry detection", {
          shapeSignature,
          detected: instance.section,
          count: instance.count,
          cached: true,
        });
      }
      const repeatSection = instance?.section ?? null;
      const entryHints = instance ? { [instance.section]: instance.count } : undefined;

      // Fields whose label matches something already answered this session
      // get written directly and are excluded from the AI request entirely
      // -- no need to spend a call re-deriving an answer we already have.
      // Skipped entirely inside a detected repeat section: labels like
      // "Company name" legitimately repeat across entries with a *different*
      // value each time, so a cached answer from entry 1 must not leak into
      // entry 2 -- every field there has to go through the AI with the
      // current entryHints index instead.
      const preAnswered = repeatSection
        ? []
        : found.filter((d) => {
            const key = normalizeLabel(d.label);
            return key !== null && answeredByLabelRef.current.has(key);
          });
      const toSend = found.filter((d) => !preAnswered.includes(d));

      const preAnsweredOutcomes =
        preAnswered.length > 0
          ? writeMappings(
              found,
              preAnswered.map((d) => ({
                fieldId: d.id,
                value: answeredByLabelRef.current.get(normalizeLabel(d.label)!)!,
                confidence: "high" as const,
              })),
            )
          : [];

      let aiMappings: AIResponse | undefined;
      if (toSend.length > 0) {
        setStatus({ kind: "working", label: `Asking AI to map ${toSend.length} field${toSend.length === 1 ? "" : "s"}...` });
        const response = await requestFieldMapping(toSend, pageContext, entryHints);
        if (!response.ok || !response.result) {
          setStatus({ kind: "error", message: response.error ?? "Mapping request failed." });
          return;
        }
        aiMappings = response.result;
      }

      const outcomes = [
        ...preAnsweredOutcomes,
        ...(aiMappings ? writeMappings(found, aiMappings.mappings) : []),
      ];
      const filled = outcomes.filter((o) => o.status === "written").length;
      const skipped = outcomes.filter((o) => o.status === "skipped").length;

      if (instance && filled === 0) {
        console.warn(
          "[easy-job-application] repeat-entry fill wrote 0 fields -- entry index will NOT advance, next click will retry the same index",
          { shapeSignature, section: instance.section, count: instance.count },
        );
      }
      if (instance && filled > 0) {
        instance.count += 1;
      }

      let message = `Filled ${filled} field${filled === 1 ? "" : "s"}.`;
      if (skipped > 0) message += ` ${skipped} skipped (see console for reasons).`;
      if (crossOriginIframeCount > 0) {
        message += ` Note: ${crossOriginIframeCount} embedded cross-origin form${crossOriginIframeCount === 1 ? "" : "s"} on this page could not be reached.`;
      }
      const fileFields = found.filter((d) => d.type === "file");
      if (fileFields.length > 0) {
        message += ` ${fileFields.length} file upload field${fileFields.length === 1 ? "" : "s"} need${fileFields.length === 1 ? "s" : ""} to be attached manually.`;
      }

      console.info("[easy-job-application] write outcomes", outcomes);
      setStatus({ kind: "done", message });
      setMissingInfo(aiMappings?.missingInfo ?? []);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const handleAnswer = useCallback(
    (item: MissingInfoItem, value: string) => {
      const descriptor = descriptors.find((d) => d.id === item.fieldId);
      if (descriptor && (getElement(item.fieldId) || getGroup(item.fieldId))) {
        writeMappings(descriptors, [{ fieldId: item.fieldId, value, confidence: "high" }]);
      }
      const labelKey = normalizeLabel(descriptor?.label ?? item.label);
      if (labelKey) answeredByLabelRef.current.set(labelKey, value);
      void saveAnswer(item.suggestedKey, value);
      setMissingInfo((prev) => prev.filter((i) => i.fieldId !== item.fieldId));
    },
    [descriptors],
  );

  const handleSkip = useCallback((item: MissingInfoItem) => {
    setMissingInfo((prev) => prev.filter((i) => i.fieldId !== item.fieldId));
  }, []);

  const isWorking = status.kind === "working";

  return (
    <div style={containerStyle}>
      {missingInfo.length > 0 && (
        <MissingInfoPanel
          items={missingInfo}
          descriptors={descriptors}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
        />
      )}
      {(status.kind === "done" || status.kind === "error" || isWorking) && (
        <div style={statusBubbleStyle(status.kind)}>
          {isWorking ? status.label : status.kind === "done" ? status.message : status.message}
        </div>
      )}
      <button
        onClick={runFill}
        // Some ATS modals treat losing DOM focus (or focus arriving outside
        // their focus trap) as a signal to close themselves. Blocking the
        // default mousedown focus-shift keeps focus inside the page's open
        // modal while still letting the click event fire normally.
        onMouseDown={(e) => e.preventDefault()}
        disabled={isWorking}
        style={buttonStyle(isWorking)}
      >
        {isWorking ? "Working..." : "Fill this form"}
      </button>
    </div>
  );
}

const containerStyle: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  zIndex: 2147483647,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    background: disabled ? "#a5b4fc" : "#4f46e5",
    color: "#ffffff",
    border: "none",
    borderRadius: 24,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    boxShadow: "0 4px 14px rgba(79,70,229,0.4)",
  };
}

function statusBubbleStyle(kind: Status["kind"]): CSSProperties {
  return {
    background: kind === "error" ? "#fef2f2" : "#ffffff",
    color: kind === "error" ? "#991b1b" : "#111827",
    border: `1px solid ${kind === "error" ? "#fecaca" : "#e5e7eb"}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
    maxWidth: 260,
    marginBottom: 8,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
  };
}
