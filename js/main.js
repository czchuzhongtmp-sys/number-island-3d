import * as THREE from 'three';
import * as W from './world.js';
import { sfx, say, stopVoice, unlockAudio, settings as audioSettings } from './audio.js';

/* ============ 工具 ============ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outBack: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  linear: t => t,
};

/* ============ 存档 ============ */
const KEY = 'number-island-v2';
const DEF = { flowers: 0, level: { count: 5, add: 5, sub: 5 }, streak: { count: 0, add: 0, sub: 0 }, struggle: { count: 0, add: 0, sub: 0 },
  settings: { voice: true, sound: true, round: 5, rest: 15, frameHint: true } };
let store;
try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); store = { ...structuredClone(DEF), ...s, settings: { ...DEF.settings, ...(s.settings || {}) }, level: { ...DEF.level, ...(s.level || {}) } }; }
catch { store = structuredClone(DEF); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
audioSettings.voice = store.settings.voice; audioSettings.sound = store.settings.sound;

/* ============ 3D 场景 ============ */
const container = $('#stage');
const renderer = W.createRenderer(container);
const scene = W.createScene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 300);
const seaParts = W.createSea(scene);
W.createIsland(scene);
const tree = W.createTree(scene);
const tray = W.createTray(scene);
const basket = W.createBasket(scene);
const chick = W.createChick(scene);
const clouds = W.createClouds(scene);
const flowers = [];
const butterflies = [];
for (let i = 0; i < store.flowers; i++) { const f = W.createFlower(W.flowerSpot(i)); scene.add(f); flowers.push(f); }
syncButterflies(false);

// 盖布（“看一眼”游戏用）
const cover = new THREE.Mesh(new THREE.BoxGeometry(5.9, .12, 2.8), new THREE.MeshStandardMaterial({ color: 0x7cc8ff, roughness: .9 }));
cover.castShadow = true; cover.position.set(tray.position.x, 6, tray.position.z); cover.visible = false; scene.add(cover);
const coverDots = new THREE.Mesh(new THREE.BoxGeometry(5.95, .13, .3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
cover.add(coverDots);

// 星星粒子（庆祝）
const sparkGeo = new THREE.OctahedronGeometry(.12, 0);
const sparks = [];
function burst(pos, n = 24, colors = [0xffd166, 0xff8fab, 0x8fd3ff, 0xb5f28a, 0xffffff]) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: pick(colors), transparent: true }));
    m.position.copy(pos);
    const v = new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 6 + 3, (Math.random() - .5) * 6);
    sparks.push({ m, v, life: 0 }); scene.add(m);
  }
}

/* ============ 镜头 ============ */
const cam = { mode: 'menu', t: 0, look: new THREE.Vector3(0, 1.2, .6), px: 0, py: 0 };
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function cameraUpdate(dt) {
  const aspect = camera.aspect;
  const dist = THREE.MathUtils.clamp((aspect < 1 ? 14.5 : 18.5) / aspect, 11.8, 24);
  if (cam.mode === 'menu') {
    cam.t += dt * .08;
    const r = dist * 1.15;
    camera.position.set(Math.sin(cam.t) * r, r * .55, Math.cos(cam.t) * r);
    camera.lookAt(0, 1, 0);
  } else {
    const target = new THREE.Vector3(cam.px * .5, dist * .5 + cam.py * .3, dist);
    camera.position.lerp(target, Math.min(1, dt * 2.5));
    const lookY = aspect < 1 ? 2.0 : 1.45;
    cam.look.lerp(new THREE.Vector3(.3, lookY, -.2), Math.min(1, dt * 2.5));
    camera.lookAt(cam.look);
  }
}
window.addEventListener('pointermove', e => { cam.px = (e.clientX / innerWidth - .5) * 2; cam.py = (e.clientY / innerHeight - .5) * 2; });

