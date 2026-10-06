export const LEFTOVER_BREW_RECOMMENDATION_MAX_G = 20;
export const MIN_SUPPORTED_BREW_DOSE_G = 5;

export function leftoverBrewDose(remainingWeightG) {
  const grams = Number(remainingWeightG);
  if (!Number.isFinite(grams) || grams < MIN_SUPPORTED_BREW_DOSE_G || grams >= LEFTOVER_BREW_RECOMMENDATION_MAX_G) return null;
  return Math.floor((grams + Number.EPSILON) * 10) / 10;
}
