export interface WalkPoint { x: number; y: number }
export interface WalkRect extends WalkPoint { width: number; height: number }
export type WalkShape = ({ id?: string } & (
  { kind: 'polygon'; points: WalkPoint[] }
  | ({ kind: 'rect' } & WalkRect)
  | ({ kind: 'circle'; radius: number } & WalkPoint)
  | ({ kind: 'ellipse'; rx: number; ry: number } & WalkPoint)
));
export interface WalkBridge { id: string; deck: WalkPoint[] }
export interface WalkmeshSpecification {
  bounds: WalkRect;
  actorRadius?: number;
  solids?: WalkShape[];
  water?: WalkShape[];
  bridges?: WalkBridge[];
}
export interface WalkLocation { walkable: boolean; reason: 'invalid' | 'bounds' | 'solid' | 'water' | 'land' | 'bridge'; id?: string }
export interface Walkmesh {
  readonly actorRadius: number;
  contains(point: WalkPoint, radius?: number): boolean;
  classify(point: WalkPoint, radius?: number): WalkLocation;
  clearSegment(from: WalkPoint, to: WalkPoint, radius?: number): boolean;
  move(from: WalkPoint, delta: WalkPoint, radius?: number): WalkPoint | null;
}
export function createWalkmesh(specification: WalkmeshSpecification): Walkmesh;
export function rectPolygon(rect: WalkRect): WalkPoint[];
/** Circumscribed, conservative solid boundary. Not an inset walkable area. */
export function ellipsePolygon(ellipse: WalkPoint & { rx: number; ry: number }, segments?: number): WalkPoint[];
export function pointInPolygon(point: WalkPoint, polygon: WalkPoint[]): boolean;
export function pointSegmentDistanceSquared(point: WalkPoint, a: WalkPoint, b: WalkPoint): number;
