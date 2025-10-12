let peerConnection;
let localStream;
let remoteStream;
let iceCandidates = [];
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const qrCanvas = document.getElementById("qrCanvas");

// Open Popup
function openPopup(id) {
    document.getElementById(id).style.display = "block";
}

// Close Popup
function closePopup(id) {
    document.getElementById(id).style.display = "none";
}

async function populateCamSelect() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const select = document.getElementById('camSource');
    if (!select) return;
    select.innerHTML = '';
    // First option to disable video
    const none = document.createElement('option');
    none.value = '';
    none.text = 'Disable video';
    select.appendChild(none);
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
    // First option to disable audio
    const none = document.createElement('option');
    none.value = '';
    none.text = 'Disable microphone';
    select.appendChild(none);
    devices.forEach(d => {
        if (d.kind === 'audioinput') {
            const o = document.createElement('option');
            o.value = d.deviceId;
            o.text = d.label || `Microphone ${select.length}`;
            select.appendChild(o);
        }
    });
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

async function disableCamera() {
    if (!localStream) return;

    const newTrack = await createBlackVideoTrack();

    localStream.getVideoTracks().forEach(track => {
        track.stop();
        localStream.removeTrack(track);
    });

    localStream.addTrack(newTrack);
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

    // Remove old video tracks
    localStream.getVideoTracks().forEach(track => {
        track.stop();
        localStream.removeTrack(track);
    });

    // Add the selected camera track
    localStream.addTrack(newTrack);

    // Replace outgoing video track in peerConnection, if any
    if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        await sender.replaceTrack(newTrack);
        try { if (sender.requestKeyFrame) await sender.requestKeyFrame(); } catch (e) {}
    }
}

async function enableCameraSelected() {
    const select = document.getElementById('camSource');
    const deviceId = select && select.value ? select.value : '';
    if (!deviceId) {
        await disableCamera();
    } else {
        await enableCamera(deviceId);
    }
    closePopup('camPopup');
}

async function disableMic() {
    if (!localStream) return;

    const newTrack = createSilentAudioTrack();

    localStream.getAudioTracks().forEach(track => {
        track.stop();
        localStream.removeTrack(track);
    });

    localStream.addTrack(newTrack);
}

async function enableMic(deviceId) {
    const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        }
      };
    // Try to get the audio stream from the selected microphone
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = stream.getAudioTracks()[0];

    // Remove old audio tracks
    localStream.getAudioTracks().forEach(track => {
        track.stop();
        localStream.removeTrack(track);
    });

    // Add the selected microphone track
    localStream.addTrack(newTrack);

    // Replace outgoing audio track in peerConnection, if any
    if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
        await sender.replaceTrack(newTrack);
        try { if (sender.requestKeyFrame) await sender.requestKeyFrame(); } catch (e) {}
    }
}

async function enableMicSelected() {
    const select = document.getElementById('micSource');
    const deviceId = select && select.value ? select.value : '';
    if (!deviceId) {
        await disableMic();
    } else {
        await enableMic(deviceId);
    }
    closePopup('micPopup');
}


async function initStreamsWithPlaceholders() {
    localStream = new MediaStream();
    localVideo.srcObject = localStream;
    
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
}

// Peer Connection Setup
function createPeerConnection() {
    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.ontrack = (event) => {
        const kind = event.track.kind;
        if (kind === 'audio') {
            remoteVideo.muted = false;
        }
        remoteStream.getTracks()
            .filter(t => t.kind === kind)
            .forEach(t => {
                remoteStream.removeTrack(t);
                t.stop();
            });
    
        remoteStream.addTrack(event.track);
    };

    iceCandidates = [];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            iceCandidates.push(event.candidate);
        }
    };

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

// --- Placeholder track creators ---
function createSilentAudioTrack() {
    _placeholderAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _placeholderOscillator = _placeholderAudioCtx.createOscillator();
    _placeholderGain = _placeholderAudioCtx.createGain();
    _placeholderGain.gain.value = 0; // silence
    _placeholderAudioDest = _placeholderAudioCtx.createMediaStreamDestination();
    //_placeholderOscillator.connect(_placeholderGain).connect(_placeholderAudioDest);
    //_placeholderOscillator.start();
    const track = _placeholderAudioDest.stream.getAudioTracks()[0];
    //track.stop();
    return track;
}

async function createBlackVideoTrack() {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = 'no-stream.png';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            // Use image's natural size, or a fallback
            canvas.width = img.naturalWidth || 600;
            canvas.height = img.naturalHeight || 200;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const stream = canvas.captureStream(0);
            const track = stream.getVideoTracks()[0];
            resolve(track);
        };
        img.onerror = function(e) {
            reject(e);
        };
    });
}

  

