import * as THREE from 'three';
import { PLAYER } from './config.js';

/* --- teller: keskin alfa dokusu --- */
function stringTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  const n = 18;
  for (let i = 1; i < n; i++) {
    const p = Math.round((i * s) / n) + 0.5;
    x.strokeStyle = 'rgba(246,250,255,0.92)';
    x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, s); x.stroke();
    x.strokeStyle = 'rgba(228,238,252,0.86)';
    x.beginPath(); x.moveTo(0, p); x.lineTo(s, p); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/* --- sap sargısı --- */
function gripTexture() {
  const w = 64, h = 256, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#1a2230'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3;
  for (let i = -h; i < h; i += 13) {
    x.beginPath(); x.moveTo(-4, i); x.lineTo(w + 4, i + 26); x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,0.09)'; x.lineWidth = 1.5;
  for (let i = -h; i < h; i += 13) {
    x.beginPath(); x.moveTo(-4, i + 3); x.lineTo(w + 4, i + 29); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --- eliptik çerçeve eğrisi --- */
class EllipseCurve3 extends THREE.Curve {
  constructor(rx, ry) { super(); this.rx = rx; this.ry = ry; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target.set(Math.sin(a) * this.rx, Math.cos(a) * this.ry, 0);
  }
}

export class Racket {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const RX = 0.138, RY = 0.166;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0d1420, roughness: 0.22, metalness: 0.92,
      envMapIntensity: 1.4,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xd8ff3e, roughness: 0.28, metalness: 0.35,
      emissive: 0xd8ff3e, emissiveIntensity: 0.55,
    });

    const head = new THREE.Group();
    head.position.y = 0.205;
    this.group.add(head);

    // çerçeve (düzgün elips tüp)
    const frame = new THREE.Mesh(
      new THREE.TubeGeometry(new EllipseCurve3(RX, RY), 96, 0.0135, 10, true),
      frameMat
    );
    frame.castShadow = true;
    head.add(frame);

    // dış aksan halkası (bloom yakalar)
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(new EllipseCurve3(RX + 0.014, RY + 0.014), 80, 0.0035, 6, true),
      accentMat
    );
    head.add(glow);

    // teller
    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshStandardMaterial({
        map: stringTexture(), alphaMap: stringTexture(),
        transparent: true, alphaTest: 0.30, side: THREE.DoubleSide,
        roughness: 0.45, metalness: 0.1, color: 0xffffff,
      })
    );
    strings.scale.set(RX - 0.004, RY - 0.004, 1);
    head.add(strings);
    this.strings = strings;

    // titreşim susturucu
    const damp = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6b7d, roughness: 0.6 })
    );
    damp.position.set(0.012, -RY + 0.022, 0);
    head.add(damp);

    // boğaz (iki kavisli kol)
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.020, -0.10, 0),
        new THREE.Vector3(sx * 0.055, -0.045, 0),
        new THREE.Vector3(sx * RX * 0.86, 0.055, 0),
      ]);
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0125, 8, false), frameMat);
      t.castShadow = true;
      this.group.add(t);
    }
    const bridge = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(-RX * 0.80, 0.062, 0),
          new THREE.Vector3(0, 0.040, 0),
          new THREE.Vector3(RX * 0.80, 0.062, 0),
        ]), 18, 0.010, 8, false),
      frameMat
    );
    this.group.add(bridge);

    // sap
    const gripTex = gripTexture();
    gripTex.repeat.set(1, 2.4);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0185, 0.0215, 0.215, 14),
      new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.9, metalness: 0.05 })
    );
    grip.position.y = -0.205;
    grip.castShadow = true;
    this.group.add(grip);

    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.016, 14), accentMat);
    butt.position.y = -0.318;
    this.group.add(butt);

    // vuruş halkası
    this.flash = new THREE.Mesh(
      new THREE.RingGeometry(RX, RX + 0.13, 40),
      new THREE.MeshBasicMaterial({
        color: 0xeaffa0, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      })
    );
    this.flash.position.y = 0.205;
    this.flash.scale.set(1, RY / RX, 1);
    this.group.add(this.flash);
    this.flashT = 0;

    // savurma izi (hareket bulanıklığı hissi)
    this.blur = new THREE.Mesh(
      new THREE.RingGeometry(RX * 0.5, RX + 0.02, 28, 1, 0, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    this.blur.position.y = 0.205;
    this.group.add(this.blur);

    this.pos = new THREE.Vector3(0, 1.0, PLAYER.racketZ);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.peak = 0;            // savuruşun zirve hızı (sönümlenerek düşer)
    this.stationZ = PLAYER.racketZ;   // oyuncunun kort üzerindeki derinliği
    this.group.position.copy(this.pos);
    this.head = head;
  }

  update(hand, dt) {
    const targetX = hand.x * PLAYER.reachX;
    const targetY = PLAYER.reachYMin + (1 - hand.y) * (PLAYER.reachYMax - PLAYER.reachYMin);
    const targetZ = this.stationZ + (0.5 - hand.depth) * PLAYER.racketZRange;

    const k = 1 - Math.pow(0.0018, dt);
    this.prevPos.copy(this.pos);
    this.pos.x += (targetX - this.pos.x) * k;
    this.pos.y += (targetY - this.pos.y) * k;
    this.pos.z += (targetZ - this.pos.z) * k;
    this.group.position.copy(this.pos);

    if (dt > 0) this.vel.copy(this.pos).sub(this.prevPos).divideScalar(dt);
    const speed = this.vel.length();
    // zirve hız: yavaşlarken vurunca da savuruşun gücü sayılsın
    this.peak = Math.max(speed, this.peak * Math.pow(0.045, dt));

    const lean = THREE.MathUtils.clamp(hand.tilt, -1, 1);
    this.group.rotation.z = -lean * 0.9 - THREE.MathUtils.clamp(this.vel.x * 0.045, -0.5, 0.5);
    this.group.rotation.x = THREE.MathUtils.clamp(-this.vel.y * 0.032, -0.5, 0.5);
    this.group.rotation.y = THREE.MathUtils.clamp(this.vel.x * 0.032, -0.45, 0.45);

    const want = hand.fist ? 1.14 : 1.0;
    const sc = this.group.scale.x + (want - this.group.scale.x) * (1 - Math.pow(0.004, dt));
    this.group.scale.setScalar(sc);

    // hızlı savuruşta iz
    const blurAmt = THREE.MathUtils.clamp((speed - 3.5) / 9, 0, 1);
    this.blur.material.opacity = blurAmt * 0.30;
    this.blur.rotation.z = Math.atan2(this.vel.y, this.vel.x) - Math.PI / 2;
    this.blur.scale.setScalar(1 + blurAmt * 0.5);

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 3.6);
      this.flash.material.opacity = this.flashT * this.flashT * 0.9;
      const s = 1 + (1 - this.flashT) * 1.7;
      this.flash.scale.set(s, s * 1.2, 1);
    }
  }

  get hitCenter() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 0.205 * this.group.scale.y, this.pos.z);
  }

  popFlash() {
    this.flashT = 1;
    this.flash.material.opacity = 0.9;
    this.flash.scale.set(1, 1.2, 1);
  }
}
