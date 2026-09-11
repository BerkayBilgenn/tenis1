import * as THREE from 'three';
import { PHYS, COURT, COLORS } from './config.js';
import { netHeightAt } from './court.js';

const TRAIL_LEN = 34;

/** Gerçek tenis topu dikişi: a+b=1, c=2√(ab) iken eğri tam küre üzerinde kalır. */
class SeamCurve extends THREE.Curve {
  constructor(r) { super(); this.r = r; this.a = 0.72; this.b = 0.28; }
  getPoint(t, target = new THREE.Vector3()) {
    const u = t * Math.PI * 2, a = this.a, b = this.b;
    const c = 2 * Math.sqrt(a * b);
    return target.set(
      (a * Math.cos(u) + b * Math.cos(3 * u)) * this.r,
      (a * Math.sin(u) - b * Math.sin(3 * u)) * this.r,
      (c * Math.sin(2 * u)) * this.r
    );
  }
}

function fuzzTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#d7f04a'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) {
    const v = 190 + Math.random() * 65;
    x.fillStyle = `rgba(${v},${v * 1.06},${v * 0.42},${0.10 + Math.random() * 0.22})`;
    x.fillRect(Math.random() * s, Math.random() * s, 1.7, 1.7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

export class Ball {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 1, 10);
    this.prev = new THREE.Vector3(0, 1, 10);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();   // rad/s
    this.live = false;
    this.bounces = 0;                  // son vuruştan sonraki sekme sayısı
    this.bounceSide = 0;               // -1 rakip, +1 oyuncu
    this.lastHitBy = null;             // 'player' | 'opponent'
    this.shotId = 0;                   // her atış için artan kimlik

    this.group = new THREE.Group();
    scene.add(this.group);

    const tex = fuzzTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.97, metalness: 0.0,
      emissive: 0xbde83a, emissiveIntensity: 0.05,
      envMapIntensity: 0.5,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(PHYS.radius, 26, 20), mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // tüy hâlesi (bloom ile yumuşak kenar)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(PHYS.radius * 1.13, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0x3d4d0a, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      })
    );
    this.mesh.add(halo);

    // dikiş
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(new SeamCurve(PHYS.radius * 1.004), 128, PHYS.radius * 0.075, 6, true),
      new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.85 })
    );
    this.mesh.add(seam);

    // --- konik iz şeridi ---
    this.trailPos = [];
    for (let i = 0; i < TRAIL_LEN; i++) this.trailPos.push(this.pos.clone());
    const tg = new THREE.BufferGeometry();
    this._tv = new Float32Array(TRAIL_LEN * 2 * 3);
    this._tc = new Float32Array(TRAIL_LEN * 2 * 3);
    const ti = [];
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      ti.push(a, b, c2, b, d, c2);
    }
    tg.setAttribute('position', new THREE.BufferAttribute(this._tv, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this._tc, 3));
    tg.setIndex(ti);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false,
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // zemin gölge lekesi
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 24),
      new THREE.MeshBasicMaterial({ color: 0x040a12, transparent: true, opacity: 0.25, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);

    this.resetTrail();
  }

  resetTrail() {
    for (const p of this.trailPos) p.copy(this.pos);
    this.syncTrail();
  }

  /** İz şeridini kameraya bakacak şekilde güncelle */
  syncTrail(camPos) {
    const cam = camPos || this._camPos;
    if (camPos) this._camPos = camPos;
    if (!cam) return;
    const n = TRAIL_LEN;
    const dir = new THREE.Vector3(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.trailPos[i];
      const q = this.trailPos[Math.min(n - 1, i + 1)];
      dir.subVectors(q, p);
      if (dir.lengthSq() < 1e-10) dir.set(0, 0, 1);
      toCam.subVectors(cam, p).normalize();
      side.crossVectors(dir, toCam).normalize().multiplyScalar(
        PHYS.radius * (0.20 + 1.5 * Math.pow(i / (n - 1), 2.0))
      );
      const o = i * 6;
      this._tv[o + 0] = p.x - side.x; this._tv[o + 1] = p.y - side.y; this._tv[o + 2] = p.z - side.z;
      this._tv[o + 3] = p.x + side.x; this._tv[o + 4] = p.y + side.y; this._tv[o + 5] = p.z + side.z;
      const f = Math.pow(i / (n - 1), 2.6) * 0.85;
      for (const k of [0, 3]) {
        this._tc[o + k + 0] = 0.34 * f;
        this._tc[o + k + 1] = 0.50 * f;
        this._tc[o + k + 2] = 0.08 * f;
      }
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }

  launch(pos, vel, spin, by) {
    this.pos.copy(pos);
    this.prev.copy(pos);
    this.vel.copy(vel);
    this.spin.copy(spin || new THREE.Vector3());
    this.lastHitBy = by;
    this.shotId++;
    this.bounces = 0;
    this.live = true;
    this.resetTrail();
  }

  park(pos) {
    this.live = false;
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.sync();
    this.resetTrail();
  }

  get speedKmh() { return this.vel.length() * 3.6; }

  /** Sekme anında kısa ezilme */
  squash(power = 1) { this._squash = Math.min(1, 0.55 + power * 0.45); }

  /**
   * Bir fizik adımı. Olayları dizi olarak döner:
   *  {t:'bounce', side, inBounds, x, z} | {t:'net'} | {t:'out'} | {t:'behind'}
   */
  step(dt) {
    const ev = [];
    if (!this.live) return ev;

    this.prev.copy(this.pos);
    const prevZ = this.pos.z;
    const prevY = this.pos.y;

    // kuvvetler
    const v = this.vel;
    const acc = new THREE.Vector3(0, PHYS.gravity, 0);
    acc.addScaledVector(v, -PHYS.drag * v.length());              // sürtünme
    acc.add(new THREE.Vector3().crossVectors(this.spin, v).multiplyScalar(PHYS.magnus)); // magnus

    v.addScaledVector(acc, dt);
    this.pos.addScaledVector(v, dt);
    this.spin.multiplyScalar(Math.max(0, 1 - PHYS.spinDecay * dt));

    // --- file çarpışması ---
    if ((prevZ > 0 && this.pos.z <= 0) || (prevZ < 0 && this.pos.z >= 0)) {
      const t = Math.abs(prevZ) / Math.max(1e-6, Math.abs(prevZ - this.pos.z));
      const yAtNet = prevY + (this.pos.y - prevY) * t;
      if (yAtNet < netHeightAt(this.pos.x) + PHYS.radius && Math.abs(this.pos.x) < COURT.halfDoubles + 0.5) {
        this.pos.z = prevZ > 0 ? 0.06 : -0.06;
        this.vel.z *= -0.22; this.vel.x *= 0.3; this.vel.y *= 0.35;
        this.live = false;
        ev.push({ t: 'net' });
        this.sync();
        return ev;
      }
    }

    // --- zemin sekmesi ---
    if (this.pos.y - PHYS.radius <= 0 && v.y < 0) {
      this.pos.y = PHYS.radius;
      v.y = -v.y * PHYS.restitution;

      // topspin sekmeden sonra ileri tekme, slice frenler
      // (spin.x işareti hareket yönüyle aynı işaretli ileri tekmeyi verir)
      v.x *= PHYS.friction + 0.22;
      v.z *= PHYS.friction + 0.24;
      v.z += this.spin.x * 0.050;
      v.x -= this.spin.y * 0.030;
      this.spin.multiplyScalar(0.45);

      this.bounces++;
      this.bounceSide = this.pos.z > 0 ? 1 : -1;
      const inBounds = Math.abs(this.pos.x) <= COURT.halfSingles + PHYS.radius &&
                       Math.abs(this.pos.z) <= COURT.halfLength + PHYS.radius;
      ev.push({ t: 'bounce', side: this.bounceSide, inBounds, x: this.pos.x, z: this.pos.z });
    }

    // --- sahayı terk etti ---
    if (Math.abs(this.pos.z) > 24 || Math.abs(this.pos.x) > 17 || this.pos.y > 26) {
      this.live = false;
      ev.push({ t: 'behind' });
    }

    this.sync();
    return ev;
  }

  sync() {
    this.group.position.copy(this.pos);
    this.mesh.position.set(0, 0, 0);

    // ezilme sönümü
    if (this._squash > 0) {
      this._squash = Math.max(0, this._squash - 0.09);
      const q = this._squash;
      this.mesh.scale.set(1 + q * 0.30, 1 - q * 0.34, 1 + q * 0.30);
    } else if (this.mesh.scale.y !== 1) {
      this.mesh.scale.setScalar(1);
    }

    // görsel dönüş
    const w = this.spin;
    this.mesh.rotateX(w.x * 0.0035);
    this.mesh.rotateY(w.y * 0.0035);
    this.mesh.rotateZ(w.z * 0.0035);
    if (this.live) {
      const v = this.vel;
      this.mesh.rotateOnWorldAxis(new THREE.Vector3(-v.z, 0, v.x).normalize(), v.length() * 0.0022);
    }

    // iz kaydır
    for (let i = 0; i < TRAIL_LEN - 1; i++) this.trailPos[i].copy(this.trailPos[i + 1]);
    this.trailPos[TRAIL_LEN - 1].copy(this.pos);
    this.syncTrail();
    this.trail.visible = this.live;

    // zemin lekesi
    this.blob.position.set(this.pos.x, 0.016, this.pos.z);
    const h = Math.max(0, this.pos.y);
    const k = Math.max(0.30, 1 - h / 5.5);
    this.blob.scale.setScalar(k);
    this.blob.material.opacity = 0.30 * k * k;
    this.blob.visible = this.live;
  }
}

