import * as THREE from 'three';
import { COURT, PHYS, PLAYER, DIFFICULTY, COLORS } from './config.js';
import { buildCourt } from './court.js';
import { Environment, LOOKS } from './env.js';
import { PostFX } from './postfx.js';
import { Ball, solveShot, aimShot, predictBallPath } from './ball.js';
import { Racket } from './racket.js';
import { Opponent } from './opponent.js';
import { HandInput } from './hands.js';
import { Hud } from './hud.js';
import { Effects } from './effects.js';
import * as SFX from './audio.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// Fizik sabit adımla ilerler: nişan çözücüsüyle birebir aynı yolu üretsin diye.
const FIXED = 1 / 180;
let physAcc = 0;
function stepBall(dt) {
  physAcc = Math.min(physAcc + dt, 0.25);
  const events = [];
  while (physAcc >= FIXED) {
    physAcc -= FIXED;
    const ev = ball.step(FIXED);
    if (ev.length) events.push(...ev);
    if (!ball.live) break;
  }
  return events;
}

// ---------------------------------------------------------------- sahne
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
});
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
const camBase = new THREE.Vector3(...PLAYER.camPos);
const lookBase = new THREE.Vector3(...PLAYER.camLook);
camera.position.copy(camBase);
camera.lookAt(lookBase);

const env = new Environment(scene, renderer);
const world = buildCourt(scene);
const postfx = new PostFX(renderer, scene, camera);

function applyLook(mode) {
  const L = env.apply(mode);
  postfx.setBloom(L.bloom);
  for (const f of world.floods) {
    f.lampMat.emissiveIntensity = L.lampsOn ? 5.5 : 0;
    f.halo.material.opacity = L.lampsOn ? 0.42 : 0;
  }
  world.crowd.setEmissive(L.crowdEmissive);
  return L;
}
applyLook('day');
const ball = new Ball(scene);
const racket = new Racket(scene);
const opponent = new Opponent(scene);
const fx = new Effects(scene);
const hud = new Hud();

// servis hedef kutusu göstergesi
const targetBox = new THREE.Mesh(
  new THREE.PlaneGeometry(COURT.halfSingles, COURT.serviceLine),
  new THREE.MeshBasicMaterial({ color: 0xd8ff3e, transparent: true, opacity: 0, depthWrite: false })
);
targetBox.rotation.x = -Math.PI / 2;
targetBox.position.y = 0.02;
scene.add(targetBox);

// --- oyuncuya yardımcı göstergeler ---
const guideLand = new THREE.Mesh(
  new THREE.RingGeometry(0.26, 0.36, 32),
  new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0, depthWrite: false })
);
guideLand.rotation.x = -Math.PI / 2;
guideLand.position.y = 0.025;
scene.add(guideLand);

const guideHit = new THREE.Mesh(
  new THREE.RingGeometry(0.125, 0.168, 30),
  new THREE.MeshBasicMaterial({
    color: 0xd8ff3e, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, depthTest: false,      // raketin arkasında kalmasın
  })
);
guideHit.renderOrder = 10;
scene.add(guideHit);

// hedefin tam ortasındaki nokta
const guideDot = new THREE.Mesh(
  new THREE.CircleGeometry(0.026, 14),
  new THREE.MeshBasicMaterial({
    color: 0xd8ff3e, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  })
);
guideDot.renderOrder = 11;
scene.add(guideDot);
let guidesOn = true;
let guideTick = 0;

const HFOV = 96 * Math.PI / 180;   // yatay görüş açısı sabit tutulur
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vfov = 2 * Math.atan(Math.tan(HFOV / 2) / camera.aspect) * 180 / Math.PI;
  camera.fov = clamp(vfov, 56, 82);
  camera.updateProjectionMatrix();
  postfx.resize(pixelRatio);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- girdi
const hands = new HandInput({
  video: document.getElementById('cam'),
  overlay: document.getElementById('cam-overlay'),
  camBox: document.getElementById('cam-box'),
});

