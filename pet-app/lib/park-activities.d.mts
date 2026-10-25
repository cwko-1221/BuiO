export interface Challenge { mode: string; objectId: string; minimumMs: number; target?: number; answer?: string; targets?: number[]; notes?: number[]; tiles?: number[]; hint?: string;cells?:number[];size?:number }
export const PIPE_SOLUTION: number[];
export function rotatePipe(mask: number, turns?: number): number;
export function pipeFlow(tiles: number[]): number[];
export function createChallenge(mode: string, objectId: string, seed?: number): Challenge;
export function verifyChallenge(challenge: Challenge, answer: unknown): boolean;
export function publicChallenge(challenge: Challenge): Challenge;
