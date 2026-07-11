import type { Education } from "../../shared/types";

interface Props {
  education: Education[];
  onChange: (education: Education[]) => void;
}

function newEntry(): Education {
  return {
    id: crypto.randomUUID(),
    institution: "",
    area: "",
    studyType: "",
    startDate: "",
    endDate: "",
  };
}

export function EducationEditor({ education, onChange }: Props) {
  const update = (id: string, patch: Partial<Education>) =>
    onChange(education.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(education.filter((e) => e.id !== id));
  const add = () => onChange([...education, newEntry()]);

  return (
    <div className="section">
      <h2>Education</h2>
      {education.length === 0 && <p className="empty-hint">No entries yet.</p>}
      {education.map((entry, index) => (
        <div className="entry-card" key={entry.id}>
          <div className="entry-card-header">
            <span>Entry {index + 1}</span>
            <button className="btn-danger" onClick={() => remove(entry.id)}>
              Remove
            </button>
          </div>
          <div className="row">
            <div className="field">
              <label>Institution</label>
              <input
                value={entry.institution}
                onChange={(e) => update(entry.id, { institution: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Field of study</label>
              <input
                value={entry.area}
                onChange={(e) => update(entry.id, { area: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Degree type</label>
              <input
                value={entry.studyType}
                onChange={(e) => update(entry.id, { studyType: e.target.value })}
                placeholder="e.g. Bachelor's"
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
              <label>End date</label>
              <input
                type="date"
                value={entry.endDate}
                onChange={(e) => update(entry.id, { endDate: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={add}>
        + Add education
      </button>
    </div>
  );
}