// ---------------------------------------------------------------- durum
const G = {
  state: 'menu',          // menu | ready | toss | rally | point
  diff: 1,
  timer: 0,
  rally: 0,
  serverIsPlayer: true,
  hitCooldown: 0,
  shake: 0,
  tossHeldFor: 0,
  inputLock: 0,
  slowmo: 0,
  idle: 0,
};

// Oyuncu kortta öne/geri hareket eder: kısa toplarda koşup öne çıkar,
// lobda geri çekilir. El yalnız raketi yönetir, ayaklar otomatiktir.
const player = { z: PLAYER.racketZ, vz: 0 };
const diff = () => DIFFICULTY[G.diff];

// ---------------------------------------------------------------- yardımcı
/** Raket küresi ile topun bu karedeki yolu kesişiyor mu? */
function racketHitsBall(radius) {
  const c = racket.hitCenter;
  const a = ball.prev, b = ball.pos;
  const ab = new THREE.Vector3().subVectors(b, a);
  const len2 = ab.lengthSq();
  let t = 0;
  if (len2 > 1e-9) t = clamp(new THREE.Vector3().subVectors(c, a).dot(ab) / len2, 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  const d = closest.distanceTo(c);
  return d < radius ? { point: closest, dist: d } : null;
}

function shake(amount) { G.shake = Math.min(1, G.shake + amount); }

// ---------------------------------------------------------------- vuruşlar
function playerShot(hitInfo, isServe, stretched = false) {
  const h = hands.hand;
  // Güç savuruşun ZİRVE hızından gelir: temas yavaşlama anında olsa bile
  // savurduğun kadar sert vurursun.
  const rPeak = Math.max(racket.peak, racket.vel.length());
  const swing = clamp((rPeak - 1.3) / 8.0, 0, 1);
  const handSwing = clamp((Math.max(h.swingPeak || 0, h.speed) - 0.9) / 4.0, 0, 1);
  let p = clamp(Math.max(swing, handSwing * 0.95), 0, 1);

  const smash = h.fist;
  if (smash) p = clamp(p * 1.3 + 0.28, 0, 1);
  if (isServe) p = clamp(p * 0.9 + 0.35, 0, 1);

  // yatay nişan: el eğimi + savurma yönü + raketin sahadaki yeri
  const swingX = h.swingArmed ? (h.swingDirX || h.vx) : h.vx;
  let aim = clamp(h.tilt * 0.85 + swingX * 0.16 + racket.vel.x * 0.030
                  + (racket.pos.x / PLAYER.reachX) * 0.30, -1, 1);

  // merkezden kaçık vuruş -> sapma
  const off = hitInfo ? clamp(hitInfo.dist / PLAYER.hitRadius, 0, 2) : 0;
  const errK = (smash ? 0.34 : 0.16) + off * 0.22 + (stretched ? 0.26 : 0);
  if (stretched) p *= 0.72;
  aim = clamp(aim, -1, 1) + (Math.random() * 2 - 1) * errK * 0.45;

  // dikey savurma -> topspin / slice (savuruşun yönünü kullan)
  const vy = h.swingArmed ? (h.swingDirY || h.vy) : h.vy;
  const topspin = clamp(-vy * 1.15, -1, 1);

  const from = ball.pos.clone();
  let target, T;

  if (isServe) {
    const deuce = (hud.pts[0] + hud.pts[1]) % 2 === 0;
    const bx = deuce ? -1 : 1;                     // çapraz servis kutusu
    target = new THREE.Vector3(
      clamp(bx * (0.9 + Math.random() * 2.1) + aim * 0.8, -COURT.halfSingles + 0.35, COURT.halfSingles - 0.35),
      PHYS.radius,
      -(2.1 + Math.random() * 3.5)
    );
    T = lerp(1.02, 0.70, p);
  } else {
    const depth = 5.0 + p * 5.0 + topspin * 1.1 + (smash ? 1.0 : 0);
    target = new THREE.Vector3(
      clamp(aim * (COURT.halfSingles - 0.45), -COURT.halfSingles - 0.28, COURT.halfSingles + 0.28),
      PHYS.radius,
      -clamp(depth, 3.4, 11.6)
    );
    T = lerp(1.30, 0.74, p) * (smash ? 0.86 : 1);
  }

  const spinMag = 5 + topspin * 26 + (smash ? -4 : 0);
  const spin = new THREE.Vector3(-spinMag, aim * -7, 0);

  // çok cılız savurma fileye takılsın; gerisi hedefe nişan alsın
  const vel = (p < 0.08 && !isServe)
    ? solveShot(from, target, lerp(1.5, 1.2, p))              // cılız savurma fileye takılır
    : aimShot(from, target, T, spin, isServe ? 0.22 : 0.14);

  ball.launch(from, vel, spin, 'player');

  racket.popFlash();
  postfx.impact(0.25 + p * 0.4);
  fx.burst(from, smash ? 0xff9f43 : 0xd8ff3e, 5 + Math.round(p * 6), 1.6 + p * 2.2);
  shake(0.22 + p * 0.5);
  hud.flashSwing();
  hud.setSpeed(vel.length() * 3.6);
  G.hitCooldown = 0.30;
  guideHit.material.opacity = 0;
  guideDot.material.opacity = 0;

  if (isServe) {
    SFX.sfxServe();
  } else {
    SFX.sfxHit(p, smash);
    // dokunuş kalitesi geri bildirimi
    if (smash) hud.feel('SMAÇ!', 'smash');
    else if (stretched) hud.feel('ZOR TOPU ÇEVİRDİN', 'far');
    else if (off < 0.42) hud.feel('MÜKEMMEL', 'perfect');
    else if (off < 0.78) hud.feel('İYİ', 'good');
    else hud.feel('KENARDAN', 'far');

    if (smash && p > 0.55) G.slowmo = 0.42;    // sinematik ağır çekim
    G.rally++;
    hud.setRally(G.rally);
  }
}

function opponentShot() {
  const r = opponent.hit(ball, diff(), racket.pos.x);
  if (r) {
    fx.ring(r.from, 0x38e8ff, 0.9);
    hud.setSpeed(r.vel.length() * 3.6);
    SFX.sfxHit(r.kind === 'lob' ? 0.3 : 0.55);
    if (r.kind === 'lob') hud.say('LOB!', '', 0.9);
    else if (r.kind === 'short') hud.say('KISA TOP — KOŞ!', '', 0.9);
    G.rally++;
    hud.setRally(G.rally);
  }
  return r;
}

// ---------------------------------------------------------------- sayı akışı
function endPoint(winner, text) {
  if (G.state === 'point') return;
  G.state = 'point';
  G.timer = 1.8;
  ball.live = false;

  const gameWon = hud.point(winner);
  SFX.sfxPoint(winner === 0);
  if (gameWon) SFX.sfxGame(winner === 0);
  world.crowd.cheer();
  syncScoreboard();
  postfx.impact(winner === 0 ? 0.5 : 0.25);
  hud.say(gameWon ? (winner === 0 ? 'OYUN SENİN! 🎾' : 'OYUN RAKİBİN') : text,
          winner === 0 ? 'good' : 'bad', 1.7);
  if (winner === 0) fx.burst(ball.pos.clone(), 0xd8ff3e, 14, 3.2);
  shake(winner === 0 ? 0.5 : 0.3);
  G.rally = 0;
  hud.setRally(0);
}

function syncScoreboard() {
  world.scoreboard.draw({
    you: hud.label(0), opp: hud.label(1),
    youGames: hud.games[0], oppGames: hud.games[1],
  });
}

function nextServe() {
  G.idle = 0;
  player.z = PLAYER.racketZ; player.vz = 0; racket.stationZ = player.z;
  G.serverIsPlayer = (hud.games[0] + hud.games[1]) % 2 === 0;
  opponent.reset();
  if (G.serverIsPlayer) {
    G.state = 'ready';
    hud.say('🤏 Parmaklarını birleştir → servis', '', 2.4);
  } else {
    G.state = 'oppserve';
    G.timer = 1.1;
    hud.say('Rakip servis atıyor…', '', 1.2);
  }
}

function tossBall() {
  const c = racket.hitCenter;
  const from = new THREE.Vector3(c.x + 0.30, c.y + 0.10, c.z - 0.10);
  ball.launch(from, new THREE.Vector3(0.05, 5.4, -0.10), new THREE.Vector3(), null);
  G.state = 'toss';
  G.tossHeldFor = 0;
  G.hitCooldown = 0.22;      // top yükselirken savurma penceresi
  SFX.sfxBounce();
  hud.say('Savur! 💥', '', 0.9);
}

function resetMatch() {
  hud.reset();
  syncScoreboard();
  hud.best = 0;
  opponent.reset();
  G.rally = 0;
  hud.setRally(0);
  nextServe();
}

// ---------------------------------------------------------------- olaylar
function handleBallEvents(events) {
  for (const e of events) {
    if (e.t === 'net') {
      fx.burst(ball.pos.clone(), 0xffffff, 8, 1.4);
      SFX.sfxNet();
      endPoint(ball.lastHitBy === 'player' ? 1 : 0,
               ball.lastHitBy === 'player' ? 'FİLEYE TAKILDI' : 'RAKİP FİLEYE TAKTI');
      return;
    }

    if (e.t === 'bounce') {
      fx.mark(e.x, e.z);
      const power = clamp(ball.vel.length() / 16, 0.3, 1.4);
      fx.puff(e.x, e.z, power);
      SFX.sfxBounce();
      ball.squash(power);

      const hitter = ball.lastHitBy;
      const expected = hitter === 'player' ? -1 : 1;

      if (ball.bounces === 1) {
        if (!e.inBounds || e.side !== expected) {
          endPoint(hitter === 'player' ? 1 : 0, hitter === 'player' ? 'AUT!' : 'RAKİP AUT ATTI');
          return;
        }
      } else if (ball.bounces >= 2) {
        if (e.side === 1) endPoint(1, 'KAÇIRDIN');
        else endPoint(0, 'SAYI SENİN!');
        return;
      }
    }

    if (e.t === 'behind') {
      if (ball.bounces >= 1) {
        // geçerli sekmeden sonra sahayı terk etti -> karşı taraf yetişemedi
        endPoint(ball.lastHitBy === 'player' ? 0 : 1,
                 ball.lastHitBy === 'player' ? 'SAYI SENİN!' : 'KAÇIRDIN');
      } else {
        endPoint(ball.lastHitBy === 'player' ? 1 : 0,
                 ball.lastHitBy === 'player' ? 'AUT!' : 'RAKİP AUT ATTI');
      }
      return;
    }
  }
}

// ------------------------------------------------------- oyuncu konumu
function updateStation(dt) {
  let target = PLAYER.racketZ;

  if (ball.live && ball.lastHitBy === 'opponent' && ball.vel.z > 0) {
    const pr = predictBallPath(ball.pos, ball.vel, ball.spin, player.z);
    if (pr.landing) target = clamp(pr.landing.z + 2.6, 4.2, 12.6);
    else if (ball.bounces >= 1) target = clamp(ball.pos.z + 1.4, 4.2, 12.6);
  }

  // koşu: ivmeli, sınırlı hız
  const maxV = 6.4, maxA = 26;
  const want = clamp((target - player.z) * 4.0, -maxV, maxV);
  player.vz += clamp(want - player.vz, -maxA * dt, maxA * dt);
  player.z += player.vz * dt;
  player.z = clamp(player.z, 3.8, 13.0);
  racket.stationZ = player.z;
}

// ---------------------------------------------------------------- rehberler
let guideCross = null;
function updateGuides(time) {
  const active = guidesOn && ball.live && ball.lastHitBy === 'opponent' && ball.vel.z > 0;

  if (active && (guideTick++ % 3 === 0)) {
    const pr = predictBallPath(ball.pos, ball.vel, ball.spin, player.z);
    if (pr.landing && ball.bounces === 0) {
      guideLand.position.set(pr.landing.x, 0.025, pr.landing.z);
      guideLand.visible = true;
    } else {
      guideLand.visible = false;
    }
    guideCross = pr.cross;
  }

  if (!active) {
    guideLand.visible = false;
    guideCross = null;
  }

  // yerdeki iniş halkası
  const pulse = 1 + Math.sin(time * 9) * 0.10;
  if (guideLand.visible) {
    guideLand.scale.setScalar(pulse);
    guideLand.material.opacity = Math.min(0.55, guideLand.material.opacity + 0.10);
  } else {
    guideLand.material.opacity = Math.max(0, guideLand.material.opacity - 0.06);
    if (guideLand.material.opacity <= 0.01) guideLand.visible = false;
  }

  // raket düzlemindeki hedef halkası
  if (guideCross) {
    guideHit.position.set(guideCross.x, Math.max(0.12, guideCross.y), player.z);
    guideDot.position.copy(guideHit.position);
    guideHit.visible = guideDot.visible = true;
    guideHit.scale.setScalar(pulse);
    // yaklaştıkça belirginleşir
    const near = clamp(1 - (guideCross.t || 0) / 0.9, 0.15, 1);
    guideHit.material.opacity = 0.28 + near * 0.5;
    guideDot.material.opacity = guideHit.material.opacity * 0.8;
  } else {
    guideHit.material.opacity = Math.max(0, guideHit.material.opacity - 0.08);
    guideDot.material.opacity = guideHit.material.opacity;
    if (guideHit.material.opacity <= 0.01) guideHit.visible = guideDot.visible = false;
  }
}

// ---------------------------------------------------------------- döngü
let last = performance.now();

// Uyarlanabilir çözünürlük: kare süresi uzarsa piksel oranını düşür.
let frameAvg = 16;
let qualityCooldown = 0;
function adaptQuality(dtMs) {
  frameAvg += (dtMs - frameAvg) * 0.05;
  if (qualityCooldown > 0) { qualityCooldown -= dtMs / 1000; return; }
  const maxPR = Math.min(devicePixelRatio, 2);
  if (frameAvg > 26 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
  } else if (frameAvg < 13 && pixelRatio < maxPR) {
    pixelRatio = Math.min(maxPR, pixelRatio + 0.25);
  } else return;
  renderer.setPixelRatio(pixelRatio);
  postfx.resize(pixelRatio);
  qualityCooldown = 1.5;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = now - last;
  const dt = Math.min(0.05, dtMs / 1000);
  last = now;
  adaptQuality(Math.min(60, dtMs));
  tick(dt, now);
}

function tick(dtReal, now) {
  const time = now / 1000;

  // el takibi her zaman gerçek zamanda okunur
  hands.update(dtReal, now);
  const h = hands.hand;

  // ağır çekim yalnız oyunu yavaşlatır
  let dt = dtReal;
  if (G.slowmo > 0) {
    G.slowmo = Math.max(0, G.slowmo - dtReal);
    dt = dtReal * 0.42;
  }

  racket.update(h, dt);
  hud.update(dtReal, h);
  fx.update(dt);
  world.crowd.update(dtReal, time);
  postfx.update(dtReal, time);
  if (G.hitCooldown > 0) G.hitCooldown -= dt;
  if (G.inputLock > 0) G.inputLock -= dtReal;

  if (G.state !== 'menu') {
    updateStation(dt);
    step(dt, time);
    updateGuides(time);

    // el kaybolduysa uyar (ışık/çerçeve sorunu)
    if (hands.mode === 'camera') {
      G.handLost = h.present ? 0 : (G.handLost || 0) + dtReal;
      if (G.handLost > 1.5 && (G.handLostSaid || 0) < performance.now() - 4000) {
        G.handLostSaid = performance.now();
        hud.say('✋ Elini kameraya göster', '', 1.6);
      }
    }
  }

  // --- kamera ---
  const shakeAmt = G.shake;
  const camZ = player.z + (camBase.z - PLAYER.racketZ);
  camera.position.set(
    camBase.x + racket.pos.x * 0.28 + (Math.random() - 0.5) * shakeAmt * 0.09,
    camBase.y + (0.5 - h.y) * 0.10 + (Math.random() - 0.5) * shakeAmt * 0.09,
    camZ
  );
  const look = lookBase.clone();
  if (ball.live) look.lerp(new THREE.Vector3(ball.pos.x, Math.max(0.4, ball.pos.y), ball.pos.z), 0.18);
  camera.lookAt(look);
  ball.syncTrail(camera.position);
  G.shake = Math.max(0, G.shake - dt * 3.2);

  postfx.render();
}

function step(dt, time) {
  const h = hands.hand;

  // ---- servis bekleniyor ----
  if (G.state === 'ready') {
    const c = racket.hitCenter;
    ball.park(new THREE.Vector3(c.x + 0.30, c.y - 0.04, c.z - 0.05));
    targetBox.material.opacity = 0.07 + Math.sin(time * 3) * 0.035;
    const deuce = (hud.pts[0] + hud.pts[1]) % 2 === 0;
    targetBox.position.x = (deuce ? -1 : 1) * COURT.halfSingles / 2;
    targetBox.position.z = -COURT.serviceLine / 2;

    G.idle += dt;
    // pinch, boşluk, hızlı bir savurma ya da uzun bekleme -> servis
    const swungToServe = racket.peak > 3.4 && G.idle > 0.6;
    if (G.inputLock <= 0 && (h.pinchEdge || G.serveKey || swungToServe || G.idle > 7)) {
      G.serveKey = false;
      if (G.idle > 7) hud.say('Otomatik servis', '', 1.0);
      tossBall();
    }
    return;
  }
  targetBox.material.opacity = Math.max(0, targetBox.material.opacity - dt * 0.4);

  // ---- rakip servisi ----
  if (G.state === 'oppserve') {
    G.timer -= dt;
    if (G.timer <= 0) {
      opponent.serve(ball, diff(), (hud.pts[0] + hud.pts[1]) % 2 === 0);
      SFX.sfxServe();
      G.state = 'rally';
    }
    return;
  }

  // ---- sayı arası ----
  if (G.state === 'point') {
    G.timer -= dt;
    opponent.update(dt, ball, diff(), time);
    if (G.timer <= 0) nextServe();
    return;
  }

  // ---- servis atışı havada ----
  if (G.state === 'toss') {
    stepBall(dt);
    G.tossHeldFor += dt;

    // Servis asla düşmez: savurursan güçlü, savurmazsan otomatik iyi bir servis.
    const ready = G.hitCooldown <= 0;
    const near = ready ? racketHitsBall(PLAYER.hitRadius + 0.45) : null;
    const swinging = racket.peak > 1.6 || h.speed > 1.3 || h.swingArmed;
    const dropped = ball.vel.y < 0 && ball.pos.y <= racket.hitCenter.y + 0.30;
    const tooLong = G.tossHeldFor > 1.9;

    if (ready && ((near && swinging) || dropped || tooLong)) {
      G.state = 'rally';
      playerShot(near, true);
      hud.say(swinging ? 'SERT SERVİS!' : 'SERVİS!', 'good', 0.9);
    }
    return;
  }

  // ---- ralli ----
  if (G.state === 'rally') {
    opponent.update(dt, ball, diff(), time);

    const events = stepBall(dt);
    if (events.length) { handleBallEvents(events); if (G.state !== 'rally') return; }

    // oyuncunun vuruşu — savururken pencere genişler, uzanarak da çevirebilir
    if (ball.live && ball.lastHitBy === 'opponent' && ball.vel.z > 0 && G.hitCooldown <= 0) {
      const armed = h.swingArmed || racket.peak > 3.0;
      const swing = Math.max(racket.peak / 4, (h.swingPeak || h.speed) / 3);
      const base = PLAYER.hitRadius + (armed ? Math.min(0.26, swing * 0.15) : 0);
      let hit = racketHitsBall(base);
      let stretched = false;
      if (!hit && armed) {                              // uzanma yardımı
        hit = racketHitsBall(base + 0.36);
        stretched = !!hit;
      }
      if (hit) playerShot(hit, false, stretched);
    }

    // rakibin vuruşu
    if (opponent.canHit(ball)) {
      if (!opponentShot()) {
        // yetişemedi -> ikinci sekmeyi bekle, olay akışı sayıyı verir
      }
    }
  }
}

// ---------------------------------------------------------------- menü
const startScreen = document.getElementById('start-screen');
const loading = document.getElementById('loading');
const status = document.getElementById('start-status');

document.querySelectorAll('.difficulty button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.difficulty button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    G.diff = +b.dataset.diff;
  });
});

