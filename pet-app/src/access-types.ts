export interface PetAccessStatus {
  academicYear: string; className: string; locked: boolean; note: string;
  endsAt: string | null; nextChangeAt: string | null; serverNow: number;
}
export interface PetAccessRule {
  id: string; academicYear: string; classes: string[]; startsAt: string;
  endsAt: string | null; note: string; kind: 'lock' | 'lesson' | 'schedule'; periods?: number[];
}
export interface PetAccessSettings {
  academicYear: string; serverNow: number;
  classes: (PetAccessStatus & { name: string; count: number })[];
  rules: PetAccessRule[];
}
export type PetAccessUpdate = { action: 'lock' | 'lesson' | 'schedule' | 'unlock'; classes: string[]; periods?: number[]; startsAt?: string; endsAt?: string | null; note?: string };