/* ============ 动画系统 ============ */
const tweens = [];
function tween(dur, update, { easing = ease.outCubic, delay = 0 } = {}) {
  return new Promise(resolve => tweens.push({ t: -delay, dur, update, easing, resolve }));
}
function arc(obj, to, { dur = .6, height = 1.5, delay = 0, spin = true } = {}) {
  const from = obj.position.clone();
  const r0 = obj.rotation.y;
  return tween(dur, k => {
    obj.position.lerpVectors(from, to, k);
    obj.position.y += Math.sin(Math.PI * k) * height;
    if (spin) obj.rotation.y = r0 + k * Math.PI * 2;
  }, { easing: ease.inOut, delay }).then(() => squash(obj));
}
function squash(obj) {
  return tween(.35, k => { const s = 1 + Math.sin(k * Math.PI) * .25; obj.scale.set(s * (obj.userData.baseScale || 1), (2 - s) * (obj.userData.baseScale || 1), s * (obj.userData.baseScale || 1)); }, { easing: ease.linear })
    .then(() => obj.scale.setScalar(obj.userData.baseScale || 1));
}
function popIn(obj, delay = 0) { obj.scale.setScalar(.001); return tween(.45, k => obj.scale.setScalar(Math.max(.001, k) * (obj.userData.baseScale || 1)), { easing: ease.outBack, delay }); }

/* ============ HTML 数字标签 ============ */
const labelLayer = $('#labels');
const labels = new Set();
function addLabel(obj, text, cls = '', offsetY = .75) {
  const el = document.createElement('div');
  el.className = 'num-label ' + cls; el.textContent = text;
  labelLayer.appendChild(el);
  const l = { el, obj, offsetY }; labels.add(l);
  if (cls !== 'finger') obj.userData.label = l;
  return l;
}
function removeLabel(l) { if (!l) return; l.el.remove(); labels.delete(l); if (l.obj.userData.label === l) l.obj.userData.label = null; }
function clearLabels() { labels.forEach(l => l.el.remove()); labels.clear(); finger = null; }
const tmpV = new THREE.Vector3();
function updateLabels() {
  const w = container.clientWidth, h = container.clientHeight;
  labels.forEach(l => {
    l.obj.getWorldPosition(tmpV); tmpV.y += l.offsetY; tmpV.project(camera);
    l.el.style.transform = `translate(-50%,-50%) translate(${(tmpV.x * .5 + .5) * w}px, ${(-tmpV.y * .5 + .5) * h}px)`;
    l.el.style.display = l.obj.visible && tmpV.z < 1 ? '' : 'none';
  });
}

/* ============ 苹果管理 ============ */
let apples = [];
function spawnApple(color, pos) {
  const a = W.createApple(color);
  a.position.copy(pos); a.userData.baseScale = 1; scene.add(a); apples.push(a);
  return a;
}
function removeApple(a) { removeLabel(a.userData.label); scene.remove(a); apples = apples.filter(x => x !== a); }
async function clearApples() {
  const list = [...apples];
  await Promise.all(list.map((a, i) => tween(.25, k => a.scale.setScalar(Math.max(.001, 1 - k)), { delay: i * .02 })));
  list.forEach(removeApple); clearLabels();
}
const trayApples = () => apples.filter(a => a.userData.where === 'tray').sort((x, y) => x.userData.slot - y.userData.slot);
function freeSlot() { const used = new Set(trayApples().map(a => a.userData.slot)); for (let i = 0; i < 10; i++) if (!used.has(i)) return i; return -1; }
const ghosts = [];
function addGhost(slot) {
  const g = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff5a5f, transparent: true, opacity: .22, depthWrite: false }));
  g.position.copy(tray.userData.slots[slot]); g.position.y -= .1; scene.add(g); ghosts.push(g);
}
function clearGhosts() { ghosts.forEach(g => scene.remove(g)); ghosts.length = 0; }

/* ============ 点击 ============ */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let tapHandler = null;
renderer.domElement.addEventListener('pointerdown', e => {
  unlockAudio();
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(apples.filter(a => a.userData.clickable).map(a => a.userData.hit), false);
  if (hits.length && tapHandler) { lastTap = performance.now(); hideFinger(); tapHandler(hits[0].object.userData.owner); return; }
  // 点小鸡：小鸡会叫，增加趣味
  const ch = ray.intersectObject(chick, true);
  if (ch.length) { chickHop(); sfx.chirp(); }
});
renderer.domElement.addEventListener('pointermove', e => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(apples.filter(a => a.userData.clickable).map(a => a.userData.hit), false);
  renderer.domElement.style.cursor = hits.length ? 'pointer' : 'default';
});

