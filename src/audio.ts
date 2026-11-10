/* Balloon Defense — tiny sound effects synthesized with Web Audio (no sound files).
   Off by default so the game stays quiet at work; toggle in Settings or with the speaker button. */
const Sound = {
    ctx: null,
    master: null,
    last: {},
    init() {
        if (!this.ctx) {
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC)
                return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.3;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended')
            this.ctx.resume();
    },
    /** play a named effect, rate-limited so busy rounds don't get noisy */
    play(name) {
        if (!SETTINGS.sound || !this.ctx)
            return;
        const now = this.ctx.currentTime, gap = { pop: 0.035, clink: 0.1, boom: 0.07, zap: 0.09, shot: 0.06, place: 0.05 }[name] || 0;
        if (gap && this.last[name] && now - this.last[name] < gap)
            return;
        this.last[name] = now;
        const fx = {
            pop: () => this.tone(500 + Math.random() * 500, 180, 0.07, 'triangle', 0.35),
            clink: () => this.tone(1800, 1400, 0.05, 'square', 0.08),
            boom: () => this.noise(0.35, 0.55, 500),
            zap: () => this.tone(1400, 200, 0.12, 'sawtooth', 0.12),
            shot: () => this.noise(0.06, 0.35, 3000),
            place: () => this.tone(260, 420, 0.09, 'triangle', 0.3),
            upgrade: () => { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.09, 'triangle', 0.25, i * 0.07)); },
            chime: () => { [659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.16, 'sine', 0.3, i * 0.09)); },
            leak: () => this.tone(160, 90, 0.25, 'sawtooth', 0.2),
            ability: () => { this.noise(0.4, 0.3, 1200); this.tone(200, 900, 0.3, 'triangle', 0.25); },
            level: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.28, i * 0.08)); },
            boss: () => { this.tone(110, 70, 0.6, 'sawtooth', 0.3); this.tone(165, 100, 0.6, 'square', 0.12); },
            milestone: () => { [880, 1175].forEach((f, i) => this.tone(f, f, 0.12, 'sine', 0.25, i * 0.08)); }
        };
        if (fx[name])
            fx[name]();
    },
    tone(f1, f2, dur, type, vol, delay = 0) {
        const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    },
    noise(dur, vol, cutoff) {
        const c = this.ctx, t = c.currentTime, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++)
            d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = buf;
        f.type = 'lowpass';
        f.frequency.value = cutoff;
        g.gain.value = vol;
        s.connect(f);
        f.connect(g);
        g.connect(this.master);
        s.start(t);
    }
};
