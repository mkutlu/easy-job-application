import { EMPTY_PROFILE, type Profile } from "./types";

// The AI model is stateless across calls -- this store is the only place
// "learning" actually accumulates. Every missingInfo answer and every edit
// made in the options page lands here, and the *enriched* profile is what
// gets sent on the next mapping call. Forms get easier to fill over time
// because this object grows, not because the model remembers anything.
const STORAGE_KEY = "profile";

export async function getProfile(): Promise<Profile> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const profile = stored[STORAGE_KEY] as Partial<Profile> | undefined;
  if (!profile) return structuredClone(EMPTY_PROFILE);
  // Shallow-merge against EMPTY_PROFILE so older stored profiles that predate
  // a newly added top-level section (e.g. extraQA) don't come back undefined.
  return {
    ...structuredClone(EMPTY_PROFILE),
    ...profile,
    basics: { ...EMPTY_PROFILE.basics, ...profile.basics },
    extras: { ...EMPTY_PROFILE.extras, ...profile.extras },
    extraQA: { ...profile.extraQA },
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
}

export async function saveExtraAnswer(
  suggestedKey: string,
  value: string,
): Promise<void> {
  const profile = await getProfile();
  profile.extraQA[suggestedKey] = value;
  await saveProfile(profile);
}
