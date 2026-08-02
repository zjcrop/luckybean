const wrap = document.querySelector('#fabWrap');
if (wrap) {
  wrap.dataset.v097GestureMode = 'drag-or-tap';
  wrap.setAttribute('title', '拖动中央圆点可移动快捷菜单；轻点文字执行功能');

  const protectButtonTap = button => {
    if (button.dataset.v097TapGuard === '1') return;
    button.dataset.v097TapGuard = '1';
    button.addEventListener('pointerdown', event => {
      // Keep ordinary command taps away from the parent drag capture.
      event.stopPropagation();
    });
  };
  wrap.querySelectorAll('.fab').forEach(protectButtonTap);

  if (!wrap.querySelector('.v097-fab-drag-handle')) {
    const handle = document.createElement('span');
    handle.className = 'v097-fab-drag-handle';
    handle.setAttribute('aria-label', '拖动快捷菜单');
    handle.setAttribute('title', '拖动移动');
    wrap.append(handle);
  }

  new MutationObserver(() => wrap.querySelectorAll('.fab').forEach(protectButtonTap))
    .observe(wrap, { childList: true, subtree: true });
}
