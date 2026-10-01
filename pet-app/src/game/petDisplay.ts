/**
 * Temporary art-release gate for the pet module.
 *
 * Evolution progress is still stored and calculated by the server.  This helper is deliberately
 * kept in the client display layer so a future art release can change one value without changing
 * XP, evolution thresholds, rewards, or ownership rules.
 */
export const DISPLAY_PET_STAGE = 1 as const;

export const displayPetStage = (_stage: number | null | undefined): typeof DISPLAY_PET_STAGE => (
  DISPLAY_PET_STAGE
);

export const petForDisplay = <T extends { stage: number }>(pet: T): T => ({
  ...pet,
  stage: DISPLAY_PET_STAGE,
} as T);
