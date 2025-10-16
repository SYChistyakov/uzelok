const app = {
  pager: {},
  pc: {},
  bundle: {},
  localVideoStream: {},
  localScreenStream: {},
  localAudioStream: {},
  ui: {
    videoOn: false,
    audioOn: false,
    screenOn: false,
    trackMonitors: {},
  }
};

function jsonPrettify(obj) {
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch (e) {}
  }
  return JSON.stringify(obj, null, 2);
}

async function init() {
  app.pager = new Pager();
  app.pager.showPage('connectPage');

  // Enable double-click fullscreen on tiles (from fullscreen.js)
  if (typeof setupFullscreenHandlers === 'function') {
    setupFullscreenHandlers();
  }

  app.pc = new P2PConnection(statusCallback);

  app.bundle = await app.pc.createOfferBundle();

  console.log("OFFER + ICE bundle:");
  console.log("Encoded QR text (pretty):\n" + jsonPrettify(app.bundle));

  textToQR(jsonPrettify(app.bundle), 'qrCanvas');
}


function statusCallback(status) {
  console.log("Status:\n" + jsonPrettify(status));
  if (status.connectionState === 'connected') {
    app.localVideoStream = new MediaStream([black()]);
    app.localAudioStream = new MediaStream([silence()]);
    app.localScreenStream = new MediaStream([black()]);


    // Build separate remote streams
    const remoteVideoTrack = app.pc.getRemoteVideoTrack();
    const remoteAudioTrack = app.pc.getRemoteAudioTrack();
    const remoteScreenTrack = app.pc.getRemoteScreenTrack();
    const remoteVideoStream = remoteVideoTrack ? new MediaStream([remoteVideoTrack]) : new MediaStream();
    const remoteAudioStream = remoteAudioTrack ? new MediaStream([remoteAudioTrack]) : new MediaStream();
    const remoteScreenStream = remoteScreenTrack ? new MediaStream([remoteScreenTrack]) : new MediaStream();

    bindStream(app.localVideoStream, "localVideo");
    bindStream(app.localScreenStream, "localScreen");
    bindStream(remoteVideoStream, "remoteVideo");
    bindStream(remoteAudioStream, "remoteAudio");
    bindStream(remoteScreenStream, "remoteScreen");

    setBtnPressed('btnVideo', false);
    setBtnPressed('btnAudio', false);
    setBtnPressed('btnScreen', false);
    app.ui.videoOn = false;
    app.ui.audioOn = false;
    app.ui.screenOn = false;

    app.pager.showPage('callPage');
  }
}

function bindStream(stream, elId) {
  const el = document.getElementById(elId);
  el.srcObject = stream;
};

// Function to copy QR image from qrCanvas to clipboard as PNG
async function copyQR() {
  const canvas = document.getElementById('qrCanvas');
  if (canvas && navigator.clipboard && window.ClipboardItem) {
    try {
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type]: blob }) // 'image/png'
            ]);
            console.log("QR image copied to clipboard.");
          } catch (err) {
            console.error("Failed to copy image:", err);
          }
        } else {
          console.error("Failed to create Blob from canvas.");
        }
      }, 'image/png'); // Always produces PNG, which is widely supported
    } catch (err) {
      console.error("Error preparing to copy QR:", err);
    }
  } else {
    console.error("Clipboard or canvas not available.");
  }
}

// Function to paste image from clipboard into qrCanvas and decode it
async function pasteQR() {
  if (!(navigator.clipboard && navigator.clipboard.read)) {
    console.error("Clipboard read unsupported by browser.");
    return;
  }
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        if (blob) {
          const img = new Image();
          img.onload = async function() {
            const canvas = document.getElementById('qrCanvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // Draw/scaling
            // Decode QR if desired
            try {
              const text = await QRtoText('qrCanvas');
              console.log("Decoded QR text (pretty):\n" + jsonPrettify(text));
              let bundle;
              try {
                bundle = JSON.parse(text);
              } catch (e) {
                console.error("Failed to parse decoded QR as JSON:", e, text);
                return;
              }

              const answerBundle = await app.pc.acceptBundle(bundle);

              if (answerBundle != null) {
                app.bundle = answerBundle;
                console.log("OFFER + ICE bundle:");
                console.log("Encoded QR text (pretty):\n" + jsonPrettify(app.bundle));
                textToQR(jsonPrettify(app.bundle), 'qrCanvas');
              }
            } catch (err) {
              console.error("Failed to decode QR:", err);
            }
          };
          img.onerror = function(e) {
            console.error("Failed to load pasted image:", e);
          };
          img.src = URL.createObjectURL(blob);
          return;
        }
      }
    }
    console.warn("No image (png, jpg, etc) found in clipboard.");
  } catch (err) {
    console.error("Failed to read/paste from clipboard:", err);
  }
}

async function populateCamSelect() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const select = document.getElementById('camSource');
  if (!select) return;
  select.innerHTML = '';
  devices.forEach(d => {
      if (d.kind === 'videoinput') {
          const o = document.createElement('option');
          o.value = d.deviceId;
          o.text = d.label || `Camera ${select.length}`;
          select.appendChild(o);
      }
  });
}