/* ============ 新手引导：长时间没点击时，小手指提示 ============ */
let lastTap = performance.now(), finger = null;
function hideFinger() { if (finger) { removeLabel(finger); finger = null; } }
setInterval(() => {
  if (!tapHandler || finger) return;
  if (!$('#choices').classList.contains('hidden')) return;
  if (performance.now() - lastTap < 6000) return;
  const cands = apples.filter(x => x.userData.clickable && !x.userData.busy && x.visible);
  const pref = cands.filter(x => x.userData.where !== 'tray'); const pool = pref.length ? pref : cands;
  const a = pool.sort((p, q) => (q.position.z - Math.abs(q.position.x) * .3) - (p.position.z - Math.abs(p.position.x) * .3))[0];
  if (!a) return;
  finger = addLabel(a, '👆', 'finger', -.55);
}, 1000);
function armFinger() { lastTap = performance.now(); hideFinger(); }

/* ============ 小鸡动作 ============ */
const chickState = { talkUntil: 0, hop: 0, tilt: 0, blink: 0, nextBlink: 2, lookAt: null, flap: 0 };
function chickTalk(sec) { chickState.talkUntil = performance.now() / 1000 + sec; }
function chickHop() { chickState.hop = 1; chickState.flap = 1.2; }
function chickTilt() { chickState.tilt = 1; }
async function talk(text, opts) { chickTalk(Math.min(6, text.length * .22)); setBubble(text); await say(text, opts); chickState.talkUntil = 0; }
function chickMouthWorld() { const v = new THREE.Vector3(0, 1.1, 1.05); return chick.localToWorld(v); }