function beginGame() {
  startScreen.classList.add('gone');
  loading.classList.remove('show');
  hands.suppress();
  SFX.initAudio();        // ses bağlamı kullanıcı hareketiyle açılır
  G.inputLock = 0.8;      // menü tıklaması servisi tetiklemesin
  resetMatch();
}

const loadingText = document.querySelector('#loading span');
const btnCamera = document.getElementById('btn-camera');
const warmEl = document.getElementById('warm');

// Model indirmesi ilk seferde ~20 sn sürebiliyor: sayfa açılır açılmaz başlat.
warmEl.className = 'warm loading';
warmEl.textContent = 'El takibi modeli indiriliyor…';
hands.warmup((err) => {
  if (err) {
    warmEl.className = 'warm bad';
    warmEl.textContent = 'El takibi modeli inmedi — ağ engelli olabilir. Fareyle oynayabilirsin.';
  } else {
    warmEl.className = 'warm ok';
    warmEl.textContent = 'El takibi hazır ✓';
  }
});

async function tryCamera() {
  status.textContent = '';
  status.classList.remove('ok');
  loading.classList.add('show');
  loadingText.textContent = 'Hazırlanıyor…';
  btnCamera.disabled = true;
  try {
    await hands.startCamera((msg) => { loadingText.textContent = msg; });
    beginGame();
  } catch (err) {
    loading.classList.remove('show');
    console.error('[el takibi]', err, err && err.detail);
    const extra = err && err.detail ? ` (${err.detail.name || err.detail.message || err.detail})` : '';
    status.innerHTML =
      `${(err && err.message) || 'El takibi başlatılamadı.'}${extra}` +
      `<br><span class="hintline">Yine olmazsa <b>Fareyle Oyna</b> ile aynı oyunu oynayabilirsin.</span>`;
    btnCamera.textContent = '🔄 Kamerayı Tekrar Dene';
  } finally {
    btnCamera.disabled = false;
  }
}
btnCamera.addEventListener('click', tryCamera);

