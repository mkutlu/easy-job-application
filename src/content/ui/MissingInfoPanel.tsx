import { useState, type CSSProperties } from "react";
import type { FieldDescriptor, MissingInfoItem } from "../../shared/types";

interface Props {
  items: MissingInfoItem[];
  descriptors: FieldDescriptor[];
  onAnswer: (item: MissingInfoItem, value: string) => void;
  onSkip: (item: MissingInfoItem) => void;
}

// One question at a time. If the underlying field has a fixed set of
// options (select/radio/checkbox), the answer is constrained to those
// options so it's guaranteed to land on the field correctly.
export function MissingInfoPanel({ items, descriptors, onAnswer, onSkip }: Props) {
  const [value, setValue] = useState("");
  if (items.length === 0) return null;

  const item = items[0];
  const descriptor = descriptors.find((d) => d.id === item.fieldId);
  const options = descriptor?.options ?? [];

  const submit = () => {
    if (!value.trim()) return;
    onAnswer(item, value);
    setValue("");
  };

  return (
    <div style={panelStyle}>
      <div style={metaStyle}>
        Missing info{items.length > 1 ? ` (${items.length} remaining)` : ""}
      </div>
      <div style={questionStyle}>{item.question}</div>
      {options.length > 0 ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
          <option value="">Select an answer...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your answer"
          style={inputStyle}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={submit} style={primaryButtonStyle}>
          Save &amp; fill
        </button>
        <button onClick={() => onSkip(item)} style={secondaryButtonStyle}>
          Skip
        </button>
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  width: 288,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
  marginBottom: 8,
};

const metaStyle: CSSProperties = { fontSize: 11, opacity: 0.6, marginBottom: 4 };
const questionStyle: CSSProperties = { fontWeight: 600, marginBottom: 8, lineHeight: 1.4 };

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  background: "#4f46e5",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#6b7280",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};