/* ============ 主循环 ============ */
const clock = new THREE.Clock();
let elapsed = 0;
function loop() {
  const dt = Math.min(clock.getDelta(), .1); elapsed += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur); tw.update(tw.easing(k));
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
  seaParts.forEach(p => p.userData.update && p.userData.update(elapsed));
  clouds.forEach(c => { c.position.x += c.userData.speed * dt; if (c.position.x > 50) c.position.x = -50; });
  // 树上苹果轻轻摇
  apples.forEach((a, i) => { if (a.userData.where === 'tree') a.rotation.z = Math.sin(elapsed * 2 + i) * .12; });
  tree.userData.crown.rotation.z = Math.sin(elapsed * .8) * .015;
  // 小鸡
  const u = chick.userData, now = performance.now() / 1000;
  chickState.nextBlink -= dt;
  if (chickState.nextBlink < 0) { chickState.blink = 1; chickState.nextBlink = 2 + Math.random() * 3; }
  chickState.blink = Math.max(0, chickState.blink - dt * 7);
  u.eyes.forEach(e => e.scale.y = 1 - Math.sin(chickState.blink * Math.PI) * .9);
  const talking = now < chickState.talkUntil;
  u.beakPivot.rotation.x = talking ? Math.abs(Math.sin(now * 14)) * .5 : u.beakPivot.rotation.x * .8;
  chickState.hop = Math.max(0, chickState.hop - dt * 1.6);
  chick.position.y = Math.sin(chickState.hop * Math.PI) * 1.1 * (chickState.hop > 0 ? 1 : 0) + Math.abs(Math.sin(elapsed * 2.2)) * .05;
  chickState.flap = Math.max(0, chickState.flap - dt);
  u.wings.forEach(w => w.rotation.z = w.userData.side * (.3 + (chickState.flap > 0 ? Math.abs(Math.sin(now * 25)) * .9 : Math.sin(elapsed * 2) * .05)));
  chickState.tilt = Math.max(0, chickState.tilt - dt * .6);
  chick.rotation.z = Math.sin(chickState.tilt * Math.PI) * .3;
  chick.scale.set(1 + Math.sin(elapsed * 2.2) * .015, 1 - Math.sin(elapsed * 2.2) * .015, 1);
  // 蝴蝶
  butterflies.forEach((b, i) => {
    const p = b.userData.phase + elapsed * .4;
    b.position.set(Math.cos(p + i) * (5 + i % 3), 2 + Math.sin(p * 2.3) * .6, Math.sin(p + i) * (4 + i % 2) - 2);
    b.rotation.y = -p - i + Math.PI;
    const f = Math.sin(elapsed * 18 + i) * .9; b.userData.pl.rotation.y = f; b.userData.pr.rotation.y = -f;
  });
  // 粒子
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life += dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 5; s.m.rotation.y += dt * 4;
    s.m.material.opacity = 1 - s.life / 1.4;
    if (s.life > 1.4) { scene.remove(s.m); sparks.splice(i, 1); }
  }
  cameraUpdate(dt);
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ============ UI ============ */
function show(id) {
  $$('.overlay-screen').forEach(s => s.classList.toggle('active', s.id === id));
  $('#hud').classList.toggle('hidden', id !== null);
  $('#play').classList.toggle('hidden', id !== null);
  cam.mode = id === 'menu' ? 'menu' : 'game';
}
function setBubble(text) { const b = $('#bubbleText'); b.textContent = text; $('#bubble').classList.remove('pulse'); void $('#bubble').offsetWidth; $('#bubble').classList.add('pulse'); }
function dotsHTML(n, cls = '') {
  let s = `<span class="mini-frame ${cls}">`;
  for (let i = 0; i < 10; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
  return s + '</span>';
}
function setTarget(n) {
  const t = $('#target');
  if (n == null) { t.classList.add('hidden'); return; }
  t.innerHTML = `<span>摘</span><b>${n}</b><span>个</span>${dotsHTML(n)}`; t.classList.remove('hidden');
  t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
}
function setEquation(html) { const e = $('#equation'); if (!html) { e.classList.add('hidden'); e.innerHTML = ''; return; } e.innerHTML = html; e.classList.remove('hidden'); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
function setProgress() {
  $('#progress').innerHTML = Array.from({ length: round.total }, (_, i) => `<span class="seed ${i < round.done ? 'on' : ''} ${i === round.done ? 'now' : ''}">${i < round.done ? '🌸' : '🌱'}</span>`).join('');
}
function showDone(onDone) {
  const b = $('#doneBtn'); b.classList.remove('hidden');
  b.onclick = () => { unlockAudio(); sfx.tap(); onDone(); };
}
function hideDone() { $('#doneBtn').classList.add('hidden'); }

// 选择题：数字 + 十格点阵（数字与数量对应）
function askChoice(answer, { scaffold } = {}) {
  return new Promise(resolve => {
    const opts = new Set([answer]);
    for (const d of shuffle([1, -1, 2, -2, 3])) { if (opts.size >= 3) break; const n = answer + d; if (n >= 0 && n <= 10) opts.add(n); }
    const box = $('#choices');
    box.innerHTML = shuffle([...opts]).map(n => `<button class="choice" data-n="${n}"><b>${n}</b>${dotsHTML(n)}</button>`).join('');
    box.classList.remove('hidden'); box.dataset.answer = answer;
    let tries = 0, locked = false;
    box.querySelectorAll('.choice').forEach(btn => btn.onclick = async () => {
      if (locked) return; unlockAudio();
      const n = Number(btn.dataset.n);
      if (n === answer) {
        locked = true; btn.classList.add('right');
        box.querySelectorAll('.choice').forEach(b => b !== btn && b.classList.add('fade'));
        await sleep(700); box.classList.add('hidden'); resolve(tries);
      } else {
        tries++; locked = true; btn.classList.add('wrong'); btn.disabled = true; sfx.hmm(); chickTilt();
        if (scaffold) await scaffold(tries);
        if (tries >= 2) box.querySelector(`.choice[data-n="${answer}"]`).classList.add('hint');
        locked = false;
      }
    });
  });
}

/* ============ 庆祝 & 奖励 ============ */
const PRAISE = ['你一个一个数得真仔细！', '你认真想了，真棒！', '答对啦！你的小手指数得好准！', '太好了，你自己找到了答案！', '你没有放弃，真了不起！'];
async function celebrate(text, big = false) {
  sfx.success(); chickHop(); burst(new THREE.Vector3(tray.position.x, 1.5, tray.position.z), big ? 50 : 30);
  trayApples().forEach((a, i) => tween(.4, k => a.position.y = tray.userData.slots[a.userData.slot].y + Math.sin(k * Math.PI) * .5, { delay: i * .05 }));
  await talk(text);
}
async function plantFlower() {
  const i = store.flowers;
  const f = W.createFlower(W.flowerSpot(i)); f.userData.baseScale = 1; scene.add(f); flowers.push(f);
  store.flowers++; save(); sfx.grow();
  burst(new THREE.Vector3(f.position.x, .6, f.position.z), 14, [0xffffff, 0xffd166, 0xb5f28a]);
  await popIn(f);
  syncButterflies(true);
}
function syncButterflies(animate) {
  const want = Math.min(6, Math.floor(store.flowers / 5));
  while (butterflies.length < want) { const b = W.createButterfly(pick([0xff8fab, 0x8fd3ff, 0xffd166, 0xc9a7ff])); scene.add(b); butterflies.push(b); if (animate) { sfx.chirp(); } }
}

/* ============ 场景准备 ============ */
async function resetBoard({ basketOn = false } = {}) {
  tapHandler = null; armFinger(); hideDone(); setTarget(null); setEquation(null); $('#choices').classList.add('hidden');
  await clearApples(); clearGhosts();
  basket.visible = basketOn;
}
async function fillTray(n, color = W.PALETTE.red, startSlot = 0) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const slot = startSlot + i, p = tray.userData.slots[slot].clone();
    const a = spawnApple(color, p.clone().add(new THREE.Vector3(0, 5, 0)));
    a.userData.where = 'tray'; a.userData.slot = slot; list.push(a);
    tween(.55, k => a.position.y = p.y + 5 * (1 - k), { easing: ease.outCubic, delay: i * .09 }).then(() => { squash(a); sfx.count(slot + 1); });
  }
  await sleep(n * 90 + 600);
  return list;
}
function fillTree() {
  return tree.userData.spots.map((p, i) => { const a = spawnApple(W.PALETTE.red, p); a.userData.where = 'tree'; a.userData.home = p.clone(); popIn(a, i * .05); return a; });
}
async function countAlong(list, start = 0, cls = '') {
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; removeLabel(a.userData.label);
    addLabel(a, start + i + 1, cls); sfx.count(start + i + 1); squash(a);
    await say(String(start + i + 1), { rate: 1.05 }); await sleep(120);
  }
}
function relabelTray(cls = '') { clearLabels(); trayApples().forEach((a, i) => addLabel(a, i + 1, cls)); }