document.getElementById('btn-mouse').addEventListener('click', () => {
  hands.startMouse();
  beginGame();
});

addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (G.state === 'ready') G.serveKey = true;
  }
  if (e.key === 'm' || e.key === 'M') { hands.startMouse(); if (G.state === 'menu') beginGame(); }
  if (e.key === 'r' || e.key === 'R') { if (G.state !== 'menu') resetMatch(); }
  if (e.key === 'n' || e.key === 'N') {
    const mode = env.mode === 'day' ? 'night' : 'day';
    applyLook(mode);
    hud.say(mode === 'night' ? '🌙 Gece maçı' : '🌇 Gün batımı', '', 1.2);
  }
  if (e.key === 'g' || e.key === 'G') {
    guidesOn = !guidesOn;
    hud.say(guidesOn ? 'Yardım göstergeleri açık' : 'Yardım göstergeleri kapalı', '', 1.1);
  }
  if (e.key === 's' || e.key === 'S') {
    hud.say(SFX.toggleMute() ? 'Ses kapalı' : 'Ses açık', '', 1.1);
  }
  if (['1', '2', '3'].includes(e.key)) {
    G.diff = +e.key - 1;
    document.querySelectorAll('.difficulty button').forEach((x, i) => x.classList.toggle('active', i === G.diff));
    hud.say(`Zorluk: ${diff().name}`, '', 1.1);
  }
});

requestAnimationFrame(frame);

// hata ayıklama kancası (tarayıcı konsolundan erişim)
window.__game = { THREE, scene, camera, renderer, ball, racket, opponent, hud, hands, fx, G, DIFFICULTY, playerShot, endPoint, nextServe, tossBall, tick, SFX, env, postfx, world, applyLook };
