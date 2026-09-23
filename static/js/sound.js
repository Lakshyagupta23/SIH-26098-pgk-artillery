/* ==========================================================================
   AEGIS-155: Web Audio API Tactical Sound Engine
   Procedural Web Audio synthesis for Muzzle Flash, Canard Servo, Lock Ping, Impact
   ========================================================================== */

class TacticalSoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.masterGain = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.3;
                this.masterGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.3;
        }
        return this.muted;
    }

    playLaunch() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Muzzle impulse sub-bass
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + 0.6);
        
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.7);

        // Muzzle blast white noise burst
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.4);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(120, now + 0.4);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
    }

    playCanardServo() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.linearRampToValueAtTime(1650, now + 0.07);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.07);
    }

    playLockPing() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, now);
        osc.frequency.setValueAtTime(3000, now + 0.04);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playImpactExplosion() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(18, now + 1.1);

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.1);
    }
}


window.TacticalSoundEngine = TacticalSoundEngine;
window.tacticalAudio = new TacticalSoundEngine();
export default TacticalSoundEngine;
