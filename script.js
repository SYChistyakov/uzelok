let peerConnection;
let localStream;
let remoteStream;
let iceCandidates = [];
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const qrCanvas = document.getElementById("qrCanvas");

// --- Status Elements ---
const connStatusDot = document.getElementById('connStatusDot');
const connStatusText = document.getElementById('connStatusText');
const iceStatusText = document.getElementById('iceStatusText');
const sigStatusText = document.getElementById('sigStatusText');

function setElementStateClasses(element, states) {
    if (!element) return;
    const all = ['idle', 'connecting', 'connected', 'disconnected', 'failed'];
    all.forEach(c => element.classList.remove(c));
    states.forEach(s => element.classList.add(s));
}

function setConnStatus(state, label) {
    setElementStateClasses(connStatusDot, [state]);
    setElementStateClasses(connStatusText, [state]);
    if (connStatusText) connStatusText.textContent = label || state.charAt(0).toUpperCase() + state.slice(1);
}

function setIceStatus(label) {
    if (iceStatusText) iceStatusText.textContent = label;
}

function setSigStatus(label) {
    if (sigStatusText) sigStatusText.textContent = label;
}

// Initialize idle
setConnStatus('idle', 'Idle');
setIceStatus('—');
setSigStatus('—');

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

    // Reflect immediate states
    setConnStatus('connecting', 'Connecting…');
    setSigStatus(peerConnection.signalingState);
    setIceStatus(peerConnection.iceGatheringState);

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

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        const s = peerConnection.connectionState;
        if (s === 'connected') setConnStatus('connected', 'Connected');
        else if (s === 'connecting' || s === 'new') setConnStatus('connecting', 'Connecting…');
        else if (s === 'disconnected') setConnStatus('disconnected', 'Disconnected');
        else if (s === 'failed') setConnStatus('failed', 'Failed');
        else if (s === 'closed') setConnStatus('disconnected', 'Closed');
    };

    // ICE states
    peerConnection.onicegatheringstatechange = () => {
        setIceStatus(peerConnection.iceGatheringState);
    };
    peerConnection.oniceconnectionstatechange = () => {
        // Show ICE connection state briefly as part of ICE status for clarity
        const iceConn = peerConnection.iceConnectionState;
        setIceStatus(`${peerConnection.iceGatheringState} / ${iceConn}`);
    };

    // Signaling state
    peerConnection.onsignalingstatechange = () => {
        setSigStatus(peerConnection.signalingState);
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
            canvas.width = img.naturalWidth || 1024;
            canvas.height = img.naturalHeight || 1024;

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
    setSigStatus('creating-offer');
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to finish and send a single bundle (SDP + ICE)
    setIceStatus('gathering');
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
    setSigStatus('reading-offer');
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

    setSigStatus('creating-answer');
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Wait for local ICE gathering to finish and send a single bundle (SDP + ICE)
    setIceStatus('gathering');
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
    setSigStatus(peerConnection.signalingState);
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

// Clipboard Helpers (image only)
async function shareVia() {
    if (!qrCanvas.width || !qrCanvas.height) {
        alert('No image to share.');
        return;
    }
    const blob = await new Promise(resolve => qrCanvas.toBlob(resolve, 'image/png'));
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'webrtc-offer.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'webrtc-offer.png', { type: 'image/png' });
        await navigator.share({
            files: [file],
            title: 'WebRTC Signal Image',
            text: 'Scan this image to exchange WebRTC signaling bundle.'
        });
    } else {
        alert('Sharing is not supported on this device/browser.');
    }
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
        const text = await QRtoText(qrCanvas);
        return JSON.parse((text || '').trim());
    } catch (e) {
        alert('Image does not contain a valid multiplexed QR payload.');
        throw e;
    }
}

async function renderStegoFromBundle(bundle, kind) {
    // Encode bundle as text and render multiplexed QR into qrCanvas
    const text = JSON.stringify(bundle);
    const out = await textToQR(text);
    const ctx = qrCanvas.getContext('2d');
    qrCanvas.width = out.width;
    qrCanvas.height = out.height;
    ctx.drawImage(out, 0, 0);
}

async function drawCoverImage(kind) {
    // No cover image needed for multiplexed QR; keeping function for compatibility
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
