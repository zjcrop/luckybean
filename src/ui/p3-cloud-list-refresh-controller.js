// P3 manifest-first sync bridge: expose the priority bean-list restore through the
// established app refresh event without marking local data dirty or scheduling upload.
document.addEventListener('luckybean:cloud-list-restored', event => {
  document.dispatchEvent(new CustomEvent('luckybean:app-refreshed', {
    detail: {
      ...(event.detail || {}),
      source: 'cloud-list-restored',
      phase: 'list'
    }
  }));
});

console.info('[LuckyBean] manifest-first list refresh bridge active');
