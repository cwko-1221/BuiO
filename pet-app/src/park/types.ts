import type { PetFacing, PetInstance } from '../types';
import type { GardenState } from '../../lib/park-garden.mjs';
export interface ParkProgress {
  day: string; earned: number; bonusClaimed: boolean; position: { x: number; y: number } | null;
  quests: Record<string, { acceptedAt: number; steps: string[]; completedAt: number | null; earned: number }>;
  discoveries: string[];
  games: Record<string, { best: number; plays: number; rewardedAt: number | null; earned: number;collection?:number[] }>;
}
export interface ParkPeer { id: string; name: string; className: string; pet: PetInstance }
export interface ParkFrame { id: string; x: number; y: number; facing: PetFacing; moving: boolean; active: boolean; emote: string | null; interacting: boolean; seated?: string | null; activity?: 'banana' | 'flight' | 'duet' | import('../../lib/park-leisure.mjs').LeisureKind | null }
export interface ParkResult { bag?:import('../../lib/park-market.mjs').ParkBag; state: ParkProgress; dailyCap: number; balance?: number; earned?: number; bonus?: number; advanced?: string[]; claimed?: string[] }
export interface ParkJoin extends ParkResult { self: ParkPeer & ParkFrame; peers: ParkPeer[]; garden?: GardenState }
