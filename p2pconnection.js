const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

class P2PConnection {
  constructor(statusCallback) {
    this.pc = null;
    this.videoTransceiver = null;
    this.audioTransceiver = null;
    this.screenVideoTransceiver = null;
    this.screenAudioTransceiver = null;
    this.localCandidates = [];
    this.reportCallback = statusCallback;
  }

  async _ensurePC() {
    if (!this.pc) {
      this.pc = new RTCPeerConnection({ iceServers });

      this.pc.ontrack = (event) => {
        console.log('ontrack event:', event);
      };   

      this._subscribeToConnectionStates();

      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.localCandidates.push(e.candidate);
        }
      };
    }
  }

  _initTransceiver() {
    if (!this.pc) throw new Error("PeerConnection is not initialized");
    this.videoTransceiver = this.pc.addTransceiver('video', { direction: 'sendrecv' });
    this.screenVideoTransceiver = this.pc.addTransceiver('video', { direction: 'sendrecv' });
    this.screenAudioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });
  }

  _subscribeToConnectionStates() {
    if (!this.reportCallback) return;
    if (typeof this.reportCallback !== "function") {
      throw new Error("callback must be a function");
    }
  
    const report = () => {
      this.reportCallback({
        signalingState: this.pc.signalingState,
        iceConnectionState: this.pc.iceConnectionState,
        iceGatheringState: this.pc.iceGatheringState,
        connectionState: this.pc.connectionState,
      });
    };
  
    // Initial report
    report();
  
    this.pc.onsignalingstatechange = report;
    this.pc.oniceconnectionstatechange = report;
    this.pc.onicegatheringstatechange = report;
    this.pc.onconnectionstatechange = report;
  }

  _gatherCompletePromise() {
    return new Promise(resolve => {
      if (this.pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === "complete") {
            this.pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        this.pc.addEventListener("icegatheringstatechange", checkState);
      }
    });
  }

  async createOfferBundle() {
    await this._ensurePC();
    this.localCandidates = [];

    this._initTransceiver();
    this.replaceLocalVideoTrack(black());
    this.replaceLocalAudioTrack(silence());
    this.replaceLocalScreenVideoTrack(black());
    this.replaceLocalScreenAudioTrack(silence());

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait until ICE gathering is complete
    await this._gatherCompletePromise();
    // After ICE complete, pc.localDescription may get updated with ICE candidates

    // Copy candidates (clone array to avoid mutation outside)
    const candidates = [...this.localCandidates];

    return {
      offer: this.pc.localDescription,
      candidates
    };
  }

  async acceptBundle(bundle) {
    // Accepting an offer and returning an answer
    if (bundle.offer) {
      // Clean up if needed
      if (this.pc) {
        try {
          this.pc.onicecandidate = null;
          this.pc.ondatachannel = null;
          this.pc.close();
        } catch (e) { }
        this.pc = null;
      }
      await this._ensurePC();
      this.localCandidates = [];
      // Set remote offer
      await this.pc.setRemoteDescription(bundle.offer);
      // Add ICE candidates received from remote
      if (bundle.candidates && Array.isArray(bundle.candidates)) {
        for (const cand of bundle.candidates) {
          try {
            await this.pc.addIceCandidate(cand);
          } catch (err) {
            console.warn("Failed to add ICE candidate:", err);
          }
        }
      }
      
      const transceivers = this.pc.getTransceivers();
      this.videoTransceiver = transceivers[0];
      this.screenVideoTransceiver = transceivers[1];
      this.screenAudioTransceiver = transceivers[2];
      this.audioTransceiver = transceivers[3];
      this.videoTransceiver.direction = "sendrecv";
      this.screenVideoTransceiver.direction = "sendrecv";
      this.screenAudioTransceiver.direction = "sendrecv";
      this.audioTransceiver.direction = "sendrecv";
      this.replaceLocalVideoTrack(black());
      this.replaceLocalAudioTrack(silence());
      this.replaceLocalScreenVideoTrack(black());
      this.replaceLocalScreenAudioTrack(silence());

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await this._gatherCompletePromise();

      const candidates = [...this.localCandidates];

      return {
        answer: this.pc.localDescription,
        candidates
      };
    }
    // Accepting an answer (final step)
    else if (bundle.answer) {
      if (!this.pc) throw new Error("setRemoteDescription: no PeerConnection");
      await this.pc.setRemoteDescription(bundle.answer);
      if (bundle.candidates && Array.isArray(bundle.candidates)) {
        for (const cand of bundle.candidates) {
          try {
            await this.pc.addIceCandidate(cand);
          } catch (err) {
            console.warn("Failed to add ICE candidate:", err);
          }
        }
      }
      // No return value
    } else {
      throw new Error("acceptBundle: bundle must contain offer or answer");
    }
  }
  
  replaceLocalVideoTrack(newTrack) {
    if (!this.pc) return;
    this.videoTransceiver.sender.replaceTrack(newTrack);
  }

  replaceLocalScreenVideoTrack(newTrack) {
    if (!this.pc) return;
    if (!this.screenVideoTransceiver) return;
    this.screenVideoTransceiver.sender.replaceTrack(newTrack);
  }

  replaceLocalScreenAudioTrack(newTrack) {
    if (!this.pc) return;
    if (!this.screenAudioTransceiver) return;
    this.screenAudioTransceiver.sender.replaceTrack(newTrack);
  }

  replaceLocalAudioTrack(newTrack) {
    if (!this.pc) return;
    this.audioTransceiver.sender.replaceTrack(newTrack);
  }

  stopLocalVideoTrack() {
    if (!this.pc) return;
    this.videoTransceiver.sender.track.stop();
  }

  stopLocalScreenVideoTrack() {
    if (!this.pc) return;
    if (!this.screenVideoTransceiver) return;
    this.screenVideoTransceiver.sender.track.stop();
  }

  stopLocalScreenAudioTrack() {
    if (!this.pc) return;
    if (!this.screenAudioTransceiver) return;
    this.screenAudioTransceiver.sender.track.stop();
  }

  stopLocalAudioTrack() {
    if (!this.pc) return;
    this.audioTransceiver.sender.track.stop();
  }

  getRemoteVideoTrack() {
    if (!this.videoTransceiver || !this.videoTransceiver.receiver) return null;
    return this.videoTransceiver.receiver.track;
  }

  getRemoteScreenVideoTrack() {
    if (!this.screenVideoTransceiver || !this.screenVideoTransceiver.receiver) return null;
    return this.screenVideoTransceiver.receiver.track;
  }

  getRemoteScreenAudioTrack() {
    if (!this.screenAudioTransceiver || !this.screenAudioTransceiver.receiver) return null;
    return this.screenAudioTransceiver.receiver.track;
  }

  getRemoteAudioTrack() {
    if (!this.audioTransceiver || !this.audioTransceiver.receiver) return null;
    return this.audioTransceiver.receiver.track;
  }

  _monitorTrackState(track, onStopped) {
    let lastState = track.readyState;
  
    const interval = setInterval(() => {
      if (track.readyState !== lastState) {
        console.log(`Track state changed: ${lastState} → ${track.readyState}`);
        lastState = track.readyState;
  
        if (track.readyState === 'ended') {
          clearInterval(interval);
          onStopped(track);
        }
      }
    }, 1000);
  
    return () => clearInterval(interval);
  }

  close() {
    if (this.pc) {
      this.pc.close();
    }
  }
}

window.P2PConnection = P2PConnection;