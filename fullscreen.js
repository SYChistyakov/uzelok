function toggleWindowFill(video) {
  const alreadyActive = video.classList.contains('window-fill');
  // Remove from any other active video
  document.querySelectorAll('video.window-fill').forEach(v => v.classList.remove('window-fill'));
  if (!alreadyActive) {
    video.classList.add('window-fill');
  }
  // Toggle page scroll based on active state
  if (document.querySelector('video.window-fill')) {
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

  // ESC to exit window-fill
  if (document.__windowFillEscHandler) {
    document.removeEventListener('keydown', document.__windowFillEscHandler);
  }
  const escHandler = function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('video.window-fill').forEach(v => v.classList.remove('window-fill'));
      document.body.classList.remove('no-scroll');
    }
  };
  document.__windowFillEscHandler = escHandler;
  document.addEventListener('keydown', escHandler);
}

// Call the setup on script load so videos get dblclick handlers
setupFullscreenHandlers();
