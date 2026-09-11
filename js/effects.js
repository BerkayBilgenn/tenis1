import * as THREE from 'three';

/** Vuruş halkaları + zemin sekme izleri için küçük havuzlar. */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.105, 26),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, t: 0 });
    }

    this.marks = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 18),
        new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.marks.push({ m, t: 0 });
    }

    // --- toz bulutu (sekmede) ---
    this.puffs = [];
    const puffTex = (() => {
      const n = 64, c = document.createElement('canvas');
      c.width = c.height = n;
      const x = c.getContext('2d');
      const gd = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gd.addColorStop(0, 'rgba(255,255,255,0.55)');
      gd.addColorStop(0.45, 'rgba(255,255,255,0.20)');
      gd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gd; x.fillRect(0, 0, n, n);
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xdfe8f2, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.NormalBlending,
      }));
      sp.visible = false;
      scene.add(sp);
      this.puffs.push({ m: sp, t: 0, v: new THREE.Vector3(), s0: 0.2 });
    }

    this.sparkGroup = new THREE.Group();
    scene.add(this.sparkGroup);
    this.sparks = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.019, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xd8ff3e, transparent: true, opacity: 0 })
      );
      s.visible = false;
      this.sparkGroup.add(s);
      this.sparks.push({ m: s, t: 0, v: new THREE.Vector3() });
    }
  }

  ring(pos, color = 0xd8ff3e, scale = 1) {
    const r = this.rings.find((x) => x.t <= 0) || this.rings[0];
    r.m.position.copy(pos);
    r.m.lookAt(pos.x, pos.y, pos.z + 1);
    r.m.material.color.setHex(color);
    r.m.scale.setScalar(scale);
    r.m.visible = true;
    r.t = 1;
    r.base = scale;
  }

  burst(pos, color = 0xd8ff3e, n = 10, power = 2.4) {
    let made = 0;
    for (const s of this.sparks) {
      if (made >= n) break;
      if (s.t > 0) continue;
      s.m.position.copy(pos);
      s.m.material.color.setHex(color);
      s.m.visible = true;
      s.t = 1;
      s.v.set(
        (Math.random() * 2 - 1) * power,
        Math.random() * power * 0.9 + 0.4,
        (Math.random() * 2 - 1) * power
      );
      made++;
    }
  }

  /** Sekme tozu: yerden yukarı savrulan yumuşak bulut */
  puff(x, z, power = 1) {
    let made = 0;
    for (const p of this.puffs) {
      if (made >= 5) break;
      if (p.t > 0) continue;
      p.m.position.set(x + (Math.random() - 0.5) * 0.16, 0.05, z + (Math.random() - 0.5) * 0.16);
      p.v.set((Math.random() - 0.5) * 1.1 * power, 0.5 + Math.random() * 0.7, (Math.random() - 0.5) * 1.1 * power);
      p.s0 = 0.16 + Math.random() * 0.16;
      p.m.scale.setScalar(p.s0);
      p.m.material.opacity = 0.30 + 0.2 * power;
      p.m.visible = true;
      p.t = 1;
      made++;
    }
  }

  mark(x, z) {
    const k = this.marks.find((m) => m.t <= 0) || this.marks[0];
    k.m.position.set(x, 0.018, z);
    k.m.visible = true;
    k.t = 1;
  }

  update(dt) {
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= dt * 3.4;
      const p = 1 - Math.max(0, r.t);
      r.m.scale.setScalar((r.base || 1) * (1 + p * 2.0));
      r.m.material.opacity = Math.max(0, r.t) * 0.55;
      if (r.t <= 0) r.m.visible = false;
    }
    for (const k of this.marks) {
      if (k.t <= 0) continue;
      k.t -= dt * 0.55;
      k.m.material.opacity = Math.max(0, k.t) * 0.32;
      if (k.t <= 0) k.m.visible = false;
    }
    for (const p of this.puffs) {
      if (p.t <= 0) continue;
      p.t -= dt * 1.25;
      p.v.y -= 1.2 * dt;
      p.v.multiplyScalar(1 - dt * 1.8);
      p.m.position.addScaledVector(p.v, dt);
      const k = 1 - Math.max(0, p.t);
      p.m.scale.setScalar(p.s0 * (1 + k * 3.4));
      p.m.material.opacity = Math.max(0, p.t) * 0.36;
      if (p.t <= 0) p.m.visible = false;
    }
    for (const s of this.sparks) {
      if (s.t <= 0) continue;
      s.t -= dt * 1.7;
      s.v.y -= 9.0 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.material.opacity = Math.max(0, s.t);
      if (s.t <= 0) s.m.visible = false;
    }
  }
}
