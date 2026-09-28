/** Shared physical/render dimensions for the moving deck and its receiving housing. */
export const PUSHER_WIDTH = 5.04;
// A 1.7-unit slab starts half recessed in the backboard. The stroke moves only far enough to
// expose the whole slab; it never reaches out across the table.
export const PUSHER_HALF_DEPTH = .85;
export const PUSHER_LENGTH = PUSHER_HALF_DEPTH * 2;
// Keep the slot just behind the shortened playfield. At rest the retracted plate tail reaches
// -3.08; the case leaves 0.28 behind it.
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

// A compact 2.89-unit working table shortens the empty runway between the coin bed and collection well.
export const MAIN_DECK_BACK_Z = -2.19;
export const MAIN_DECK_FRONT_Z = .7;
// The top surface ends before the rounded front bevel. A full-depth flat collider left an
// invisible shelf that could hold a coin whose centre was already beyond the visible edge.
export const MAIN_DECK_SUPPORT_FRONT_Z = MAIN_DECK_FRONT_Z - .05;
export const PAYOUT_TRAY_FLOOR_HALF_DEPTH = .38;
export const PAYOUT_TRAY_CATCHER_MARGIN = .10;
// Extend the recessed floor beneath the drop opening so coins straddling the entry lip cannot
// fall through an unsupported seam. The visible deck-to-tray gap remains unchanged.
export const PAYOUT_TRAY_ENTRY_CATCH_OVERLAP = .36;
// Leave a full coin-radius-plus gap between the deck edge and the lowered tray floor so the
// player sees the coin clear the table and fall before it lands in the payout well.
export const PAYOUT_TRAY_DROP_GAP = .28;
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
// The rear edge clears the fascia slightly, leaving the whole slab visible without overreaching.
export const PUSHER_LIP_LOCAL_Z = PUSHER_HALF_DEPTH - .04;
export const PUSHER_FORWARD_CLEARANCE = .025;
export const PUSHER_FORWARD_Z = REAR_CASE_FRONT_Z + PUSHER_HALF_DEPTH + PUSHER_FORWARD_CLEARANCE;
export const REAR_DECK_CENTER_Z = (REAR_CASE_BACK_Z + MAIN_DECK_BACK_Z) / 2;
export const REAR_DECK_HALF_DEPTH = (MAIN_DECK_BACK_Z - REAR_CASE_BACK_Z) / 2;
