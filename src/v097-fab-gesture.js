const wrap = document.querySelector('#fabWrap');
if (wrap) {
  // Dragging is handled by v097-ui-fixes.js with a movement threshold. Keeping
  // pointer events bubbling allows the whole black four-quadrant control,
  // including its buttons, to be dragged; ordinary taps still execute commands.
  wrap.dataset.v097GestureMode = 'drag-or-tap';
  wrap.setAttribute('title', '拖动可移动快捷菜单；轻点执行功能');
}
