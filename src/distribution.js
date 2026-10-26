const userAgent = typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '');

export const IS_LUCKYBEAN_DS = /LuckyBeanDS\//i.test(userAgent);
export const DISTRIBUTION_NAME = IS_LUCKYBEAN_DS ? 'LuckyBean DS' : 'LuckyBean Cloud';
