export {PARK_ECONOMY} from './park-economy.mjs';
import type { Localized, PetFacing } from '../src/types';
import type { Walkmesh, WalkShape, WalkmeshSpecification } from './park-walkmesh.mjs';
export interface Point { x: number; y: number }
export interface ParkObject extends Point { id: string; kind: string; name: Localized; at?: Point; solid?: number; footprint?: { rx: number; ry: number; dy?: number }; species?: string; role?: Localized; line?: Localized; game?: 'banana' | 'flight'; games?: import('./park-leisure.mjs').LeisureKind[] }
export interface ParkQuest { id: string; npc: string; name: Localized; description: Localized; reward: number; steps: string[]; ordered?: boolean; requirements?: Record<string, string> }
export interface Zone extends Point { id: string; name: Localized; width: number; height: number; color: string; center: Point }
export const WORLD: { width: number; height: number; cell: number; speed: number; spawn: Point };
export const PLAZA_ART: Point & { width: number; height: number; scale: number };
export const ART_REGIONS: (Point & { id: string; asset: string; width: number; height: number })[];
export const PLAZA_TREES: (Point & { kind: string; variant: number; scale: number; solid: number })[];
export function inPlazaArt(point: Point): boolean;
export const ZONES: Zone[];
export const OBJECTS: ParkObject[];
export const QUESTS: ParkQuest[];
export const ROADS: Point[][];
export const ROAD_WIDTH: number;
export const BRANCHES: Point[][];
export const HUBS: (Point & { id: string; name: Localized; next: Localized })[];
export const CLUES: Record<string, Localized>;
export function activityModes(object: ParkObject, state?: { quests: Record<string, unknown> }): string[];
export function roadDistance(point: Point, roads?: Point[][]): number;
export function navigationCost(point: Point): number;
export const EMOTES: string[];
export const INTERACTION_MS: number;
export const SCENERY: (Point & { kind: string; variant: number; scale: number; solid: number; footprint?: { rx: number; ry: number; dy?: number } })[];
export const WORLD_SOLIDS: WalkShape[];
export const WORLD_WATER: WalkShape[];
export const COLLISION_GEOMETRY: WalkmeshSpecification;
export const WALKMESH: Walkmesh;
export function dailyQuests(day: string): ParkQuest[];
export function zoneAt(point: Point): Zone;
export function interactionPoint(object: ParkObject): Point;
export function spawnPoint(others?: Point[]): Point;
export function walkable(x: number, y: number): boolean;
export function clearLine(from: Point, to: Point): boolean;
export function safeVisualPosition(current: Point, authoritative: Point, blend?: number): Point;
export function findPath(from: Point, to: Point): Point[];
export function stepPlayer(player: Point & { path: Point[]; mask: number; facing: PetFacing }, seconds: number): void;
