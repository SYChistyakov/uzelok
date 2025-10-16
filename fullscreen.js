function toggleFullScreen(video) {
  if (!document.fullscreenElement) {
    // If the document is not in full screen mode
    // make the video full screen
    video.requestFullscreen();
  } else {
    // Otherwise exit the full screen
    document.exitFullscreen?.();
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
      toggleFullScreen(video); 
    };
    video.__fullscreenDblClickHandler = handler;
    video.addEventListener('dblclick', handler);
  });
}

// Call the setup on script load so videos get dblclick handlers
setupFullscreenHandlers();