/** from -> target (yerde) arası, T saniyede varacak sürtünmesiz balistik hız. */
export function solveShot(from, target, T) {
  return new THREE.Vector3(
    (target.x - from.x) / T,
    (target.y - from.y - 0.5 * PHYS.gravity * T * T) / T,
    (target.z - from.z) / T
  );
}

/**
 * Atışın yolunu (sürtünme + magnus dahil) önceden hesaplar.
 * { landing, netY } döner — netY, top file düzleminden geçerken ki yüksekliği.
 */
export function simulatePath(from, vel, spin) {
  const p = from.clone(), v = vel.clone();
  const w = (spin || new THREE.Vector3()).clone();
  const dt = 1 / 180;
  let netY = null, netX = 0, time = 0;
  const acc = new THREE.Vector3(), mag = new THREE.Vector3();
  for (let i = 0; i < 900; i++) {
    const prevZ = p.z, prevY = p.y;
    acc.set(0, PHYS.gravity, 0);
    acc.addScaledVector(v, -PHYS.drag * v.length());
    acc.add(mag.crossVectors(w, v).multiplyScalar(PHYS.magnus));
    v.addScaledVector(acc, dt);
    p.addScaledVector(v, dt);
    w.multiplyScalar(Math.max(0, 1 - PHYS.spinDecay * dt));
    if (netY === null && ((prevZ > 0 && p.z <= 0) || (prevZ < 0 && p.z >= 0))) {
      const t = Math.abs(prevZ) / Math.max(1e-6, Math.abs(prevZ - p.z));
      netY = prevY + (p.y - prevY) * t;
      netX = p.x;
    }
    time += dt;
    if (p.y - PHYS.radius <= 0 && v.y < 0) break;
  }
  return { landing: p.clone(), netY, netX, time };
}

