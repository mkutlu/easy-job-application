import type { WorkExperience } from "../../shared/types";

interface Props {
  work: WorkExperience[];
  onChange: (work: WorkExperience[]) => void;
}

function newEntry(): WorkExperience {
  return {
    id: crypto.randomUUID(),
    name: "",
    position: "",
    location: "",
    startDate: "",
    endDate: "",
    highlights: [],
  };
}

export function WorkExperienceEditor({ work, onChange }: Props) {
  const update = (id: string, patch: Partial<WorkExperience>) =>
    onChange(work.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const remove = (id: string) => onChange(work.filter((w) => w.id !== id));
  const add = () => onChange([...work, newEntry()]);

  return (
    <div className="section">
      <h2>Work experience</h2>
      {work.length === 0 && <p className="empty-hint">No entries yet.</p>}
      {work.map((entry, index) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-card-header">
            <span>Entry {index + 1}</span>
            <button className="btn-danger" onClick={() => remove(entry.id)}>
              Remove
            </button>
          </div>
          <div className="row">
            <div className="field">
              <label>Company</label>
              <input
                value={entry.name}
                onChange={(e) => update(entry.id, { name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Position / title</label>
              <input
                value={entry.position}
                onChange={(e) => update(entry.id, { position: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Location</label>
              <input
                value={entry.location ?? ""}
                onChange={(e) => update(entry.id, { location: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={entry.startDate}
                onChange={(e) => update(entry.id, { startDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>End date (blank = present)</label>
              <input
                type="date"
                value={entry.endDate}
                onChange={(e) => update(entry.id, { endDate: e.target.value })}
              />
            </div>
            <div className="field full">
              <label>Summary</label>
              <textarea
                value={entry.summary ?? ""}
                onChange={(e) => update(entry.id, { summary: e.target.value })}
              />
            </div>
            <div className="field full">
              <label>Highlights (one per line)</label>
              <textarea
                value={entry.highlights.join("\n")}
                onChange={(e) =>
                  update(entry.id, {
                    highlights: e.target.value.split("\n").filter((l) => l.trim().length > 0),
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={add}>
        + Add work experience
      </button>
    </div>
  );
}
