const userAgent = typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '');
const edition = typeof document === 'undefined' ? '' : String(document.querySelector('meta[name="luckybean-distribution"]')?.content || '');

export const IS_LUCKYBEAN_DSB = edition === 'ds-b';
export const IS_LUCKYBEAN_DS = IS_LUCKYBEAN_DSB || edition === 'ds' || /LuckyBeanDS\//i.test(userAgent);
export const DISTRIBUTION_NAME = IS_LUCKYBEAN_DSB ? 'LuckyBean DS-B' : IS_LUCKYBEAN_DS ? 'LuckyBean DS' : 'LuckyBean Cloud';
