function toggleWindowFill(target) {
  // Accept either a <video> inside a tile, or the tile window itself
  const tile = (target && target.classList && target.classList.contains('tile-window'))
    ? target
    : (target && target.closest ? target.closest('.tile-window') : null) || (target ? target.parentElement : null);
  if (!tile) return;
  const alreadyActive = tile.classList.contains('window-fill');
  // Remove from any other active tile
  document.querySelectorAll('.tile-window.window-fill').forEach(el => el.classList.remove('window-fill'));
  if (!alreadyActive) {
    tile.classList.add('window-fill');
  }
  // Toggle page scroll based on active state
  if (document.querySelector('.tile-window.window-fill')) {
    document.body.classList.add('no-scroll');
  } else {
    document.body.classList.remove('no-scroll');
  }
}

function setupFullscreenHandlers() {
  // Select all video elements in the document
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    // To avoid double-wiring, first remove if any
    video.removeEventListener('dblclick', video.__fullscreenDblClickHandler);
    // Add the handler
    const handler = function(e) { 
      toggleWindowFill(video); 
    };
    video.__fullscreenDblClickHandler = handler;
    video.addEventListener('dblclick', handler);
  });

  // Wire up Maximize buttons in each tile window
  const maximizeButtons = document.querySelectorAll('.tile-window .title-bar-controls button[aria-label="Maximize"]');
  maximizeButtons.forEach(btn => {
    btn.removeEventListener('click', btn.__windowFillClickHandler);
    const clickHandler = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const tile = btn.closest('.tile-window');
      if (tile) toggleWindowFill(tile);
    };
    btn.__windowFillClickHandler = clickHandler;
    btn.addEventListener('click', clickHandler);
  });

  // ESC to exit window-fill
  if (document.__windowFillEscHandler) {
    document.removeEventListener('keydown', document.__windowFillEscHandler);
  }
  const escHandler = function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.tile-window.window-fill').forEach(el => el.classList.remove('window-fill'));
      document.body.classList.remove('no-scroll');
    }
  };
  document.__windowFillEscHandler = escHandler;
  document.addEventListener('keydown', escHandler);
}

// Call the setup on script load so videos get dblclick handlers
setupFullscreenHandlers();
