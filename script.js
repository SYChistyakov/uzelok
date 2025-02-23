let peerConnection;
let localStream;
let iceCandidates = [];
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

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

// Create Offer
async function createOffer() {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    document.getElementById("signalingBox").value = btoa(JSON.stringify(offer));
    console.log("offer created");
}

// Create Answer
async function createAnswer() {
    createPeerConnection();
    const offer = JSON.parse(atob(document.getElementById("signalingBox").value));
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    document.getElementById("signalingBox").value = btoa(JSON.stringify(answer));
    console.log("answer created");
}

// Accept Answer
async function acceptAnswer() {
    const answer = JSON.parse(atob(document.getElementById("signalingBox").value));
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("answer accepted");
}

// Generate ICE Candidates and wait for ICE gathering to complete
async function generateICEs() {
    document.getElementById("signalingBox").value = 'Collecting ICEs...';

    // Ensure peer connection is created
    if (!peerConnection) {
        console.error("Peer connection is not initialized.");
        return;
    }

    // Event listener to detect when ICE gathering completes
    peerConnection.onicegatheringstatechange = () => {
        console.log("ICE Gathering State:", peerConnection.iceGatheringState);

        if (peerConnection.iceGatheringState === "complete") {
            document.getElementById("signalingBox").value = btoa(JSON.stringify(iceCandidates));
            console.log("All ICE candidates collected.");
        }
    };

    console.log("Waiting for ICE candidates...");

    if (peerConnection.iceGatheringState === "complete") {
        document.getElementById("signalingBox").value = btoa(JSON.stringify(iceCandidates));
        console.log("All ICE candidates collected.");
    }

    // Manually check ICE state after 10 seconds as a fallback
    setTimeout(() => {
        if (peerConnection.iceGatheringState !== "complete") {
            console.warn("ICE gathering taking too long, using available candidates.");
            document.getElementById("signalingBox").value = btoa(JSON.stringify(iceCandidates));
        }
    }, 10000);
}


// Accept ICE Candidates
async function acceptICEs() {
    const receivedICEs = JSON.parse(atob(document.getElementById("signalingBox").value));
    receivedICEs.forEach(async candidate => {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });
    document.getElementById("signalingBox").value
    console.log("ices added");
}

// Clipboard Helpers
function copyToClipboard() {
    navigator.clipboard.writeText(document.getElementById("signalingBox").value);
}

async function pasteFromClipboard() {
    document.getElementById("signalingBox").value = await navigator.clipboard.readText();
}
