// 3D 世界：小岛、苹果树、十格托盘、小鸡“豆豆”、花朵奖励
import * as THREE from 'three';

export const PALETTE = {
  grass: 0x9be08a, grassDark: 0x7fcf72, sand: 0xffe3ad, sea: 0x7fd6e8, wood: 0xe6b07a, woodDark: 0xc98f58,
  trunk: 0xa8744a, leaf: 0x6cc56b, leaf2: 0x86d97c, red: 0xff5a5f, gold: 0xffc93c, chick: 0xffd65c, beak: 0xff9a3c,
  white: 0xffffff, cheek: 0xff9eae,
};
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: 0, ...o });

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  // 渐变天空
  const skyGeo = new THREE.SphereGeometry(120, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x8fd0ff) }, mid: { value: new THREE.Color(0xd8f0ff) }, bottom: { value: new THREE.Color(0xfff0dc) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h>0.0 ? mix(mid, top, smoothstep(0.0,0.6,h)) : mix(mid, bottom, smoothstep(0.0,0.25,-h)); gl_FragColor = vec4(c,1.0);} `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(0xd8f0ff, 30, 90);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8e0a8, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.radius = 4;
  scene.add(sun);
  return scene;
}

export function createSea(scene) {
  const geo = new THREE.PlaneGeometry(160, 160, 80, 80);
  geo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geo, mat(PALETTE.sea, { roughness: .35, transparent: true, opacity: .95 }));
  sea.position.y = -0.55; sea.receiveShadow = true;
  const base = geo.attributes.position.array.slice();
  sea.userData.update = (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      p[i + 1] = Math.sin(x * .35 + t * 1.2) * .08 + Math.cos(z * .3 + t * .9) * .08;
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  };
  scene.add(sea);
  // 浪花环
  const foam = new THREE.Mesh(new THREE.TorusGeometry(10.1, .18, 8, 64), mat(0xffffff, { roughness: .5 }));
  foam.rotation.x = Math.PI / 2; foam.position.y = -0.45; scene.add(foam);
  foam.userData.update = (t) => { foam.scale.setScalar(1 + Math.sin(t * 1.5) * .008); };
  return [sea, foam];
}

export function createIsland(scene) {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.6, 1, 64), mat(PALETTE.sand));
  sand.position.y = -0.5; sand.receiveShadow = true; g.add(sand);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(8.9, 9.2, .5, 64), mat(PALETTE.grass));
  grass.position.y = -0.2; grass.receiveShadow = true; g.add(grass);
  // 小草丛与石头
  const rnd = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 4.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 0 && Math.abs(x) < 5.5) continue; // 留出前方游戏区域
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(.12, .45, 5), mat(rnd() > .5 ? PALETTE.grassDark : PALETTE.leaf2));
    tuft.position.set(x, .25, z); tuft.rotation.z = (rnd() - .5) * .4; g.add(tuft);
  }
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, r = 7.5 + rnd() * 1.5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.35 + rnd() * .3, 0), mat(0xd9d4cc, { flatShading: true }));
    rock.position.set(Math.cos(a) * r, .05, Math.sin(a) * r); rock.castShadow = true; rock.rotation.set(rnd(), rnd(), rnd()); g.add(rock);
  }
  // 灌木
  for (const [x, z, s] of [[-7, -4, 1], [6.8, -4.5, .9], [-2.5, -6.5, .8], [2.8, -6.8, 1.1]]) {
    const bush = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.6 * s, 16, 12), mat(k % 2 ? PALETTE.leaf : PALETTE.leaf2, { flatShading: true }));
      b.position.set((k - 1) * .55 * s, .45 * s + (k === 1 ? .2 : 0), 0); b.castShadow = true; bush.add(b);
    }
    bush.position.set(x, 0, z); g.add(bush);
  }
  scene.add(g);
  return g;
}

export function createTree(scene) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.32, .48, 2.6, 10), mat(PALETTE.trunk));
  trunk.position.y = 1.3; trunk.castShadow = true; tree.add(trunk);
  const crown = new THREE.Group(); crown.position.y = 3.4; tree.add(crown);
  for (const [x, y, z, r, c] of [[0, 0, 0, 1.7, PALETTE.leaf], [-1.1, -.3, .3, 1.2, PALETTE.leaf2], [1.1, -.2, .2, 1.25, PALETTE.leaf2], [0, .9, -.2, 1.2, PALETTE.leaf2], [0, -.4, .9, 1.1, PALETTE.leaf]]) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c, { flatShading: true }));
    s.position.set(x, y, z); s.castShadow = true; s.receiveShadow = true; crown.add(s);
  }
  tree.position.set(-4.6, 0, -1.7);
  tree.userData.crown = crown;
  // 树上苹果的位置（世界坐标）
  tree.userData.spots = [
    [-1.5, 3.0, 1.0], [-0.6, 3.9, 1.45], [0.5, 3.7, 1.6], [1.4, 3.1, 1.1], [-1.0, 2.5, 1.5],
    [0.1, 2.75, 2.0], [1.0, 2.35, 1.6], [-1.9, 3.7, .6], [1.9, 3.8, .55], [0.0, 4.6, 1.1],
  ].map(([x, y, z]) => new THREE.Vector3(x - 4.6, y, z - 1.7));
  scene.add(tree);
  return tree;
}

// 十格托盘：两排各 5 格
export function createTray(scene) {
  const tray = new THREE.Group();
  const base = new THREE.Mesh(roundedBox(5.6, .38, 2.5, .18), mat(PALETTE.wood));
  base.position.y = .19; base.castShadow = true; base.receiveShadow = true; tray.add(base);
  const slots = [];
  const cupMat = mat(0xb87842);
  const midLine = new THREE.Mesh(new THREE.BoxGeometry(5.2, .02, .05), mat(0xb87d48));
  midLine.position.set(0, .45, 0); tray.add(midLine);
  for (let i = 0; i < 10; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    const x = (col - 2) * 1.02, z = row === 0 ? -.58 : .58;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.43, .4, .05, 32), cupMat);
    cup.position.set(x, .465, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.43, .035, 8, 32), mat(0xfff1dc));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, .49, z); tray.add(ring); cup.receiveShadow = true; tray.add(cup);
    slots.push(new THREE.Vector3(x, .78, z));
  }
  tray.position.set(-0.4, 0, 1.6);
  tray.userData.slots = slots.map(v => v.clone().add(tray.position));
  scene.add(tray);
  return tray;
}

// 放黄苹果的小篮子
export function createBasket(scene) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(.7 + Math.pow(t, .8) * .55, t * .85)); }
  const basket = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat(0xf2b766, { side: THREE.DoubleSide }));
  body.castShadow = true; body.receiveShadow = true; basket.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, .08, 8, 40), mat(0xd9954a));
  rim.rotation.x = Math.PI / 2; rim.position.y = .85; basket.add(rim);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(.7, 24), mat(0xd9954a)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .01; basket.add(bottom);
  basket.position.set(3.95, 0, 2.55); basket.scale.setScalar(.78);
  const p = basket.position;
  basket.userData.spots = [[0, 0], [-.55, .2], [.55, .2], [0, -.55], [-.35, .5], [.35, .5], [-.55, -.35], [.55, -.35], [0, .1]].map(([x, z], i) => new THREE.Vector3(p.x + x * .72, .48 + (i > 5 ? .3 : 0), p.z + z * .72));
  basket.visible = false;
  scene.add(basket);
  return basket;
}

export function createApple(color = PALETTE.red) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.34, 28, 20), mat(color, { roughness: .38 }));
  body.scale.set(1, .9, 1); body.castShadow = true; g.add(body);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 }));
  shine.position.set(-.13, .14, .22); g.add(shine);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .18, 6), mat(0x7a4e2a));
  stem.position.y = .35; stem.rotation.z = .2; g.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), mat(PALETTE.leaf));
  leaf.scale.set(1, .3, .55); leaf.position.set(.12, .4, 0); leaf.rotation.z = -.5; g.add(leaf);
  // 隐形的大点击区域（方便小手点击）
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.62, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(hit);
  g.userData = { body, hit, color };
  hit.userData.owner = g;
  return g;
}

// 小鸡“豆豆”
export function createChick(scene) {
  const chick = new THREE.Group();
  const yellow = mat(PALETTE.chick, { roughness: .9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), yellow);
  body.scale.set(1, .95, .95); body.position.y = 1; body.castShadow = true; chick.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(.7, 30, 20), mat(0xfff0b8, { roughness: .9 }));
  belly.scale.set(1, .9, .45); belly.position.set(0, .8, .62); chick.add(belly);
  const tuft = new THREE.Group();
  for (let i = -1; i <= 1; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), yellow); t.scale.set(.6, 1.3, .6); t.position.set(i * .12, 2.0 + (i === 0 ? .08 : 0), 0); t.rotation.z = -i * .5; tuft.add(t); }
  chick.add(tuft);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    const e = new THREE.Mesh(new THREE.SphereGeometry(.14, 20, 16), mat(0x222222, { roughness: .2 }));
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(.04, .05, .11); eye.add(e, hl);
    eye.position.set(s * .36, 1.3, .82); chick.add(eye); eyes.push(eye);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), mat(PALETTE.cheek, { transparent: true, opacity: .7 }));
    cheek.scale.set(1, .6, .4); cheek.position.set(s * .58, 1.08, .74); chick.add(cheek);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(.4, 20, 16), yellow);
    wing.scale.set(.35, .75, .6); wing.position.set(s * .95, .95, 0); wing.rotation.z = s * .3; wing.castShadow = true; chick.add(wing);
    wing.userData.side = s; (chick.userData.wings ||= []).push(wing);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), mat(PALETTE.beak));
    foot.scale.set(1, .4, 1.4); foot.position.set(s * .35, .07, .3); chick.add(foot);
  }
  const beakTop = new THREE.Mesh(new THREE.ConeGeometry(.17, .32, 16), mat(PALETTE.beak, { roughness: .5 }));
  beakTop.rotation.x = Math.PI / 2; beakTop.scale.set(1, 1, .55); beakTop.position.set(0, 1.12, .98); chick.add(beakTop);
  const beakPivot = new THREE.Group(); beakPivot.position.set(0, 1.05, .9); chick.add(beakPivot);
  const beakBot = new THREE.Mesh(new THREE.ConeGeometry(.14, .26, 16), mat(0xf07f2a, { roughness: .5 }));
  beakBot.rotation.x = Math.PI / 2; beakBot.scale.set(1, 1, .45); beakBot.position.set(0, 0, .1); beakPivot.add(beakBot);
  chick.userData = { ...chick.userData, body, eyes, beakPivot, tuft, mouth: new THREE.Vector3() };
  chick.position.set(4.4, 0, -0.6);
  chick.rotation.y = -0.45;
  scene.add(chick);
  return chick;
}

export function createClouds(scene) {
  const clouds = [];
  const rnd = mulberry(3);
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1 + rnd() * .8, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: .25 }));
      s.position.set(k * 1.3 - 2, rnd() * .6, rnd() * .6); c.add(s);
    }
    c.position.set(-40 + rnd() * 80, 9 + rnd() * 6, -25 - rnd() * 20);
    c.userData.speed = .3 + rnd() * .4;
    scene.add(c); clouds.push(c);
  }
  return clouds;
}

const FLOWER_COLORS = [0xff8fab, 0xffd166, 0xc9a7ff, 0x8fd3ff, 0xff9f6b, 0xffffff, 0xff6b9a];
export function flowerSpot(i) {
  const rnd = mulberry(1000 + i * 17);
  for (let n = 0; n < 50; n++) {
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * 5.6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -0.5 && x > -4 && x < 6) continue;           // 避开托盘/篮子/小鸡
    if (Math.hypot(x + 4.6, z + 1.7) < 1.2) continue;    // 避开树干
    return { x, z, color: FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)], kind: Math.floor(rnd() * 3) };
  }
  return { x: -7, z: -3, color: 0xff8fab, kind: 0 };
}
export function createFlower(spec) {
  const f = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .6, 6), mat(0x4caf50));
  stem.position.y = .3; f.add(stem);
  if (spec.kind === 2) { // 蘑菇
    stem.material = mat(0xfff3e0); stem.scale.set(3, .6, 3); stem.position.y = .18;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff6b6b));
    cap.position.y = .34; f.add(cap);
    for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), mat(0xffffff)); const a = k * 1.6; d.position.set(Math.cos(a) * .18, .5, Math.sin(a) * .18); f.add(d); }
  } else {
    const center = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), mat(0xffc93c));
    center.position.y = .65; f.add(center);
    const n = spec.kind === 0 ? 5 : 8;
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), mat(spec.color));
      const a = k / n * Math.PI * 2; p.scale.set(1, .5, 1); p.position.set(Math.cos(a) * .17, .65, Math.sin(a) * .17); f.add(p);
    }
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), mat(0x66bb6a)); leaf.scale.set(1.4, .3, .6); leaf.position.set(.1, .25, 0); f.add(leaf);
  }
  f.traverse(o => { if (o.isMesh) o.castShadow = true; });
  f.position.set(spec.x, 0, spec.z);
  return f;
}

export function createButterfly(color) {
  const b = new THREE.Group();
  const m = mat(color, { side: THREE.DoubleSide });
  const wl = new THREE.Mesh(new THREE.CircleGeometry(.18, 12), m), wr = wl.clone();
  wl.position.x = -.15; wr.position.x = .15;
  const pl = new THREE.Group(), pr = new THREE.Group(); pl.add(wl); pr.add(wr);
  b.add(pl, pr, new THREE.Mesh(new THREE.CapsuleGeometry(.03, .2, 4, 6), mat(0x333333)));
  b.children[2].rotation.x = Math.PI / 2;
  b.userData = { pl, pr, phase: Math.random() * 10 };
  return b;
}

/* ---------- 工具 ---------- */
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r); shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d); shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 3 });
  geo.rotateX(Math.PI / 2); geo.translate(0, h / 2, 0);
  return geo;
}
