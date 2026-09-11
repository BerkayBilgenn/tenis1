import * as THREE from 'three';
import { COURT, PHYS } from './config.js';
import { aimShot, predictBallPath } from './ball.js';

const BASE_Z = -10.5;          // rakibin varsayılan duruş derinliği

export class Opponent {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -10.4);
    scene.add(this.group);

    const skin  = new THREE.MeshStandardMaterial({ color: 0xc98f61, roughness: 0.78 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xf4f8fd, roughness: 0.88 });
    const trim  = new THREE.MeshStandardMaterial({ color: 0x1d3b66, roughness: 0.85 });
    const short = new THREE.MeshStandardMaterial({ color: 0x14274a, roughness: 0.92 });
    const shoe  = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.7 });
    const sole  = new THREE.MeshStandardMaterial({ color: 0x2a3a52, roughness: 0.85 });

    const add = (geo, mat, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // --- gövde ---
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.92, 0);
    this.group.add(this.torso);

    const chest = add(new THREE.CapsuleGeometry(0.185, 0.34, 8, 16), shirt, 0, 0.24, 0, this.torso);
    chest.scale.set(1.05, 1, 0.82);
    const collar = add(new THREE.TorusGeometry(0.10, 0.022, 8, 18), trim, 0, 0.44, 0, this.torso);
    collar.rotation.x = Math.PI / 2;
    const waist = add(new THREE.CapsuleGeometry(0.165, 0.12, 6, 14), short, 0, -0.02, 0, this.torso);
    waist.scale.set(1.05, 1, 0.85);

    // kafa + şapka
    this.neck = add(new THREE.CylinderGeometry(0.052, 0.06, 0.09, 10), skin, 0, 0.50, 0, this.torso);
    this.head = add(new THREE.SphereGeometry(0.125, 20, 16), skin, 0, 0.615, 0, this.torso);
    this.head.scale.set(0.95, 1.08, 1.0);
    const capTop = add(new THREE.SphereGeometry(0.131, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, 0.618, 0, this.torso);
    capTop.scale.y = 0.78;
    const brim = add(new THREE.CylinderGeometry(0.128, 0.128, 0.016, 18, 1, false, -0.9, 1.8), trim, 0, 0.617, 0.055, this.torso);
    brim.scale.z = 1.5;

    // --- bacaklar (kalça pivotlu) ---
    const makeLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.095, 0.88, 0);
      this.group.add(hip);
      const thigh = add(new THREE.CapsuleGeometry(0.075, 0.26, 6, 12), skin, 0, -0.20, 0, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.40, 0);
      hip.add(knee);
      add(new THREE.CapsuleGeometry(0.062, 0.26, 6, 12), skin, 0, -0.19, 0, knee);
      const foot = add(new THREE.BoxGeometry(0.105, 0.075, 0.235), shoe, 0, -0.375, 0.045, knee);
      add(new THREE.BoxGeometry(0.112, 0.028, 0.245), sole, 0, -0.412, 0.045, knee);
      return { hip, knee, foot };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // --- sol kol ---
    this.armL = new THREE.Group();
    this.armL.position.set(-0.225, 1.30, 0);
    this.group.add(this.armL);
    add(new THREE.CapsuleGeometry(0.052, 0.22, 6, 12), skin, 0, -0.14, 0, this.armL);
    this.elbowL = new THREE.Group();
    this.elbowL.position.set(0, -0.27, 0);
    this.armL.add(this.elbowL);
    add(new THREE.CapsuleGeometry(0.045, 0.20, 6, 12), skin, 0, -0.13, 0, this.elbowL);

    // --- sağ kol + raket ---
    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0.225, 1.30, 0);
    this.group.add(this.armPivot);
    add(new THREE.CapsuleGeometry(0.054, 0.22, 6, 12), skin, 0, -0.14, 0, this.armPivot);
    this.elbowR = new THREE.Group();
    this.elbowR.position.set(0, -0.27, 0);
    this.armPivot.add(this.elbowR);
    add(new THREE.CapsuleGeometry(0.046, 0.20, 6, 12), skin, 0, -0.13, 0, this.elbowR);
    // bileklik
    const band = add(new THREE.TorusGeometry(0.05, 0.016, 6, 14), trim, 0, -0.24, 0, this.elbowR);
    band.rotation.x = Math.PI / 2;

    // raket
    const rk = new THREE.Group();
    rk.position.set(0, -0.34, 0);
    rk.rotation.z = 0.12;
    this.elbowR.add(rk);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x121a26, roughness: 0.28, metalness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x38e8ff, roughness: 0.3, metalness: 0.4, emissive: 0x38e8ff, emissiveIntensity: 0.4,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.013, 10, 34), frameMat);
    rim.scale.set(1, 1.14, 1); rim.position.y = -0.20; rim.rotation.y = Math.PI / 2;
    rim.castShadow = true; rk.add(rim);
    const rimGlow = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.004, 6, 30), accent);
    rimGlow.scale.set(1, 1.14, 1); rimGlow.position.y = -0.20; rimGlow.rotation.y = Math.PI / 2;
    rk.add(rimGlow);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 26),
      new THREE.MeshBasicMaterial({ color: 0xdfe9f7, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    face.scale.set(1, 1.14, 1); face.position.y = -0.20; face.rotation.y = Math.PI / 2;
    rk.add(face);
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.16, 10), frameMat);
    hnd.position.y = -0.02; hnd.castShadow = true; rk.add(hnd);

    this.x = 0;
    this.z = BASE_Z;
    this.vx = 0;
    this.vz = 0;
    this.targetX = 0;
    this.targetZ = BASE_Z;
    this.reactT = 0;
    this.pred = null;
    this.swingT = 0;
    this.bob = 0;
    this.lunge = 0;
    this.seenShot = -1;
    this.decision = null;   // 'good' | 'error' | 'miss' | 'unreachable'
  }

  reset() {
    this.x = 0; this.z = BASE_Z; this.vx = 0; this.vz = 0;
    this.targetX = 0; this.targetZ = BASE_Z;
    this.swingT = 0; this.lunge = 0; this.reactT = 0; this.pred = null;
    this.seenShot = -1; this.decision = null;
    this.group.position.set(0, 0, BASE_Z);
  }

  /** Rakibin vuruş düzlemi — nerede duruyorsa onun biraz önü */
  get hitZ() { return this.z + 0.95; }

  /** Topun rakip tarafındaki yolunu tahmin et: iniş noktası + vuruş düzlemi */
  predict(ball) {
    if (!ball.live || ball.vel.z >= -0.1) return null;
    const r = predictBallPath(ball.pos, ball.vel, ball.spin, this.hitZ);
    return {
      landZ: r.landing ? r.landing.z : BASE_Z,
      landX: r.landing ? r.landing.x : 0,
      crossX: r.cross ? r.cross.x : (r.landing ? r.landing.x : 0),
      crossY: r.cross ? r.cross.y : 1.0,
      t: r.cross ? r.cross.t : 1.0,
    };
  }

  update(dt, ball, diff, time) {
    // yeni atış geldiyse bu topa dair kararı bir kez ver
    if (ball.lastHitBy === 'player' && ball.shotId !== this.seenShot) {
      this.seenShot = ball.shotId;
      this.decision = null;
      this.reactT = 0.30 - diff.accuracy * 0.20;    // insan gibi gecikme
      this.pred = null;
    }

    // --- tahmin + tepki süresi ---
    const incoming = ball.live && ball.vel.z < -0.1 && ball.lastHitBy === 'player';
    if (incoming) {
      if (this.reactT > 0) {
        this.reactT -= dt;                       // henüz tepki vermedi
      } else {
        this.pred = this.predict(ball) || this.pred;
        if (this.pred) {
          this.targetX = THREE.MathUtils.clamp(this.pred.crossX, -COURT.halfDoubles - 1.4, COURT.halfDoubles + 1.4);
          // kısa toplar için öne çık, derin toplarda geride kal
          this.targetZ = THREE.MathUtils.clamp(this.pred.landZ + 2.0, -11.4, -4.2);
        }
      }
    } else {
      // toparlanma: merkeze ve dip çizgiye dön
      this.targetX *= 1 - Math.min(1, dt * 1.4);
      this.targetZ += (BASE_Z - this.targetZ) * Math.min(1, dt * 1.2);
      this.pred = null;
    }

    // --- ivmeli hareket (sabit hız yerine) ---
    const accel = diff.speed * 3.4;
    const moveAxis = (cur, vel, target, maxV, maxA) => {
      const d = target - cur;
      // varışta yumuşama: kalan mesafeye göre istenen hız
      const want = THREE.MathUtils.clamp(d * 4.2, -maxV, maxV);
      const dv = THREE.MathUtils.clamp(want - vel, -maxA * dt, maxA * dt);
      const nv = vel + dv;
      return [cur + nv * dt, nv];
    };
    const before = this.x;
    [this.x, this.vx] = moveAxis(this.x, this.vx, this.targetX, diff.speed, accel);
    [this.z, this.vz] = moveAxis(this.z, this.vz, this.targetZ, diff.speed * 0.75, accel * 0.8);
    this.x = THREE.MathUtils.clamp(this.x, -COURT.halfDoubles - 1.8, COURT.halfDoubles + 1.8);
    this.z = THREE.MathUtils.clamp(this.z, -12.4, -3.6);
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    const step = this.x - before;

    // --- koşu / hazır duruş animasyonu ---
    const speed = Math.hypot(this.vx, this.vz);
    this.bob += dt * (2.6 + speed * 1.9);

    const run = Math.min(1, speed / 4.2);
    const swing = Math.sin(this.bob * 2.1);
    const amp = 0.10 + run * 0.62;

    this.legL.hip.rotation.x = swing * amp;
    this.legR.hip.rotation.x = -swing * amp;
    this.legL.knee.rotation.x = Math.max(0, -swing) * amp * 1.5 + 0.10;
    this.legR.knee.rotation.x = Math.max(0, swing) * amp * 1.5 + 0.10;

    // yana kaçış adımı: gövde hareket yönüne yatar
    const lean = THREE.MathUtils.clamp(this.vx * 0.09, -0.35, 0.35);
    this.group.rotation.z = -lean * 0.55;
    this.group.rotation.y = THREE.MathUtils.clamp(-this.vx * 0.10, -0.5, 0.5);
    this.group.position.y = Math.abs(Math.sin(this.bob * 2.1)) * (0.012 + run * 0.045);
    this.torso.rotation.x = 0.06 + run * 0.16;
    this.torso.rotation.y = -this.group.rotation.y * 0.5;

    // sol kol koşuda karşı ritimde
    this.armL.rotation.x = -swing * amp * 0.8 - 0.15;
    this.armL.rotation.z = 0.30 + run * 0.15;
    this.elbowL.rotation.x = -0.5 - run * 0.5;

    // --- savurma ---
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const s2 = 1 - this.swingT;                        // 0 -> 1
      const e = s2 < 0.35 ? (s2 / 0.35) : 1;             // geri salınım
      const f = s2 < 0.35 ? 0 : (s2 - 0.35) / 0.65;      // ileri salınım
      this.armPivot.rotation.x = -0.2 - e * 1.9 + f * 3.1;
      this.armPivot.rotation.z = 0.35 - e * 1.1 + f * 1.5;
      this.elbowR.rotation.x = -0.9 + f * 0.7;
      this.torso.rotation.y += (-0.6 * e + 0.9 * f);
    } else {
      const k = Math.min(1, dt * 7);
      this.armPivot.rotation.x += (0.35 + Math.sin(time * 3) * 0.04 - this.armPivot.rotation.x) * k;
      this.armPivot.rotation.z += (0.42 - this.armPivot.rotation.z) * k;
      this.elbowR.rotation.x += (-1.0 - this.elbowR.rotation.x) * k;
    }
  }

  /** Vurma sırası mı? */
  canHit(ball) {
    const hz = this.hitZ;
    return ball.live && ball.lastHitBy === 'player' &&
           ball.vel.z < 0 && ball.pos.z <= hz && ball.pos.z > hz - 2.8 &&
           ball.bounces >= 1 && ball.pos.y < 2.9;
  }

  /**
   * Topa vur. Karar (yetişme / hata / temiz vuruş) top başına bir kez verilir.
   * playerX: oyuncunun raket konumu — açı seçimi buna göre yapılır.
   */
  hit(ball, diff, playerX = 0) {
    if (this.decision === null) {
      const reach = Math.hypot(ball.pos.x - this.x, (ball.pos.z - this.hitZ) * 0.6);
      if (reach > diff.reach * 0.46) {
        this.decision = 'unreachable';
      } else {
        const p = (1 - diff.accuracy) * (0.55 + reach * 0.35);
        const r = Math.random();
        this.decision = r < p * 0.5 ? 'miss' : r < p ? 'error' : 'good';
      }
    }
    if (this.decision === 'unreachable') return null;
    if (this.decision === 'miss') { this.swingT = 1; this.decision = 'done'; return null; }
    if (this.decision !== 'error' && this.decision !== 'good') return null;

    const wild = this.decision === 'error';
    this.decision = 'done';
    this.swingT = 1;

    const from = new THREE.Vector3(
      this.x + Math.sign(ball.pos.x - this.x) * 0.32,
      0.95 + Math.random() * 0.25,
      this.hitZ + 0.15
    );

    // --- atış seçimi ---
    const wide = COURT.halfSingles * 0.80;
    const away = -Math.sign(playerX || (Math.random() - 0.5));   // oyuncunun tersi
    const roll = Math.random();
    let tx, tz, T, kind;

    if (roll < 0.42) {            // çapraz derin
      kind = 'cross';
      tx = away * (wide * (0.55 + Math.random() * 0.45));
      tz = 7.4 + Math.random() * 3.0;
      T = diff.pace * (0.88 + Math.random() * 0.16);
    } else if (roll < 0.64) {     // çizgi boyu derin
      kind = 'line';
      tx = Math.sign(this.x || 1) * (wide * (0.55 + Math.random() * 0.40));
      tz = 7.8 + Math.random() * 2.8;
      T = diff.pace * (0.84 + Math.random() * 0.14);
    } else if (roll < 0.80) {     // ortaya derin (güvenli)
      kind = 'deep';
      tx = (Math.random() * 2 - 1) * wide * 0.35;
      tz = 8.4 + Math.random() * 2.4;
      T = diff.pace * (0.92 + Math.random() * 0.16);
    } else if (roll < 0.92) {     // kısa açı
      kind = 'short';
      tx = away * (wide * (0.70 + Math.random() * 0.30));
      tz = 2.6 + Math.random() * 2.4;
      T = diff.pace * (1.02 + Math.random() * 0.14);
    } else {                      // lob
      kind = 'lob';
      tx = (Math.random() * 2 - 1) * wide * 0.55;
      tz = 9.4 + Math.random() * 2.0;
      T = diff.pace * 1.95;
    }

    if (wild) {
      if (Math.random() < 0.5) tz = COURT.halfLength + 0.6 + Math.random() * 1.6;
      else tx = Math.sign(tx || 1) * (COURT.halfSingles + 0.45 + Math.random() * 1.1);
    }

    const topspin = kind === 'lob' ? 26 : kind === 'short' ? -6 : 14 + Math.random() * 14;
    const spin = new THREE.Vector3(topspin, (Math.random() * 2 - 1) * 6, 0);
    const vel = aimShot(from, new THREE.Vector3(tx, PHYS.radius, tz), T, spin,
                        kind === 'lob' ? 0.9 : 0.14);

    ball.launch(from, vel, spin, 'opponent');
    return { from, vel, kind };
  }

  /** Servis at (rakip servisi) */
  serve(ball, diff, toDeuceSide) {
    this.swingT = 1;
    const sx = toDeuceSide ? -1.4 : 1.4;
    this.x = sx * 0.8;
    this.z = -11.4;
    this.targetX = this.x; this.targetZ = BASE_Z;
    this.group.position.set(this.x, 0, this.z);
    const from = new THREE.Vector3(this.x, 1.92, -11.3);
    const tx = (toDeuceSide ? 1 : -1) * (0.8 + Math.random() * 2.4);
    const tz = 2.6 + Math.random() * 3.2;
    const T = diff.pace * 0.80;
    const spin = new THREE.Vector3(16, 0, 0);
    const vel = aimShot(from, new THREE.Vector3(tx, PHYS.radius, tz), T, spin);
    ball.launch(from, vel, spin, 'opponent');
  }
}

export { BASE_Z };
