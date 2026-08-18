import type { ContentBox, PetAnchors } from '../types';

/**
 * Where a worn piece sits on a creature, in fractions of its atlas cell.
 *
 * Shared because the same placement has to hold in two places that draw with entirely different
 * machinery: the room, where the creature is a Phaser sprite, and the equipment board, where it
 * is a stack of images in the page. If they computed it separately the board would stop being a
 * preview the moment either drifted.
 */

export type SlotLayout = {
  /** The landmark the piece hangs from. */
  line: 'skull' | 'eye' | 'chin' | 'body' | 'feet';
  /** Which point of the piece's own artwork lands on that line: 0 its top, 1 its bottom. */
  anchor: number;
  /** The landmark the piece is sized against. */
  against: 'head' | 'face' | 'width';
  /** Multiple of that landmark's width. */
  width: number;
  /** Ceiling on height, in heads, so a lanky piece stays in proportion. */
  tallest: number;
  /** How strongly a wide-drawn piece is allowed to spread past the body. 0 or absent: not at all. */
  spread?: number;
  behind?: boolean;
};

export const SLOT_LAYOUT: Record<string, SlotLayout> = {
  head: { line: 'skull', anchor: 0.86, against: 'head', width: 1.06, tallest: 1.5 },
  face: { line: 'eye', anchor: 0.50, against: 'face', width: 1.32, tallest: 0.9 },
  neck: { line: 'chin', anchor: 0.42, against: 'head', width: 0.70, tallest: 0.9 },
  back: { line: 'body', anchor: 0.50, against: 'width', width: 0.86, tallest: 1.15, spread: 2.4, behind: true },
  aura: { line: 'feet', anchor: 0.60, against: 'width', width: 1.25, tallest: 0.9, behind: true },
};

/** Whole-cell fallback for art with no measured landmarks. */
export const UNMEASURED: PetAnchors = {
  top: 0.14, eye: 0.34, bottom: 1, centre: 0.5, width: 0.86, head: 0.6, face: 0.42,
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export type Placement = {
  /** Anchor point on the creature, in cell fractions. */
  x: number; y: number;
  /** Displayed size of the piece as a fraction of the cell. Its artwork is square. */
  size: number;
  /** The point of the artwork that lands on the anchor, in fractions of the artwork. */
  originX: number; originY: number;
  behind: boolean;
};

/**
 * Place one piece. `anchors` may already carry a frame's movement; `stretch` is how much the
 * body has squashed, which only the pieces measured against the body follow — a cape stretches
 * with the torso, a crown does not widen because the creature inhaled.
 *
 * Cells are square, so a fraction of the width and a fraction of the height are the same length
 * and the sizing can be done in one axis.
 */
export function placeWearable(anchors: PetAnchors, slotKey: string, box: ContentBox, stretch = 1): Placement | null {
  const slot = SLOT_LAYOUT[slotKey];
  if (!slot) return null;

  // The head is the unit of measure for anything worn on it: a chin sits about two thirds of a
  // head below the eyes whatever the creature's overall proportions are.
  const head = Math.max(0.01, anchors.eye - anchors.top);
  const y = slot.line === 'skull' ? anchors.top
    : slot.line === 'eye' ? anchors.eye
      : slot.line === 'chin' ? anchors.eye + 0.62 * head
        : slot.line === 'feet' ? anchors.bottom
          : anchors.eye + 0.3 * (anchors.bottom - anchors.eye);

  const give = slot.against === 'width' ? stretch : 1;
  // A back piece is sized by the shape it was drawn as. Wings are painted half again as wide as
  // they are tall and are meant to be seen past the body; a backpack is drawn square and belongs
  // against it. Fitting both to the same fraction of the silhouette hid every pair of wings
  // behind the creature wearing them.
  const spread = slot.spread ? clamp(1 + (box.width / Math.max(0.001, box.height) - 1) * slot.spread, 1, 3) : 1;
  const target = anchors[slot.against] * slot.width * give * spread;
  // Width alone is not enough. A monocle trails a long chain and a wizard hat is mostly point,
  // so fitting either to the head's width makes it taller than the whole creature; the cap keeps
  // a lanky piece in proportion by falling back to a height fit.
  //
  // What counts as too tall depends on what the piece belongs to. A hat is measured in heads,
  // but wings belong to the body, and a small-headed creature has a head so much shorter than
  // its body that a cap in heads clamped its wings back down to stubs.
  const ceiling = slot.tallest * (slot.against === 'width' ? anchors.bottom - anchors.top : head);

  return {
    x: anchors.centre,
    y,
    size: Math.min(target / Math.max(0.001, box.width), ceiling / Math.max(0.001, box.height)),
    originX: box.x + box.width / 2,
    originY: box.y + slot.anchor * box.height,
    behind: !!slot.behind,
  };
}
