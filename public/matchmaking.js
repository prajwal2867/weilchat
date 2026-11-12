export const GENDERS = Object.freeze(["man", "woman"]);

export function preferenceForGender(gender) {
  if (gender === "man") return "woman";
  if (gender === "woman") return "man";
  return null;
}

export function isValidMatchSelection({ gender, preference } = {}) {
  return GENDERS.includes(gender) && preference === preferenceForGender(gender);
}
