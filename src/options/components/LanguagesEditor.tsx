import type { Language } from "../../shared/types";

interface Props {
  languages: Language[];
  onChange: (languages: Language[]) => void;
}

function newEntry(): Language {
  return { id: crypto.randomUUID(), language: "", fluency: "" };
}

export function LanguagesEditor({ languages, onChange }: Props) {
  const update = (id: string, patch: Partial<Language>) =>
    onChange(languages.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(languages.filter((l) => l.id !== id));
  const add = () => onChange([...languages, newEntry()]);

  return (
    <div className="section">
      <h2>Languages</h2>
      {languages.length === 0 && <p className="empty-hint">No entries yet.</p>}
      {languages.map((entry, index) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-card-header">
            <span>Entry {index + 1}</span>
            <button className="btn-danger" onClick={() => remove(entry.id)}>
              Remove
            </button>
          </div>
          <div className="row">
            <div className="field">
              <label>Language</label>
              <input
                value={entry.language}
                onChange={(e) => update(entry.id, { language: e.target.value })}
                placeholder="e.g. Spanish"
              />
            </div>
            <div className="field">
              <label>Fluency</label>
              <input
                value={entry.fluency ?? ""}
                onChange={(e) => update(entry.id, { fluency: e.target.value })}
                placeholder="e.g. Fluent, Native, Conversational"
              />
            </div>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={add}>
        + Add language
      </button>
    </div>
  );
}
