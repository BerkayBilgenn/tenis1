import * as THREE from 'three';
import { COURT, COLORS } from './config.js';

/* ============================================================ dokular */

function noiseCanvas(size, base, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);

  // geniş lekelenme
  const blobs = opts.blobs ?? 90;
  for (let i = 0; i < blobs; i++) {
    const r = size * (0.03 + Math.random() * 0.16);
    const g = x.createRadialGradient(
      Math.random() * size, Math.random() * size, 0,
      0, 0, r
    );
    const a = (Math.random() * 2 - 1) * (opts.blobStrength ?? 0.05);
    g.addColorStop(0, `rgba(${a > 0 ? 255 : 0},${a > 0 ? 255 : 0},${a > 0 ? 255 : 0},${Math.abs(a)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.translate(Math.random() * size, Math.random() * size);
    x.fillStyle = g;
    x.fillRect(-r, -r, r * 2, r * 2);
    x.restore();
  }

  // ince gren
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  const grain = (opts.grain ?? 12);
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * grain;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function surfaceTexture(baseHex, repeat, opts) {
  const t = new THREE.CanvasTexture(noiseCanvas(512, baseHex, opts));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function netTexture() {
  // Çizgiler BEYAZ: hem renk hem alfa maskesi olarak kullanılıyor,
  // gerçek renk materyalin color'undan geliyor.
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,255,255,1)';
  x.lineWidth = 2.6;
  for (let i = 0; i <= 8; i++) {
    const p = Math.round((i * s) / 8) + 0.5;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, s); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(s, p); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function bannerTexture(text, bg = '#0d1a2e', fg = '#d8ff3e') {
  const w = 1024, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < w; i += 64) x.fillRect(i, 0, 32, h);
  x.fillStyle = fg;
  x.font = '800 74px Inter, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  // uçlarda ince aksan
  x.fillRect(24, h / 2 - 34, 8, 68);
  x.fillRect(w - 32, h / 2 - 34, 8, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ============================================================ skorboard */

export class Scoreboard {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 384;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(13.5, 5.1),
      new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false })
    );
    this.mesh.position.set(0, 11.6, -37.2);
    this.draw({ you: '0', opp: '0', youGames: 0, oppGames: 0, rally: 0 });
  }

  draw(d) {
    const x = this.canvas.getContext('2d');
    const W = 1024, H = 384;
    x.fillStyle = '#070d18'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,170,240,0.25)'; x.lineWidth = 4;
    x.strokeRect(8, 8, W - 16, H - 16);

    x.font = '700 34px Inter, system-ui, sans-serif';
    x.fillStyle = '#6d8cb8'; x.textBaseline = 'middle';
    x.fillText('OYUN', 610, 52);
    x.fillText('SAYI', 830, 52);

    const row = (y, name, games, pts, accent) => {
      x.fillStyle = accent ? '#d8ff3e' : '#e8f0ff';
      x.font = '800 62px Inter, system-ui, sans-serif';
      x.textAlign = 'left';
      x.fillText(name, 56, y);
      x.textAlign = 'center';
      x.fillStyle = '#9ab6dc';
      x.fillText(String(games), 646, y);
      x.fillStyle = accent ? '#d8ff3e' : '#ffffff';
      x.font = '800 78px Inter, system-ui, sans-serif';
      x.fillText(String(pts), 872, y);
    };
    row(150, 'RAKİP', d.oppGames, d.opp, false);
    x.strokeStyle = 'rgba(120,170,240,0.2)';
    x.beginPath(); x.moveTo(48, 200); x.lineTo(W - 48, 200); x.stroke();
    row(268, 'SEN', d.youGames, d.you, true);

    this.tex.needsUpdate = true;
  }
}

/* ============================================================ tribün */

function buildStand(width, rows, seatColor) {
  const g = new THREE.Group();
  const rise = 0.52, depth = 0.95;

  const concrete = new THREE.MeshStandardMaterial({
    map: surfaceTexture('#22344c', 6, { grain: 16, blobs: 40 }),
    roughness: 0.95, metalness: 0,
  });
  const seatMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.85 });

  // basamaklar tek geometride
  const steps = [];
  for (let r = 0; r < rows; r++) {
    const y = r * rise;
    const z = r * depth;
    const tread = new THREE.BoxGeometry(width, 0.14, depth);
    tread.translate(0, y + 0.07, z);
    steps.push(tread);
    const riser = new THREE.BoxGeometry(width, rise, 0.14);
    riser.translate(0, y + rise / 2, z - depth / 2);
    steps.push(riser);
  }
  const merged = mergeGeoms(steps);
  const stepMesh = new THREE.Mesh(merged, concrete);
  stepMesh.receiveShadow = true;
  g.add(stepMesh);

  // koltuk sıraları
  const seatGeoms = [];
  for (let r = 0; r < rows; r++) {
    const b = new THREE.BoxGeometry(width, 0.30, 0.30);
    b.translate(0, r * rise + 0.29, r * depth + 0.18);
    seatGeoms.push(b);
  }
  const seats = new THREE.Mesh(mergeGeoms(seatGeoms), seatMat);
  g.add(seats);

  // ön korkuluk
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.07, 0.07),
    new THREE.MeshStandardMaterial({ color: 0xb9d4f2, roughness: 0.4, metalness: 0.6 })
  );
  rail.position.set(0, 1.05, -0.55);
  g.add(rail);
  const railWall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 1.05, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x16273d, roughness: 0.9 })
  );
  railWall.position.set(0, 0.52, -0.55);
  railWall.receiveShadow = true;
  g.add(railWall);

  g.userData = { rows, rise, depth, width };
  return g;
}

// küçük yerel merge (BufferGeometryUtils yüklemeden)
function mergeGeoms(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : 0; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv  = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    nor.set(n.array, vo * 3);
    uv.set(u.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ============================================================ kalabalık */

class Crowd {
  constructor(scene, slots) {
    const n = slots.length;
    const bodyGeo = new THREE.CapsuleGeometry(0.16, 0.30, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.115, 10, 8);
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });

    this.body = new THREE.InstancedMesh(bodyGeo, mat(), n);
    this.head = new THREE.InstancedMesh(headGeo, mat(), n);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.frustumCulled = false;
    this.head.frustumCulled = false;
    scene.add(this.body, this.head);

    this.slots = slots;
    this.phase = new Float32Array(n);
    this.energy = 0;

    const c = new THREE.Color();
    const shirt = [0x223c60, 0x1a2c47, 0x2f5480, 0x7d3527, 0x8f7527, 0xbfc6d0, 0x27523f, 0x452c5c, 0x2c3542, 0x59616e];
    const skin = [0xb8895f, 0x94643c, 0x6f4728, 0xd2a97f, 0x4d301c];
    for (let i = 0; i < n; i++) {
      this.phase[i] = Math.random() * Math.PI * 2;
      this.body.setColorAt(i, c.setHex(shirt[(Math.random() * shirt.length) | 0]));
      this.head.setColorAt(i, c.setHex(skin[(Math.random() * skin.length) | 0]));
    }
    this.body.instanceColor.needsUpdate = true;
    this.head.instanceColor.needsUpdate = true;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
    this.update(0, 0);
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }

  cheer() { this.energy = 1; }

  update(dt, time) {
    this.energy = Math.max(0, this.energy - dt * 0.55);
    // hareket maliyeti düşük olsun: yalnız coşku varken güncelle
    const amp = 0.02 + this.energy * 0.30;
    if (this.energy <= 0 && this._settled) return;
    this._settled = this.energy <= 0;

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const bob = Math.sin(time * 4.2 + this.phase[i]) * amp;
      this._p.set(s.x, s.y + 0.30 + Math.max(0, bob), s.z);
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
      this._m.compose(this._p, this._q, this._s);
      this.body.setMatrixAt(i, this._m);
      this._p.y = s.y + 0.68 + Math.max(0, bob);
      this._m.compose(this._p, this._q, this._s);
      this.head.setMatrixAt(i, this._m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }

  setEmissive(v) {
    for (const m of [this.body.material, this.head.material]) {
      m.emissive = new THREE.Color(0x5f7fb8);
      m.emissiveIntensity = v;
      m.needsUpdate = true;
    }
  }
}

/* ============================================================ projektör */

function floodTower(x, z, aimAt) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const steel = new THREE.MeshStandardMaterial({ color: 0x2b3a4d, roughness: 0.55, metalness: 0.75 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.34, 17, 10), steel);
  mast.position.y = 8.5;
  mast.castShadow = true;
  g.add(mast);

  for (let i = 0; i < 3; i++) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), steel);
    const a = (i / 3) * Math.PI * 2;
    brace.position.set(Math.cos(a) * 1.1, 1.6, Math.sin(a) * 1.1);
    brace.rotation.z = Math.cos(a) * 0.55;
    brace.rotation.x = -Math.sin(a) * 0.55;
    g.add(brace);
  }

  const head = new THREE.Group();
  head.position.y = 17.4;
  g.add(head);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 0.5), steel);
  head.add(frame);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x8899aa, emissive: 0xfff3d0, emissiveIntensity: 0, roughness: 0.3, metalness: 0.4,
  });
  const lamps = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 6; c++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.26), lampMat);
      l.position.set(-1.9 + c * 0.76, 0.34 + r * 0.52, 0.1);
      head.add(l);
      lamps.push(l);
    }
  }
  head.lookAt(aimAt.x, 2, aimAt.z);
  head.rotateY(Math.PI);

  // gövde ışıması (bloom yakalasın)
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.9),
    new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  halo.position.set(0, 0.6, 0.3);
  head.add(halo);

  return { group: g, lampMat, halo };
}

/* ============================================================ ana kurulum */

export function buildCourt(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const out = { group, floods: [], crowd: null, scoreboard: null };

  /* --- zeminler --- */
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 150),
    new THREE.MeshStandardMaterial({
      map: surfaceTexture('#194f3c', 26, { grain: 10, blobs: 70, blobStrength: 0.06 }),
      roughness: 0.98, metalness: 0,
    })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.03;
  apron.receiveShadow = true;
  group.add(apron);

  const runOffW = COURT.halfDoubles * 2 + 9.6;
  const runOffL = COURT.halfLength * 2 + 15.5;
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(runOffW, runOffL),
    new THREE.MeshStandardMaterial({
      map: surfaceTexture('#15556f', 12, { grain: 9, blobs: 60, blobStrength: 0.05 }),
      roughness: 0.92, metalness: 0.02,
    })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.012;
  outer.receiveShadow = true;
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.halfDoubles * 2 + 1.2, COURT.halfLength * 2 + 1.2),
    new THREE.MeshStandardMaterial({
      map: surfaceTexture('#2a5f9e', 8, { grain: 8, blobs: 50, blobStrength: 0.045 }),
      roughness: 0.88, metalness: 0.03,
    })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.receiveShadow = true;
  group.add(inner);

  /* --- çizgiler --- */
  const lineMat = new THREE.MeshStandardMaterial({ color: COLORS.line, roughness: 0.62, metalness: 0 });
  const L = COURT.lineW;
  const lineGeoms = [];
  const addLine = (w, l, x, z) => {
    const g = new THREE.BoxGeometry(w, 0.012, l);
    g.translate(x, 0.006, z);
    lineGeoms.push(g);
  };
  const fullL = COURT.halfLength * 2;
  addLine(L, fullL, COURT.halfDoubles, 0);
  addLine(L, fullL, -COURT.halfDoubles, 0);
  addLine(L, fullL, COURT.halfSingles, 0);
  addLine(L, fullL, -COURT.halfSingles, 0);
  addLine(COURT.halfDoubles * 2, L, 0, COURT.halfLength);
  addLine(COURT.halfDoubles * 2, L, 0, -COURT.halfLength);
  addLine(COURT.halfSingles * 2, L, 0, COURT.serviceLine);
  addLine(COURT.halfSingles * 2, L, 0, -COURT.serviceLine);
  addLine(L, COURT.serviceLine * 2, 0, 0);
  addLine(L, 0.30, 0, COURT.halfLength - 0.15);
  addLine(L, 0.30, 0, -COURT.halfLength + 0.15);
  const lines = new THREE.Mesh(mergeGeoms(lineGeoms), lineMat);
  lines.receiveShadow = true;
  group.add(lines);

  /* --- file --- */
  const netW = COURT.halfDoubles * 2 + 0.92;
  const netH = COURT.netPost;
  const segX = 40, segY = 6;
  const netGeo = new THREE.PlaneGeometry(netW, netH, segX, segY);
  {   // ortada sarkma
    const p = netGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = 1 - Math.abs(x) / (netW / 2);
      const sag = (COURT.netPost - COURT.netCenter) * t * t;
      const topFactor = (y + netH / 2) / netH;
      p.setY(i, y - sag * topFactor);
      p.setZ(i, Math.sin(t * Math.PI) * 0.02);
    }
    netGeo.computeVertexNormals();
  }
  const netTex = netTexture();
  netTex.repeat.set(52, 7);
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({
    map: netTex, alphaMap: netTex, transparent: true, alphaTest: 0.42,
    side: THREE.DoubleSide, color: 0x121a26, roughness: 0.96, metalness: 0.05,
  }));
  net.position.y = netH / 2;
  net.castShadow = true;
  group.add(net);

  const tapeGeo = new THREE.BoxGeometry(netW, 0.062, 0.032);
  const tape = new THREE.Mesh(tapeGeo, new THREE.MeshStandardMaterial({
    color: 0xf6faff, roughness: 0.55, metalness: 0.02,
  }));
  tape.position.y = netH;
  tape.castShadow = true;
  group.add(tape);
  // sarkan üst bant (orta düşük)
  const tapeSag = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.062, 0.032),
    tape.material
  );
  tapeSag.position.y = COURT.netCenter + 0.03;
  group.add(tapeSag);

  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, COURT.netCenter, 0.035),
    new THREE.MeshStandardMaterial({ color: 0xf6faff, roughness: 0.6 })
  );
  strap.position.y = COURT.netCenter / 2;
  group.add(strap);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x141c28, roughness: 0.35, metalness: 0.7 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, netH + 0.14, 14), postMat);
    p.position.set(sx * (netW / 2), (netH + 0.14) / 2, 0);
    p.castShadow = true;
    group.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), postMat);
    cap.position.set(sx * (netW / 2), netH + 0.14, 0);
    group.add(cap);
  }

  /* --- reklam panoları (yalnız korta bakan yüz yazılı) --- */
  const bannerMat = (txt, bg, fg, rep = 1) => {
    const t = bannerTexture(txt, bg, fg);
    t.wrapS = THREE.RepeatWrapping; t.repeat.x = rep;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.72, metalness: 0.05 });
  };
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.9 });

  const addBanner = (w, x, z, ry, txt, bg, fg, rep) => {
    const holder = new THREE.Group();
    holder.position.set(x, 0.53, z);
    holder.rotation.y = ry;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, 1.06, 0.16), boardMat);
    back.castShadow = back.receiveShadow = true;
    holder.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.02), bannerMat(txt, bg, fg, rep));
    face.position.z = 0.085;
    holder.add(face);
    group.add(holder);
  };

  addBanner(30, 0, -COURT.halfLength - 4.8, 0, 'EL TAKİPLİ TENİS', '#0b1524', '#d8ff3e', 2);
  addBanner(30, 0, COURT.halfLength + 5.4, Math.PI, 'PARMAK TENİSİ', '#0b1524', '#38e8ff', 2);
  addBanner(34, -(COURT.halfDoubles + 4.6), -2, Math.PI / 2, 'PARMAK TENİSİ', '#0d1a2e', '#38e8ff', 3);
  addBanner(34, (COURT.halfDoubles + 4.6), -2, -Math.PI / 2, 'EL TAKİPLİ TENİS', '#0d1a2e', '#d8ff3e', 3);

  /* --- tribünler + kalabalık --- */
  const slots = [];
  const addStand = (group3, width, rows, pos, ry) => {
    group3.position.copy(pos);
    group3.rotation.y = ry;
    group.add(group3);
    const seatGap = 0.66;
    const cols = Math.floor(width / seatGap) - 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.12) continue;                 // boş koltuklar
        const lx = -width / 2 + seatGap * (c + 1.5) + (Math.random() - 0.5) * 0.14;
        const ly = r * group3.userData.rise + 0.30;
        const lz = r * group3.userData.depth + 0.22;
        const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(pos);
        slots.push({ x: v.x, y: v.y, z: v.z, ry: ry + Math.PI + (Math.random() - 0.5) * 0.3 });
      }
    }
  };

  // sıralar korttan UZAKLAŞARAK yükselir, koltuklar korta bakar
  addStand(buildStand(46, 15, 0x24467a), 46, 15, new THREE.Vector3(0, 0.6, -23.0), Math.PI);
  addStand(buildStand(38, 11, 0x1f3e6d), 38, 11, new THREE.Vector3(-16.0, 0.6, -3), -Math.PI / 2);
  addStand(buildStand(38, 11, 0x1f3e6d), 38, 11, new THREE.Vector3(16.0, 0.6, -3), Math.PI / 2);

  out.crowd = new Crowd(scene, slots);

  /* --- projektörler --- */
  const center = new THREE.Vector3(0, 0, 0);
  for (const [x, z] of [[-27, -27], [27, -27], [-27, 15], [27, 15]]) {
    const f = floodTower(x, z, center);
    group.add(f.group);
    out.floods.push(f);
  }

  /* --- skorboard --- */
  out.scoreboard = new Scoreboard();
  group.add(out.scoreboard.mesh);
  const sbFrame = new THREE.Mesh(
    new THREE.BoxGeometry(14.4, 6.0, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x101a2a, roughness: 0.8, metalness: 0.2 })
  );
  sbFrame.position.set(0, 11.6, -37.5);
  group.add(sbFrame);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 8.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x243549, roughness: 0.6, metalness: 0.6 }));
    leg.position.set(sx * 5.8, 4.3, -37.7);
    group.add(leg);
  }

  /* --- hakem kürsüsü --- */
  const chair = new THREE.Group();
  chair.position.set(-(COURT.halfDoubles + 2.9), 0, 0);
  chair.rotation.y = Math.PI / 2;
  const frameM = new THREE.MeshStandardMaterial({ color: 0x35506f, roughness: 0.55, metalness: 0.45 });
  const seatM  = new THREE.MeshStandardMaterial({ color: 0x16283f, roughness: 0.85 });
  for (const [ox, oz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.5, 8), frameM);
    leg.position.set(ox, 1.25, oz);
    leg.rotation.z = -ox * 0.05; leg.rotation.x = oz * 0.05;
    leg.castShadow = true; chair.add(leg);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.10, 1.05), frameM);
  platform.position.y = 2.5; platform.castShadow = true; chair.add(platform);
  const seatBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.85), seatM);
  seatBox.position.y = 2.94; seatBox.castShadow = true; chair.add(seatBox);
  const backRest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.12), seatM);
  backRest.position.set(0, 3.4, -0.42); backRest.castShadow = true; chair.add(backRest);
  for (const sx of [-1, 1]) {
    const armr = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.8), frameM);
    armr.position.set(sx * 0.5, 3.2, 0); chair.add(armr);
  }
  // merdiven
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.16), frameM);
    st.position.set(0, 0.45 + i * 0.44, 0.62 + i * 0.02);
    chair.add(st);
  }
  const shade = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.07, 1.25),
    new THREE.MeshStandardMaterial({ color: 0x1d3a63, roughness: 0.9 })
  );
  shade.position.y = 4.15; shade.castShadow = true; chair.add(shade);
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), frameM);
    pole.position.set(sx * 0.55, 3.6, -0.45); chair.add(pole);
  }
  group.add(chair);

  return out;
}

/** Belirli bir x'te file yüksekliği (ortada sarkma) */
export function netHeightAt(x) {
  const t = Math.min(1, Math.abs(x) / (COURT.halfDoubles + 0.46));
  return COURT.netCenter + (COURT.netPost - COURT.netCenter) * t * t;
}
