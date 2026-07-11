import type { Skill } from "../../shared/types";

interface Props {
  skills: Skill[];
  onChange: (skills: Skill[]) => void;
}

function newEntry(): Skill {
  return { id: crypto.randomUUID(), name: "", keywords: [] };
}

export function SkillsEditor({ skills, onChange }: Props) {
  const update = (id: string, patch: Partial<Skill>) =>
    onChange(skills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => onChange(skills.filter((s) => s.id !== id));
  const add = () => onChange([...skills, newEntry()]);

  return (
    <div className="section">
      <h2>Skills</h2>
      {skills.length === 0 && <p className="empty-hint">No entries yet.</p>}
      {skills.map((entry, index) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-card-header">
            <span>Entry {index + 1}</span>
            <button className="btn-danger" onClick={() => remove(entry.id)}>
              Remove
            </button>
          </div>
          <div className="row">
            <div className="field">
              <label>Skill / category</label>
              <input
                value={entry.name}
                onChange={(e) => update(entry.id, { name: e.target.value })}
                placeholder="e.g. Frontend"
              />
            </div>
            <div className="field">
              <label>Level</label>
              <input
                value={entry.level ?? ""}
                onChange={(e) => update(entry.id, { level: e.target.value })}
                placeholder="e.g. Advanced"
              />
            </div>
            <div className="field full">
              <label>Keywords (comma separated)</label>
              <input
                value={entry.keywords.join(", ")}
                onChange={(e) =>
                  update(entry.id, {
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter((k) => k.length > 0),
                  })
                }
                placeholder="React, TypeScript, CSS"
              />
            </div>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={add}>
        + Add skill
      </button>
    </div>
  );
}