/* ============ 自适应难度（最近发展区） ============ */
function maxFor(skill) { return store.level[skill]; }
function record(skill, tries) {
  if (tries === 0) { store.streak[skill]++; store.struggle[skill] = 0; }
  else { store.streak[skill] = 0; if (tries >= 2) store.struggle[skill]++; }
  if (store.streak[skill] >= 3 && store.level[skill] < 10) { store.level[skill]++; store.streak[skill] = 0; }
  if (store.struggle[skill] >= 2 && store.level[skill] > 3) { store.level[skill]--; store.struggle[skill] = 0; }
  save();
}
let lastQ = '';
function fresh(fn) { let q, n = 0; do { q = fn(); } while (JSON.stringify(q) === lastQ && ++n < 10); lastQ = JSON.stringify(q); return q; }

/* ============ 任务 1：摘苹果（按数取物） ============ */
async function taskPick() {
  const N = fresh(() => rand(2, maxFor('count')));
  await resetBoard();
  fillTree(); await sleep(500);
  setTarget(N);
  let checks = 0;
  const intro = talk(`请帮豆豆摘 ${N} 个苹果，放进盘子里。`);
  await new Promise(resolve => {
    apples.forEach(a => a.userData.clickable = true);
    const handler = async (a) => {
      if (a.userData.busy) return;
      if (a.userData.where === 'tree') {
        const slot = freeSlot(); if (slot < 0) return;
        a.userData.where = 'tray'; a.userData.slot = slot; a.userData.busy = true; a.rotation.z = 0;
        sfx.whoosh();
        await arc(a, tray.userData.slots[slot], { height: 1.2, dur: .55 });
        a.userData.busy = false;
        relabelTray(); const c = trayApples().length; sfx.count(c); say(String(c), { rate: 1.1 });
        if (tapHandler === handler) showDone(check);
      } else if (a.userData.where === 'tray') { // 放回树上（可以自己改正）
        a.userData.where = 'tree'; a.userData.busy = true; removeLabel(a.userData.label); sfx.pop();
        await arc(a, a.userData.home, { height: 1, dur: .5 }); a.userData.busy = false; relabelTray();
        if (!trayApples().length) hideDone();
      }
    };
    async function check() {
      const c = trayApples().length; checks++;
      tapHandler = null; hideDone();
      if (c === N) { resolve(); return; }
      sfx.hmm(); chickTilt();
      if (c > N) await talk(`盘子里有 ${c} 个，比 ${N} 个多了。点一点盘子里的苹果，把多的放回树上吧。`);
      else await talk(`盘子里有 ${c} 个，还不到 ${N} 个哦，再摘一些吧！`);
      tapHandler = handler; if (trayApples().length) showDone(check);
    }
    tapHandler = handler;
  });
  await intro;
  apples.forEach(a => a.userData.clickable = false);
  await celebrate(`${N} 个，正好！最后数到 ${N}，就是一共有 ${N} 个。${pick(PRAISE)}`);
  return checks === 1 ? 0 : checks - 1;
}