// Wait for ICE gathering to complete (non-trickle)
async function waitForIceGatheringComplete(pc, timeoutMs = 10000) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise((resolve) => {
        const onChange = () => {
            if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", onChange);
                resolve();
            }
        };
        pc.addEventListener("icegatheringstatechange", onChange);
        // Fallback timeout to avoid waiting forever
        setTimeout(() => {
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
        }, timeoutMs);
    });
}

// Create Offer
async function createOffer() {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to finish and send a single bundle (SDP + ICE)
    await waitForIceGatheringComplete(peerConnection);

    const bundle = {
        offer: peerConnection.localDescription, // contains type and sdp
        iceCandidates
    };
    await renderStegoFromBundle(bundle, 'offer');
}

// Create Answer
async function createAnswer() {
    createPeerConnection();
    let parsed;
    try {
        parsed = await getBundleFromStego();
    } catch (e) {
        try {
            await pasteFromClipboard();
            parsed = await getBundleFromStego();
        } catch (e2) {
            alert('Unable to read remote offer image. Paste the image, then try again.');
            throw e2;
        }
    }

    // Support both new bundle format and legacy plain SDP
    const remoteOffer = parsed.offer ? parsed.offer : parsed;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer));

    // If remote provided their ICE candidates in the bundle, add them now
    if (parsed.iceCandidates && Array.isArray(parsed.iceCandidates)) {
        for (const candidate of parsed.iceCandidates) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Wait for local ICE gathering to finish and send a single bundle (SDP + ICE)
    await waitForIceGatheringComplete(peerConnection);

    const bundle = {
        answer: peerConnection.localDescription, // contains type and sdp
        iceCandidates
    };
    await renderStegoFromBundle(bundle, 'answer');
}

// Accept Answer
async function acceptAnswer() {
    const parsed = await getBundleFromStego();

    // Support both new bundle format and legacy plain SDP
    const remoteAnswer = parsed.answer ? parsed.answer : parsed;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));

    // If remote provided their ICE candidates in the bundle, add them now
    if (parsed.iceCandidates && Array.isArray(parsed.iceCandidates)) {
        for (const candidate of parsed.iceCandidates) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    console.log("answer accepted (SDP + ICE if provided)");
}

// Clipboard Helpers (image only)
async function copyToClipboard() {
    if (!qrCanvas.width || !qrCanvas.height) {
        alert('No image to copy.');
        return;
    }
    const blob = await new Promise(resolve => qrCanvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

async function pasteFromClipboard() {
    const items = await navigator.clipboard.read();
    for (const item of items) {
        if (item.types.includes('image/png')) {
            const blob = await item.getType('image/png');
            await renderImageBlob(blob);
            return;
        }
    }
    alert('No image found in clipboard.');
}

async function renderImageBlob(blob) {
    const img = new Image();
    img.onload = async () => {
        const ctx = qrCanvas.getContext('2d');
        qrCanvas.width = img.width;
        qrCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
    };
    img.src = URL.createObjectURL(blob);
}

async function getBundleFromStego() {
    if (!qrCanvas.width || !qrCanvas.height) throw new Error('Image canvas is empty');
    try {
        const bytes = readBytesFromCanvasLSB(qrCanvas);
        return await bytesToBundle(bytes);
    } catch (e) {
        alert('Image does not contain a valid hidden payload. Ensure PNG, not recompressed.');
        throw e;
    }
}

async function renderStegoFromBundle(bundle, kind) {
    const bytes = await bundleToBytes(bundle);
    await drawCoverImage(kind);
    writeBytesToCanvasLSB(qrCanvas, bytes);
}

async function drawCoverImage(kind) {
    // Load base image (offer.png / answer.png) and draw to canvas, keeping original size
    const img = new Image();
    img.crossOrigin = "anonymous"; // must be set BEFORE setting src
    img.src = kind === 'answer' ? 'answer.png' : 'offer.png';
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
    const ctx = qrCanvas.getContext('2d');
    qrCanvas.width = img.width;
    qrCanvas.height = img.height;
    ctx.drawImage(img, 0, 0);
}

(async () => {
    try {
        initStreamsWithPlaceholders();

        await disableCamera();
        await disableMic();

        var newTrack = await createBlackVideoTrack();
        remoteStream.addTrack(newTrack);
    } catch (e) {
        console.warn('Failed to init placeholders', e);
    } finally {
        console.log('Init complete');
    }
})();