/**
 * Hedefe gerçekten düşen atış: sürtünmeyi yinelemeli düzeltir, gerekirse
 * fileyi geçecek kadar yükseltir. spin de hesaba katılır.
 */
export function aimShot(from, target, T, spin, netMargin = 0.14) {
  // Sürtünme/magnus yüzünden düşen mesafeyi yinelemeli düzelt
  const refine = (t0) => {
    const aim = target.clone();
    let tv = t0;
    let vel = solveShot(from, aim, tv);
    for (let i = 0; i < 7; i++) {
      const r = simulatePath(from, vel, spin);
      aim.x += target.x - r.landing.x;
      aim.z += target.z - r.landing.z;
      // sürtünme uçuşu kısaltıyorsa yayı biraz yükselt (istenen tempoyu koru)
      if (r.time > 0.05) tv *= Math.pow(t0 / r.time, 0.35);
      vel = solveShot(from, aim, tv);
    }
    return vel;
  };

  let t = T;
  let vel = refine(t);

  // fileyi geçemiyorsa uçuşu yükselt ve baştan nişan al
  for (let i = 0; i < 4; i++) {
    const { netY, netX } = simulatePath(from, vel, spin);
    if (netY === null || netY > netHeightAt(netX) + netMargin) break;
    t *= 1.13;
    vel = refine(t);
  }
  return vel;
}

/**
 * Canlı topun ileriki yolu — sekmeyi de hesaba katar.
 * { landing, cross } döner: landing = ilk yere değme noktası,
 * cross = zPlane düzleminden geçtiği yer (oyuncunun raket düzlemi).
 */
export function predictBallPath(pos, vel, spin, zPlane) {
  const p = pos.clone(), v = vel.clone();
  const w = (spin || new THREE.Vector3()).clone();
  const dt = 1 / 180;
  const acc = new THREE.Vector3(), mag = new THREE.Vector3();
  let landing = null, cross = null, bounced = 0;

  for (let i = 0; i < 700; i++) {
    const prevZ = p.z;
    acc.set(0, PHYS.gravity, 0);
    acc.addScaledVector(v, -PHYS.drag * v.length());
    acc.add(mag.crossVectors(w, v).multiplyScalar(PHYS.magnus));
    v.addScaledVector(acc, dt);
    p.addScaledVector(v, dt);
    w.multiplyScalar(Math.max(0, 1 - PHYS.spinDecay * dt));

    if (p.y - PHYS.radius <= 0 && v.y < 0) {
      if (!landing) landing = p.clone();
      p.y = PHYS.radius;
      v.y = -v.y * PHYS.restitution;
      v.x *= PHYS.friction + 0.22;
      v.z *= PHYS.friction + 0.24;
      v.z += w.x * 0.050;
      v.x -= w.y * 0.030;
      w.multiplyScalar(0.45);
      if (++bounced > 2) break;
    }

    if (!cross && (prevZ - zPlane) * (p.z - zPlane) <= 0 && i > 0) {
      cross = { x: p.x, y: p.y, t: i * dt };
      break;
    }
    if (Math.abs(p.z) > 17 || Math.abs(p.x) > 13) break;
  }
  return { landing, cross };
}
