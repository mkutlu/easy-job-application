import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AIResponse, FieldDescriptor, MissingInfoItem } from "../../shared/types";
import { getElement, getGroup } from "../elementRegistry";
import { scanForFields } from "../extractor/scan";
import { requestFieldMapping, saveAnswer } from "../messaging";
import { writeMappings } from "../writer/domWriter";
import { MissingInfoPanel } from "./MissingInfoPanel";

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

      // Fields whose label matches something already answered this session
      // get written directly and are excluded from the AI request entirely
      // -- no need to spend a call re-deriving an answer we already have.
      const preAnswered = found.filter((d) => {
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
        const response = await requestFieldMapping(toSend, pageContext);
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
      <button onClick={runFill} disabled={isWorking} style={buttonStyle(isWorking)}>
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