async function populateMicSelect() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const select = document.getElementById('micSource');
  if (!select) return;
  select.innerHTML = '';
  devices.forEach(d => {
      if (d.kind === 'audioinput') {
          const o = document.createElement('option');
          o.value = d.deviceId;
          o.text = d.label || `Microphone ${select.length}`;
          select.appendChild(o);
      }
  });
}

// Open Popup
function openPopup(id) {
  document.getElementById(id).style.display = "block";
}

// Close Popup
function closePopup(id) {
  document.getElementById(id).style.display = "none";
}

async function openCamPopup() {
  const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
  tempStream.getTracks().forEach(track => track.stop()); // ✅ release camera
  await populateCamSelect();
  openPopup('camPopup');
}

async function openMicPopup() {
  const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  tempStream.getTracks().forEach(track => track.stop()); // ✅ release mic
  await populateMicSelect();
  openPopup('micPopup');
}

// screen share selection is now inline via toggle, no popup

function setBtnPressed(btnId, pressed) {
  const el = document.getElementById(btnId);
  if (!el) return;
  el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
}

async function toggleVideo() {
  const wasOn = app.ui.videoOn === true;
  if (wasOn) {
    await disableCamera();
  } else {
    await openCamPopup();
  }
  app.ui.videoOn = !wasOn;
  setBtnPressed('btnVideo', app.ui.videoOn);
}

async function toggleAudio() {
  const wasOn = app.ui.audioOn === true;
  if (wasOn) {
    await disableMicrophone();
  } else {
    await openMicPopup();
  }
  app.ui.audioOn = !wasOn;
  setBtnPressed('btnAudio', app.ui.audioOn);
}

async function toggleScreen() {
  const wasOn = app.ui.screenOn === true;
  if (wasOn) {
    await disableScreenShare();
  } else {
    await enableScreenShare();
  }
  app.ui.screenOn = !wasOn;
  setBtnPressed('btnScreen', app.ui.screenOn);
}

function replaceTrackInStream(stream, newTrack) {
  if (!stream || !newTrack) return;
  const kind = newTrack.kind;
  // Remove old track(s) of the same kind
  const oldTracks = kind === 'audio'
    ? stream.getAudioTracks()
    : kind === 'video'
      ? stream.getVideoTracks()
      : [];
  oldTracks.forEach(track => stream.removeTrack(track));
  stream.addTrack(newTrack);
}

function stopAllTracksInStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(track => {
    try {
      track.stop();
    } catch (e) {
      // Ignore errors on stop
    }
  });
}


async function disableCamera() {
  app.pc.stopLocalVideoTrack();
  stopAllTracksInStream(app.localVideoStream);
}

async function enableCamera(deviceId) {
  // Try to get the video stream from the selected camera
  let stream;
  try {
      stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } }
      });
  } catch (err) {
      alert("Unable to access camera: " + err.message);
      return;
  }
  const newTrack = stream.getVideoTracks()[0];
  app.pc.replaceLocalVideoTrack(newTrack);
  replaceTrackInStream(app.localVideoStream, newTrack);
}

async function enableCamSelected() {
  const select = document.getElementById('camSource');
  const deviceId = select && select.value ? select.value : '';
  if (deviceId) {
    await enableCamera(deviceId);
    app.ui.videoOn = true;
    setBtnPressed('btnVideo', true);
  }
  closePopup('camPopup');
}

async function enableMicSelected() {
  const select = document.getElementById('micSource');
  const deviceId = select && select.value ? select.value : '';
  if (deviceId) {
    await enableMicrophone(deviceId);
    app.ui.audioOn = true;
    setBtnPressed('btnAudio', true);
  }
  closePopup('micPopup');
}

async function enableScreenSelected() {
  const select = document.getElementById('screenSource');
  await enableScreenShare();
  closePopup('screenPopup');
}

async function disableMicrophone() {
  app.pc.stopLocalAudioTrack();
  stopAllTracksInStream(app.localAudioStream);
}

async function enableMicrophone(deviceId) {
  // Try to get the audio stream from the selected microphone
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }
    });
  } catch (err) {
    alert("Unable to access microphone: " + err.message);
    return;
  }
  const newTrack = stream.getAudioTracks()[0];
  app.pc.replaceLocalAudioTrack(newTrack);
  replaceTrackInStream(app.localAudioStream, newTrack);
}

async function disableScreenShare() {
  app.pc.stopLocalScreenTrack();
  stopAllTracksInStream(app.localScreenStream);
}

async function enableScreenShare() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    alert("Unable to capture screen: " + err.message);
    return;
  }
  const newTrack = stream.getVideoTracks()[0];
  app.pc.replaceLocalScreenTrack(newTrack);
  replaceTrackInStream(app.localScreenStream, newTrack);
  if (newTrack) newTrack.onended = () => disableScreenShare();
}

init();

// Removed treemap layout; CSS grid handles layout
