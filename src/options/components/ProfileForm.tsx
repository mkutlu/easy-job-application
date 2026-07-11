import type { ProfileBasics } from "../../shared/types";

interface Props {
  basics: ProfileBasics;
  onChange: (basics: ProfileBasics) => void;
}

export function ProfileForm({ basics, onChange }: Props) {
  const set = <K extends keyof ProfileBasics>(key: K, value: ProfileBasics[K]) =>
    onChange({ ...basics, [key]: value });

  const setLocation = <K extends keyof ProfileBasics["location"]>(
    key: K,
    value: string,
  ) => onChange({ ...basics, location: { ...basics.location, [key]: value } });

  return (
    <div className="section">
      <h2>Basics</h2>
      <div className="row">
        <div className="field">
          <label>Full name</label>
          <input value={basics.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={basics.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={basics.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="field">
          <label>Website / portfolio URL</label>
          <input value={basics.url ?? ""} onChange={(e) => set("url", e.target.value)} />
        </div>
        <div className="field full">
          <label>Summary</label>
          <textarea
            value={basics.summary ?? ""}
            onChange={(e) => set("summary", e.target.value)}
          />
        </div>
      </div>

      <h3>Location</h3>
      <div className="row">
        <div className="field">
          <label>Address</label>
          <input
            value={basics.location.address ?? ""}
            onChange={(e) => setLocation("address", e.target.value)}
          />
        </div>
        <div className="field">
          <label>City</label>
          <input
            value={basics.location.city ?? ""}
            onChange={(e) => setLocation("city", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Region / state</label>
          <input
            value={basics.location.region ?? ""}
            onChange={(e) => setLocation("region", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Postal code</label>
          <input
            value={basics.location.postalCode ?? ""}
            onChange={(e) => setLocation("postalCode", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Country code</label>
          <input
            value={basics.location.countryCode ?? ""}
            onChange={(e) => setLocation("countryCode", e.target.value)}
            placeholder="e.g. US"
          />
        </div>
      </div>
    </div>
  );
}
