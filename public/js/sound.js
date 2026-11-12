// 轻量音效：WebAudio 合成，无外部音频文件
let ctx = null;
let enabled = localStorage.getItem('pyh.sound') !== 'off';

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur = 0.08, { type = 'sine', gain = 0.05, when = 0, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  get enabled() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    localStorage.setItem('pyh.sound', enabled ? 'on' : 'off');
    if (enabled) this.play('click');
    return enabled;
  },
  play(name) {
    if (!enabled) return;
    switch (name) {
      case 'click':
        tone(720, 0.05, { type: 'triangle', gain: 0.035 });
        break;
      case 'deal':
        tone(320, 0.06, { type: 'triangle', gain: 0.03, slide: -80 });
        break;
      case 'play':
        tone(460, 0.07, { type: 'triangle', gain: 0.04 });
        tone(690, 0.09, { type: 'sine', gain: 0.03, when: 0.03 });
        break;
      case 'chip':
        tone(1180, 0.05, { type: 'square', gain: 0.02 });
        tone(880, 0.06, { type: 'triangle', gain: 0.025, when: 0.02 });
        break;
      case 'turn':
        tone(840, 0.07, { type: 'sine', gain: 0.035 });
        tone(1120, 0.1, { type: 'sine', gain: 0.025, when: 0.07 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.045, when: i * 0.1 }));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => tone(f, 0.25, { type: 'sine', gain: 0.04, when: i * 0.12 }));
        break;
      case 'warn':
        tone(240, 0.18, { type: 'sawtooth', gain: 0.025 });
        break;
      default:
        break;
    }
  }
};
