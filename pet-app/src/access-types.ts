export interface PetAccessStatus {
  academicYear: string; className: string; locked: boolean; note: string;
  endsAt: string | null; nextChangeAt: string | null; serverNow: number;
}
export interface PetAccessRule {
  id: string; academicYear: string; classes: string[]; startsAt: string;
  endsAt: string | null; note: string; kind: 'lock' | 'schedule';
}
export interface PetAccessSettings {
  academicYear: string; serverNow: number;
  classes: (PetAccessStatus & { name: string; count: number })[];
  rules: PetAccessRule[];
}
export type PetAccessUpdate = { action: 'lock' | 'schedule' | 'unlock'; classes: string[]; startsAt?: string; endsAt?: string | null; note?: string };
