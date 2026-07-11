import { useState } from "react";

interface Props {
  apiKey: string;
  onChange: (apiKey: string) => void;
}

export function ApiKeyEditor({ apiKey, onChange }: Props) {
  const [reveal, setReveal] = useState(false);

  return (
    <div className="section">
      <h2>Anthropic API key</h2>

      <div className="disclosure">
        Before you paste a key here, please understand:
        <ul>
          <li>Your key is stored locally in your browser's extension storage, in plain text.</li>
          <li>You are billed directly by Anthropic for your own API usage -- there is no proxy or free tier.</li>
          <li>
            Every time you click &ldquo;Fill this form&rdquo;, the form's field labels and your
            saved profile data are sent to Anthropic's API to compute the mapping.
          </li>
        </ul>
      </div>

      <div className="row">
        <div className="field full">
          <label>API key</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={reveal ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onChange(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={() => setReveal((r) => !r)}>
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
