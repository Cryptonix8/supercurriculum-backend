/**
 * School levels and age bands (source: client).
 * Use this as the single source of truth so the AI tutor and app can answer
 * age/grade questions without manual lookup.
 *
 * - Primary school: ages 6–12 (grades 1–6)
 * - Junior high school: ages 13–15 (grades 7–9)
 * - Senior high school: ages 16–18 (grades 10–12)
 */

export const EDUCATION_LEVEL_AGE_BANDS = {
  PRIMARY: { minAge: 6, maxAge: 12, grades: [1, 2, 3, 4, 5, 6], labelEn: 'Primary school', labelEl: 'Δημοτικό' },
  JUNIOR_HIGH: { minAge: 13, maxAge: 15, grades: [7, 8, 9], labelEn: 'Junior high school', labelEl: 'Γυμνάσιο' },
  SENIOR_HIGH: { minAge: 16, maxAge: 18, grades: [10, 11, 12], labelEn: 'Senior high school', labelEl: 'Λύκειο' },
} as const;

/** Greek year group codes by education level */
export const GREEK_YEAR_BY_LEVEL = {
  PRIMARY: ['dimotiko_1', 'dimotiko_2', 'dimotiko_3', 'dimotiko_4', 'dimotiko_5', 'dimotiko_6'],
  JUNIOR_HIGH: ['gymnasio_1', 'gymnasio_2', 'gymnasio_3'],
  SENIOR_HIGH: ['lykeio_1', 'lykeio_2', 'lykeio_3'],
} as const;

/**
 * Returns the education level for a given age (6–18).
 */
export function getEducationLevelByAge(age: number): keyof typeof EDUCATION_LEVEL_AGE_BANDS | null {
  if (age >= 6 && age <= 12) return 'PRIMARY';
  if (age >= 13 && age <= 15) return 'JUNIOR_HIGH';
  if (age >= 16 && age <= 18) return 'SENIOR_HIGH';
  return null;
}

/**
 * Returns the education level for a Greek year group code.
 */
export function getEducationLevelByGreekCode(code: string): keyof typeof EDUCATION_LEVEL_AGE_BANDS | null {
  const c = code.toLowerCase().replace(/\s+/g, '_');
  const primary = GREEK_YEAR_BY_LEVEL.PRIMARY as readonly string[];
  const junior = GREEK_YEAR_BY_LEVEL.JUNIOR_HIGH as readonly string[];
  const senior = GREEK_YEAR_BY_LEVEL.SENIOR_HIGH as readonly string[];
  if (primary.includes(c)) return 'PRIMARY';
  if (junior.includes(c)) return 'JUNIOR_HIGH';
  if (senior.includes(c)) return 'SENIOR_HIGH';
  return null;
}

/** Text for AI system prompt: age bands and school levels so the tutor can answer without lookup */
export const EDUCATION_LEVELS_FOR_AI = `
SCHOOL LEVELS (use this to answer age/grade questions without guessing):
- Primary school: ages 6–12 (grades 1–6). Greek: Δημοτικό (dimotiko_1–dimotiko_6).
- Junior high school: ages 13–15 (grades 7–9). Greek: Γυμνάσιο (gymnasio_1–gymnasio_3).
- Senior high school: ages 16–18 (grades 10–12). Greek: Λύκειο (lykeio_1–lykeio_3).
`.trim();
