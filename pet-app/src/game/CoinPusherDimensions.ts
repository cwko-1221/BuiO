/** Shared physical/render dimensions for the moving deck and its receiving housing. */
export const PUSHER_WIDTH = 5.04;
// A 1.7-unit slab travels across the extended playfield. At rest its rear half is inside the
// casing; the stroke exposes the slab and brings its lip just past the table midpoint.
export const PUSHER_HALF_DEPTH = .85;
export const PUSHER_LENGTH = PUSHER_HALF_DEPTH * 2;
// Keep the slot just behind the playfield so the pusher emerges onto the table without a long
// empty bridge. The retracted plate's tail reaches -3.03; the case leaves 0.28 behind it.
export const REAR_CASE_FRONT_Z = -2.23;
export const REAR_CASE_BACK_Z = -3.36;
export const REAR_CASE_DEPTH = REAR_CASE_FRONT_Z - REAR_CASE_BACK_Z;
export const REAR_CASE_CENTER_Z = (REAR_CASE_FRONT_Z + REAR_CASE_BACK_Z) / 2;
export const REAR_CASE_TOP_Y = 1.88;
export const REAR_CASE_BOTTOM_Y = -.6;

export const PUSHER_SLOT_HALF_WIDTH = 2.72;
export const PUSHER_SLOT_BOTTOM_Y = -.015;
// The 0.035-unit clearance above the slab is smaller than a flat coin's 0.064-unit thickness.
// The plate can slide into the housing; the fascia strips coins off instead of carrying them in.
export const PUSHER_SLOT_TOP_Y = .075;

// Give the pile a longer runway and leave a visible, unsupported drop slot before the catcher.
export const MAIN_DECK_BACK_Z = -2.19;
export const MAIN_DECK_FRONT_Z = 3.65;
export const PAYOUT_TRAY_FLOOR_HALF_DEPTH = .82;
export const PAYOUT_TRAY_CATCHER_MARGIN = .12;
// Extend the recessed floor beneath the drop opening so coins straddling the entry lip cannot
// fall through an unsupported seam. The visible deck-to-tray gap remains unchanged.
export const PAYOUT_TRAY_ENTRY_CATCH_OVERLAP = .36;
// Leave a full coin-radius-plus gap between the deck edge and the lowered tray floor so the
// player sees the coin clear the table and fall before it lands in the payout well.
export const PAYOUT_TRAY_DROP_GAP = .36;
export const PAYOUT_TRAY_CENTER_Z = MAIN_DECK_FRONT_Z
  + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN + PAYOUT_TRAY_DROP_GAP;
export const PAYOUT_TRAY_FLOOR_CENTER_Y = -.66;
export const PAYOUT_TRAY_FLOOR_HALF_HEIGHT = .08;
export const PAYOUT_TRAY_FLOOR_TOP_Y = PAYOUT_TRAY_FLOOR_CENTER_Y + PAYOUT_TRAY_FLOOR_HALF_HEIGHT;
export const PAYOUT_TRAY_WALL_TOP_Y = .11;
export const PAYOUT_TRAY_WALL_HALF_DEPTH = .055;
export const PAYOUT_TRAY_FRONT_WALL_CENTER_Z = PAYOUT_TRAY_CENTER_Z
  + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN - PAYOUT_TRAY_WALL_HALF_DEPTH;
// Retracted: the fascia bisects the slab, concealing its rear half inside the thick housing.
export const PUSHER_HOME_Z = REAR_CASE_FRONT_Z;
// Extended: the rear edge meets the fascia; the leading lip finishes just beyond the midpoint.
export const PUSHER_LIP_LOCAL_Z = PUSHER_HALF_DEPTH - .04;
export const PUSHER_FRONT_LEAD = .08;
export const PUSHER_FORWARD_Z = (MAIN_DECK_BACK_Z + MAIN_DECK_FRONT_Z) / 2
  + PUSHER_FRONT_LEAD - PUSHER_LIP_LOCAL_Z;
export const REAR_DECK_CENTER_Z = (REAR_CASE_BACK_Z + MAIN_DECK_BACK_Z) / 2;
export const REAR_DECK_HALF_DEPTH = (MAIN_DECK_BACK_Z - REAR_CASE_BACK_Z) / 2;
