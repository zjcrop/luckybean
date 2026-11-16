const userAgent = typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '');

const edition = typeof document === 'undefined' ? '' : String(document.querySelector('meta[name="luckybean-distribution"]')?.content || '');

export const IS_LUCKYBEAN_DS = edition === 'ds' || /LuckyBeanDS\//i.test(userAgent);
export const DISTRIBUTION_NAME = IS_LUCKYBEAN_DS ? 'LuckyBean DS' : 'LuckyBean Cloud';
