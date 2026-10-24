// 声音：WebAudio 合成的木琴音色 + 中文语音朗读
let ac = null, master = null;
export const settings = { sound: true, voice: true };

export function unlockAudio() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .6; master.connect(ac.destination); } catch { return; }
  }
  if (ac.state === 'suspended') ac.resume();
}

function note(freq, when = 0, dur = .6, vol = .35, type = 'sine') {
  if (!ac || !settings.sound) return;
  const t = ac.currentTime + when;
  // 木琴 = 基音 + 4 倍泛音，快速衰减
  [[1, vol], [4, vol * .18], [2.01, vol * .12]].forEach(([m, v]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur / (m > 1 ? 3 : 1));
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
  });
}
const SCALE = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3, 659.3, 698.5];
export const sfx = {
  count(n) { note(SCALE[Math.min(n, 10)] || 523, 0, .7, .4); },           // 数字越大音越高：用声音感受“变多”
  countDown(n) { note(SCALE[Math.min(n, 10)] || 262, 0, .5, .3); },
  tap() { note(880, 0, .15, .15, 'triangle'); },
  pop() { note(660, 0, .2, .2, 'triangle'); note(990, .05, .2, .15, 'triangle'); },
  success() { [523.3, 659.3, 784, 1046.5].forEach((f, i) => note(f, i * .09, .9, .3)); },
  big() { [392, 523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => note(f, i * .1, 1.1, .28)); },
  hmm() { note(392, 0, .35, .2); note(349.2, .18, .45, .2); },
  chirp() {
    if (!ac || !settings.sound) return;
    [0, .14].forEach(w => { const t = ac.currentTime + w, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(2800, t + .08); o.frequency.exponentialRampToValueAtTime(1600, t + .12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .13);
      o.connect(g).connect(master); o.start(t); o.stop(t + .15); });
  },
  munch() { if (!ac || !settings.sound) return; [0, .12, .24].forEach(w => note(180 + Math.random() * 40, w, .1, .25, 'square')); },
  whoosh() {
    if (!ac || !settings.sound) return;
    const t = ac.currentTime, len = .35, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + len); g.gain.value = .12;
    src.buffer = buf; src.connect(f).connect(g).connect(master); src.start(t);
  },
  grow() { [784, 988, 1175, 1568].forEach((f, i) => note(f, i * .07, .5, .18, 'triangle')); },
};

/* ---------- 语音 ---------- */
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Tingting|Ting-Ting|Yaoyao|Huihui|female/i.test(v.name))
    || vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

let speakId = 0;
export function say(text, { rate = .9, pitch = 1.2, interrupt = true } = {}) {
  return new Promise(resolve => {
    if (!settings.voice || !('speechSynthesis' in window) || !text) return resolve();
    const id = ++speakId;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; if (voice) u.voice = voice; u.rate = rate; u.pitch = pitch;
    let done = false; const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(finish, 800 + text.length * 300);
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
  });
}
export function stopVoice() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
