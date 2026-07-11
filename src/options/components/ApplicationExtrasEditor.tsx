import type { ApplicationExtras } from "../../shared/types";

interface Props {
  extras: ApplicationExtras;
  onChange: (extras: ApplicationExtras) => void;
  extraQA: Record<string, string>;
  onChangeExtraQA: (extraQA: Record<string, string>) => void;
}

export function ApplicationExtrasEditor({ extras, onChange, extraQA, onChangeExtraQA }: Props) {
  const set = <K extends keyof ApplicationExtras>(key: K, value: ApplicationExtras[K]) =>
    onChange({ ...extras, [key]: value });
  const setEeo = <K extends keyof ApplicationExtras["eeo"]>(key: K, value: string) =>
    onChange({ ...extras, eeo: { ...extras.eeo, [key]: value } });

  const qaEntries = Object.entries(extraQA);
  const setQaValue = (key: string, value: string) =>
    onChangeExtraQA({ ...extraQA, [key]: value });
  const removeQaEntry = (key: string) => {
    const next = { ...extraQA };
    delete next[key];
    onChangeExtraQA(next);
  };

  return (
    <>
      <div className="section">
        <h2>Application-specific answers</h2>
        <div className="row">
          <div className="field">
            <label>Work authorization</label>
            <input
              value={extras.workAuthorization ?? ""}
              onChange={(e) => set("workAuthorization", e.target.value)}
              placeholder="e.g. Authorized to work in the US without sponsorship"
            />
          </div>
          <div className="field">
            <label>Requires sponsorship?</label>
            <input
              value={extras.requiresSponsorship ?? ""}
              onChange={(e) => set("requiresSponsorship", e.target.value)}
              placeholder="e.g. No"
            />
          </div>
          <div className="field">
            <label>Desired salary</label>
            <input
              value={extras.desiredSalary ?? ""}
              onChange={(e) => set("desiredSalary", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Notice period</label>
            <input
              value={extras.noticePeriod ?? ""}
              onChange={(e) => set("noticePeriod", e.target.value)}
              placeholder="e.g. 2 weeks"
            />
          </div>
          <div className="field full">
            <label>How did you hear about us? (default answer)</label>
            <input
              value={extras.howHeardAboutUs ?? ""}
              onChange={(e) => set("howHeardAboutUs", e.target.value)}
            />
          </div>
        </div>

        <h3>Voluntary disclosure / EEO</h3>
        <div className="row">
          <div className="field">
            <label>Gender</label>
            <input value={extras.eeo.gender ?? ""} onChange={(e) => setEeo("gender", e.target.value)} />
          </div>
          <div className="field">
            <label>Race / ethnicity</label>
            <input value={extras.eeo.race ?? ""} onChange={(e) => setEeo("race", e.target.value)} />
          </div>
          <div className="field">
            <label>Veteran status</label>
            <input
              value={extras.eeo.veteranStatus ?? ""}
              onChange={(e) => setEeo("veteranStatus", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Disability status</label>
            <input
              value={extras.eeo.disabilityStatus ?? ""}
              onChange={(e) => setEeo("disabilityStatus", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="section">
        <h2>Learned answers</h2>
        <p className="empty-hint" style={{ marginTop: -4, marginBottom: 12 }}>
          Answers you've given inline while filling forms land here automatically, so future
          forms stop asking about them. Edit or remove any that are wrong.
        </p>
        {qaEntries.length === 0 ? (
          <p className="empty-hint">Nothing learned yet.</p>
        ) : (
          <table className="qa-table">
            <thead>
              <tr>
                <th style={{ width: "35%" }}>Key</th>
                <th>Answer</th>
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {qaEntries.map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>
                    <input value={value} onChange={(e) => setQaValue(key, e.target.value)} />
                  </td>
                  <td>
                    <button className="btn-danger" onClick={() => removeQaEntry(key)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