/* ============ 任务 2：数一数（点数 + 基数） ============ */
async function taskHowMany(flash = false) {
  const N = fresh(() => rand(1, maxFor('count')));
  await resetBoard();
  const list = await fillTray(N);
  let counted = 0;
  if (flash) {
    await talk('看一眼！盘子里有几个苹果？');
    await sleep(1300);
    cover.visible = true; cover.position.y = 6; sfx.whoosh();
    await tween(.5, k => cover.position.y = 6 - (6 - .55) * k, { easing: ease.outCubic });
  } else {
    list.forEach(a => a.userData.clickable = true);
    tapHandler = a => {
      if (a.userData.label) { squash(a); return; }
      counted++; addLabel(a, counted); sfx.count(counted); squash(a); say(String(counted), { rate: 1.1 });
    };
    await talk('盘子里有几个苹果？先用小手指点一点，数一数。');
    // 先数，再选：数完或等一会儿后才出现答案按钮
    const t0 = performance.now();
    while (counted < N && performance.now() - t0 < 9000) await sleep(200);
    if (counted >= N) await sleep(500);
  }
  const tries = await askChoice(N, {
    scaffold: async (t) => {
      if (flash) { await tween(.4, k => cover.position.y = .55 + k * 6); cover.visible = false; }
      if (t === 1) { await talk('没关系，我们一起来数！'); clearLabels(); counted = list.length; await countAlong(list); await talk(`最后数到 ${N}，所以一共有 ${N} 个。`); }
      else await talk('看看会发光的那个数字。');
    },
  });
  tapHandler = null;
  if (cover.visible) { await tween(.4, k => cover.position.y = .55 + k * 6); cover.visible = false; }
  if (!labels.size) relabelTray();
  await celebrate(`对啦，一共有 ${N} 个苹果！${tries === 0 ? pick(PRAISE) : '你又学会了一个！'}`);
  return tries;
}

