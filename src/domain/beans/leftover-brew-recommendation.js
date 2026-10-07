export const LEFTOVER_BREW_RECOMMENDATION_MAX_G = 20;
export const SMALL_INVENTORY_ALLOCATION_MAX_G = 30;
export const MIN_SUPPORTED_BREW_DOSE_G = 5;
export const DEFAULT_BREW_DOSE_G = 15;
function floorToTenth(value) { return Math.floor(value * 10 + 1e-7) / 10; }
export function leftoverBrewDose(remainingWeightG) {
  const grams = Number(remainingWeightG);
  if (!Number.isFinite(grams) || grams < MIN_SUPPORTED_BREW_DOSE_G || grams >= LEFTOVER_BREW_RECOMMENDATION_MAX_G) return null;
  return floorToTenth(grams);
}
/** 5–<20g is one full-remaining brew. 20–<30g is split into two brews. Even integer totals balance; odd/decimal totals keep the usual 15g first dose and assign the remainder to brew two. */
export function planRemainingBeanDoses(remainingWeightG) {
  const grams = Number(remainingWeightG);
  if (!Number.isFinite(grams) || grams <= 0 || grams >= SMALL_INVENTORY_ALLOCATION_MAX_G) return null;
  const remainingG = floorToTenth(grams);
  if (remainingG < MIN_SUPPORTED_BREW_DOSE_G) return { kind:'below-minimum', remainingG, doses:[] };
  if (remainingG < LEFTOVER_BREW_RECOMMENDATION_MAX_G) return { kind:'single', remainingG, doses:[remainingG] };
  if (Number.isInteger(remainingG) && remainingG % 2 === 0) {
    const half = remainingG / 2;
    return { kind:'split', remainingG, doses:[half,half] };
  }
  const firstDose = Math.min(DEFAULT_BREW_DOSE_G, floorToTenth(remainingG - MIN_SUPPORTED_BREW_DOSE_G));
  return { kind:'split', remainingG, doses:[firstDose,floorToTenth(remainingG-firstDose)] };
}
