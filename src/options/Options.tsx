import { useEffect, useState } from "react";
import { getApiKey, saveApiKey } from "../shared/apiKeyStore";
import { getProfile, saveProfile } from "../shared/profileStore";
import { EMPTY_PROFILE, type Profile } from "../shared/types";
import { ApiKeyEditor } from "./components/ApiKeyEditor";
import { ApplicationExtrasEditor } from "./components/ApplicationExtrasEditor";
import { EducationEditor } from "./components/EducationEditor";
import { LanguagesEditor } from "./components/LanguagesEditor";
import { ProfileForm } from "./components/ProfileForm";
import { SkillsEditor } from "./components/SkillsEditor";
import { WorkExperienceEditor } from "./components/WorkExperienceEditor";

type Tab = "profile" | "apiKey";

export function Options() {
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    (async () => {
      const [storedProfile, storedKey] = await Promise.all([getProfile(), getApiKey()]);
      setProfile(storedProfile);
      setApiKey(storedKey);
      setLoaded(true);
    })();
  }, []);

  const updateProfile = (patch: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const updateApiKey = (value: string) => {
    setApiKey(value);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaveState("saving");
    await Promise.all([saveProfile(profile), saveApiKey(apiKey)]);
    setDirty(false);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 2000);
  };

  if (!loaded) return null;

  return (
    <div className="app">
      <h1>Easy Job Application</h1>
      <p className="subtitle">
        Your profile is the extension's only memory -- the AI is stateless, so anything it
        should stop asking about needs to live here.
      </p>

      <div className="tabs">
        <button className={`tab ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
          Profile
        </button>
        <button className={`tab ${tab === "apiKey" ? "active" : ""}`} onClick={() => setTab("apiKey")}>
          API Key
        </button>
      </div>

      {tab === "profile" && (
        <>
          <ProfileForm basics={profile.basics} onChange={(basics) => updateProfile({ basics })} />
          <WorkExperienceEditor work={profile.work} onChange={(work) => updateProfile({ work })} />
          <EducationEditor
            education={profile.education}
            onChange={(education) => updateProfile({ education })}
          />
          <LanguagesEditor
            languages={profile.languages}
            onChange={(languages) => updateProfile({ languages })}
          />
          <SkillsEditor skills={profile.skills} onChange={(skills) => updateProfile({ skills })} />
          <ApplicationExtrasEditor
            extras={profile.extras}
            onChange={(extras) => updateProfile({ extras })}
            extraQA={profile.extraQA}
            onChangeExtraQA={(extraQA) => updateProfile({ extraQA })}
          />
        </>
      )}

      {tab === "apiKey" && <ApiKeyEditor apiKey={apiKey} onChange={updateApiKey} />}

      <div className="save-bar">
        <button className="btn" onClick={handleSave} disabled={!dirty || saveState === "saving"}>
          {saveState === "saving" ? "Saving..." : "Save changes"}
        </button>
        {saveState === "saved" && <span className="save-status">Saved</span>}
      </div>
    </div>
  );
}
