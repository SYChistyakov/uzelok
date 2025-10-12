let peerConnection;
let localStream;
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

// Get available devices (Microphone & Camera)
async function getMediaDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioSelect = document.getElementById("audioSource");
    const videoSelect = document.getElementById("videoSource");

    audioSelect.innerHTML = "";
    videoSelect.innerHTML = "";

    devices.forEach(device => {
        if (device.kind === "audioinput") {
            let option = document.createElement("option");
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSelect.length + 1}`;
            audioSelect.appendChild(option);
        } else if (device.kind === "videoinput") {
            let option = document.createElement("option");
            option.value = device.deviceId;
            option.text = device.label || `Camera ${videoSelect.length + 1}`;
            videoSelect.appendChild(option);
        }
    });
}
getMediaDevices();

// Start Call with Selected Devices
async function startCall() {
    const audioSource = document.getElementById("audioSource").value;
    const videoSource = document.getElementById("videoSource").value;

    const constraints = {
        video: videoSource ? { deviceId: { exact: videoSource } } : true,
        audio: audioSource ? { deviceId: { exact: audioSource } } : true
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    closePopup('devicePopup');
}

// Peer Connection Setup
function createPeerConnection() {
    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.ontrack = (event) => {
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = event.streams[0];
            console.log("video has been set");
        }
    };

    iceCandidates = [];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            iceCandidates.push(event.candidate);
        }
    };

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
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
