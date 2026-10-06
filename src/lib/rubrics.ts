export const RUBRIC_LEVELS = [
  { key: "advanced", label: "Advanced" },
  { key: "proficient", label: "Proficient" },
  { key: "developing", label: "Developing" },
] as const;

export type RubricLevelKey = (typeof RUBRIC_LEVELS)[number]["key"];

export function rubricLevelLabel(key: string): string {
  return RUBRIC_LEVELS.find((l) => l.key === key)?.label ?? key;
}

export interface LearningTarget {
  id: string;
  key: string;
  title: string;
  description: string;
  stage: string | null;
  sort_order: number;
}

export interface RubricCriterion {
  id: string;
  target_id: string;
  level: string;
  criterion: string;
  sort_order: number;
}

export interface RubricScore {
  id: string;
  target_id: string;
  teacher_id: string;
  student_id: string | null;
  team_id: string | null;
  entry_id: string | null;
  level: string;
  note: string;
  updated_at: string;
}