/* ============ 任务 3：合起来（加法 / 接着数） ============ */
async function taskAdd() {
  const M = maxFor('add');
  const [a, b] = fresh(() => { const a = rand(1, M - 1); return [a, rand(1, Math.min(4, M - a))]; });
  await resetBoard({ basketOn: true });
  const reds = await fillTray(a);
  const golds = [];
  for (let i = 0; i < b; i++) { const g = spawnApple(W.PALETTE.gold, basket.userData.spots[i]); g.userData.where = 'basket'; golds.push(g); popIn(g, i * .08); }
  await sleep(400);
  addLabel(reds[reds.length - 1], a, 'red big', .9);
  setEquation(`<span class="red">${a}</span>`);
  await talk(`盘子里有 ${a} 个红苹果，篮子里有 ${b} 个黄苹果。点一点黄苹果，把它们放进盘子，从 ${a} 接着数！`);
  let moved = 0;
  await new Promise(resolve => {
    golds.forEach(g => g.userData.clickable = true);
    tapHandler = async g => {
      if (g.userData.where !== 'basket') return;
      g.userData.where = 'tray'; g.userData.clickable = false;
      const slot = a + moved; moved++; g.userData.slot = slot;
      sfx.whoosh(); await arc(g, tray.userData.slots[slot], { height: 1.4 });
      const n = slot + 1; addLabel(g, n, 'gold'); sfx.count(n); say(String(n), { rate: 1.1 });
      if (moved === b) { tapHandler = null; await sleep(700); resolve(); }
    };
  });
  setEquation(`<span class="red">${a}</span> + <span class="gold">${b}</span> = <span class="q">?</span>`);
  talk('现在盘子里一共有几个苹果？');
  const tries = await askChoice(a + b, {
    scaffold: async t => {
      if (t === 1) { await talk('我们从头数一遍！'); clearLabels(); await countAlong(trayApples()); }
      else await talk('看看会发光的那个数字。');
    },
  });
  setEquation(`<span class="red">${a}</span> + <span class="gold">${b}</span> = <span class="ans">${a + b}</span>`);
  await celebrate(`${a} 加 ${b} 等于 ${a + b}！合在一起，变多啦！`);
  return tries;
}

/* ============ 任务 4：喂小鸡（减法 / 拿走） ============ */
async function taskSub() {
  const M = maxFor('sub');
  const [a, b] = fresh(() => { const a = rand(2, M); return [a, rand(1, Math.min(4, a - (Math.random() < .12 ? 0 : 1)))]; });
  await resetBoard();
  const list = await fillTray(a);
  relabelTray();
  setEquation(`<span class="red">${a}</span>`);
  await talk(`盘子里有 ${a} 个苹果。豆豆肚子饿了，想吃 ${b} 个！点一点苹果，喂给豆豆吧。`);
  clearLabels();
  let eaten = 0;
  await new Promise(resolve => {
    list.forEach(x => x.userData.clickable = true);
    tapHandler = async x => {
      if (x.userData.where !== 'tray' || eaten >= b) return;
      x.userData.where = 'eating'; x.userData.clickable = false; eaten++;
      const myCount = eaten;
      addGhost(x.userData.slot); removeLabel(x.userData.label);
      sfx.whoosh(); chickState.talkUntil = performance.now() / 1000 + .8;
      await arc(x, chickMouthWorld(), { height: 1.6, dur: .6 });
      sfx.munch(); chickHop();
      await tween(.25, k => x.scale.setScalar(Math.max(.001, 1 - k)));
      removeApple(x);
      sfx.countDown(myCount); say(`吃了 ${myCount} 个`, { rate: 1.1 });
      if (myCount === b) {
        tapHandler = null; list.forEach(y => y.userData.clickable = false);
        await sleep(900); await talk('嗯，好吃！我吃饱啦！'); resolve();
      }
    };
  });
  setEquation(`<span class="red">${a}</span> − <span class="blue">${b}</span> = <span class="q">?</span>`);
  talk('盘子里还剩几个苹果？');
  const tries = await askChoice(a - b, {
    scaffold: async t => {
      if (t === 1) {
        const rest = trayApples();
        if (rest.length) { await talk('我们数一数还剩下的苹果。'); clearLabels(); await countAlong(rest); }
        else await talk('盘子里一个也没有了，就是零个。');
      } else await talk('看看会发光的那个数字。');
    },
  });
  setEquation(`<span class="red">${a}</span> − <span class="blue">${b}</span> = <span class="ans">${a - b}</span>`);
  if (!labels.size) relabelTray();
  await celebrate(`${a} 减 ${b} 等于 ${a - b}！吃掉了一些，变少啦！`);
  return tries;
}

/* ============ 回合 ============ */
const MODES = {
  count: () => (Math.random() < .5 ? ['count', taskPick] : ['count', () => taskHowMany(false)]),
  add: () => ['add', taskAdd],
  sub: () => ['sub', taskSub],
  mix: () => pick([['count', taskPick], ['count', () => taskHowMany(false)], ['count', () => taskHowMany(true)], ['add', taskAdd], ['sub', taskSub]]),
};
let round = null, playStart = Date.now(), roundToken = 0;
async function startRound(mode) {
  unlockAudio();
  const token = ++roundToken;
  round = { mode, total: store.settings.round, done: 0 };
  show(null); setProgress();
  while (round.done < round.total) {
    const [skill, fn] = MODES[mode]();
    const tries = await fn();
    if (token !== roundToken) return; // 已经退出
    record(skill, tries);
    round.done++; setProgress();
    await plantFlower();
    await sleep(600);
    if (token !== roundToken) return;
  }
  endRound();
}
async function endRound() {
  await resetBoard();
  sfx.big(); chickHop(); burst(new THREE.Vector3(0, 2, 0), 70);
  const restNeeded = (Date.now() - playStart) / 60000 >= store.settings.rest;
  $('#endTitle').textContent = restNeeded ? '豆豆有点累啦' : '小岛又变漂亮啦！';
  $('#endText').textContent = restNeeded ? `你已经玩了一会儿，我们去看看远处、喝口水，休息一下眼睛吧！` : `你种下了 ${round.total} 朵花，小岛上一共有 ${store.flowers} 朵花了！`;
  $('#btnAgain').classList.toggle('hidden', restNeeded);
  show('end');
  say($('#endTitle').textContent + '。' + $('#endText').textContent);
}
function quitToMenu() { roundToken++; stopVoice(); resetBoard(); show('menu'); }

/* ============ 绑定 ============ */
$('#btnStart').onclick = async () => { unlockAudio(); sfx.big(); $('#cover').classList.add('gone'); show('menu'); await say('欢迎来到数数小岛！我是小鸡豆豆。我们一起玩吧！'); };
$$('.card').forEach(c => c.onclick = () => { sfx.pop(); startRound(c.dataset.mode); });
$('#btnHome').onclick = () => { sfx.tap(); quitToMenu(); };
$('#btnSound').onclick = () => { store.settings.voice = audioSettings.voice = !audioSettings.voice; store.settings.sound = audioSettings.sound = store.settings.voice; save(); syncSoundBtn(); };
const syncSoundBtn = () => $('#btnSound').textContent = audioSettings.voice ? '🔊' : '🔇';
syncSoundBtn();
$('#bubble').onclick = () => say($('#bubbleText').textContent);
$('#btnAgain').onclick = () => startRound(round.mode);
$('#btnEndMenu').onclick = () => { playStart = Date.now(); show('menu'); };
$('#btnParent').onclick = () => {
  const a = rand(3, 9), b = rand(3, 9), r = prompt(`家长验证：${a} × ${b} = ?`);
  if (r === null) return; if (Number(r) !== a * b) return alert('答案不正确');
  $('#setRound').value = store.settings.round; $('#setRest').value = store.settings.rest; $('#setVoice').checked = store.settings.voice;
  $('#lvCount').textContent = store.level.count; $('#lvAdd').textContent = store.level.add; $('#lvSub').textContent = store.level.sub;
  show('parent');
};
$('#btnParentDone').onclick = () => {
  store.settings.round = Number($('#setRound').value); store.settings.rest = Number($('#setRest').value);
  store.settings.voice = store.settings.sound = audioSettings.voice = audioSettings.sound = $('#setVoice').checked; save(); syncSoundBtn(); show('menu');
};
$('#btnResetLv').onclick = () => { store.level = { count: 5, add: 5, sub: 5 }; save(); $('#lvCount').textContent = $('#lvAdd').textContent = $('#lvSub').textContent = 5; };
$('#flowerCount').textContent = store.flowers;
const fcObs = () => { $('#flowerCount').textContent = store.flowers; };
setInterval(fcObs, 1000);

show('menu'); $('#hud').classList.add('hidden');
window.__game = { store, startRound, get apples() { return apples; }, get tapHandler() { return tapHandler; }, tap: a => tapHandler && tapHandler(a), trayApples, quitToMenu };
