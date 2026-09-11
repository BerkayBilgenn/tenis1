/**
 * El takibi: MediaPipe HandLandmarker (webcam) + fare yedeği.
 * Dışarıya normalize edilmiş tek bir "hand" durumu verir.
 */
// Birden fazla CDN dene: biri engelliyse/ulaşılamıyorsa diğerine geç.
const VISION_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.14',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8',
];
const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe-samples@main/examples/hand_landmarker/js/hand_landmarker.task',
];

export class TrackingError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * One Euro filtresi: dururken titremeyi siler, hızlı harekette gecikme yaratmaz.
 * Basit EMA'dan çok daha iyi bir his verir.
 */
class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.020, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0;
  }
  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, dt) {
    if (dt <= 0) return this.x ?? value;
    if (this.x === null) { this.x = value; return value; }
    const dxRaw = (value - this.x) / dt;
    const ad = this._alpha(this.dCutoff, dt);
    this.dx = ad * dxRaw + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = this._alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

export class HandInput {
  constructor({ video, overlay, camBox }) {
    this.video = video;
    this.overlay = overlay;
    this.camBox = camBox;
    this.ctx = overlay.getContext('2d');

    this.mode = 'none';          // 'camera' | 'mouse'
    this.landmarker = null;
    this.lastVideoTime = -1;

    // dışarıya verilen durum
    this.hand = {
      present: false,
      x: 0, y: 0.5, depth: 0.5, tilt: 0,
      vx: 0, vy: 0, speed: 0,
      pinch: false, fist: false,
      pinchEdge: false, fistEdge: false,
      swingPeak: 0, swingArmed: false, swingDirX: 0, swingDirY: 0,
    };

    this._raw = { x: 0, y: 0.5, depth: 0.5, tilt: 0 };
    this._filt = {
      x: new OneEuro(1.3, 0.028), y: new OneEuro(1.3, 0.028),
      depth: new OneEuro(0.9, 0.010), tilt: new OneEuro(1.6, 0.020),
    };
    this._hist = [];
    // savurma durum makinesi
    this.swing = { armed: false, peak: 0, dirX: 0, dirY: 0, t: 0, since: 99 };
    this._prevPinch = false;
    this._prevFist = false;
    this._lostFor = 0;

    this._bindMouse();
  }

  // ---------- kamera ----------
  /** Ortam kamera + WASM için uygun mu? Değilse anlaşılır bir hata fırlatır. */
  _checkEnvironment() {
    const isLocal = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
    if (location.protocol === 'file:') {
      throw new TrackingError('FILE_PROTOCOL',
        'Sayfa dosya olarak açılmış. Kamera için terminalde ./start.sh çalıştırıp ' +
        'http://localhost:8000 adresini aç.');
    }
    if (!window.isSecureContext && !isLocal) {
      throw new TrackingError('INSECURE',
        'Tarayıcı bu adreste kameraya izin vermiyor. http://localhost ya da https:// kullan.');
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new TrackingError('NO_API',
        'Bu tarayıcı kamera API\'sini vermiyor. Chrome ya da Safari ile dene.');
    }
  }

  async _openStream() {
    const tries = [
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr;
    for (const constraints of tries) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) { lastErr = e; }
    }
    const n = lastErr && lastErr.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      throw new TrackingError('DENIED',
        'Kamera izni verilmedi. Adres çubuğundaki kamera simgesinden izin verip sayfayı yenile.', lastErr);
    }
    if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      throw new TrackingError('NO_CAMERA', 'Kamera bulunamadı. Cihazda bir kamera bağlı mı?', lastErr);
    }
    if (n === 'NotReadableError') {
      throw new TrackingError('BUSY',
        'Kamerayı başka bir uygulama kullanıyor (Zoom, FaceTime, başka bir sekme…). Kapatıp tekrar dene.', lastErr);
    }
    throw new TrackingError('STREAM', `Kamera açılamadı: ${n || lastErr}`, lastErr);
  }

  async _loadVision(onProgress) {
    let lastErr;
    for (const base of VISION_CDNS) {
      try {
        onProgress(`El takibi kütüphanesi indiriliyor…`);
        const mod = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
        const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
        return { mod, fileset, base };
      } catch (e) { lastErr = e; }
    }
    throw new TrackingError('VISION_LOAD',
      'El takibi kütüphanesi indirilemedi. İnternet bağlantını kontrol et ' +
      '(kurumsal ağ/VPN cdn.jsdelivr.net adresini engelliyor olabilir).', lastErr);
  }

  async _createLandmarker(mod, fileset, onProgress) {
    let lastErr;
    for (const modelAssetPath of MODEL_URLS) {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          onProgress(`El takibi modeli yükleniyor (${delegate})…`);
          return await mod.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.45,
            minTrackingConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
          });
        } catch (e) { lastErr = e; }
      }
    }
    throw new TrackingError('MODEL_LOAD',
      'El takibi modeli yüklenemedi. Ağ engelini kontrol et ya da fareyle oyna.', lastErr);
  }

  /**
   * Modeli sayfa açılır açılmaz arka planda indirmeye başla.
   * Kullanıcı düğmeye bastığında beklemesin diye.
   */
  warmup(onDone = () => {}) {
    if (this._warm) return this._warm;
    this._warm = (async () => {
      const { mod, fileset } = await this._loadVision(() => {});
      return await this._createLandmarker(mod, fileset, () => {});
    })();
    this._warm.then(
      (lm) => { this._warmLandmarker = lm; onDone(null); },
      (err) => { this._warmError = err; onDone(err); }
    );
    return this._warm;
  }

  async startCamera(onProgress = () => {}) {
    this._checkEnvironment();

    onProgress('Kamera izni bekleniyor…');
    const stream = await this._openStream();
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    try { await this.video.play(); } catch { /* autoplay kısıtı: sessiz + inline yeter */ }

    // ilk kareyi bekle (readyState 0 iken detectForVideo patlıyor)
    if (this.video.readyState < 2) {
      await new Promise((res) => {
        const done = () => { this.video.removeEventListener('loadeddata', done); res(); };
        this.video.addEventListener('loadeddata', done);
        setTimeout(done, 4000);
      });
    }

    if (this._warmLandmarker) {
      this.landmarker = this._warmLandmarker;
    } else if (this._warm && !this._warmError) {
      onProgress('El takibi modeli yükleniyor…');
      this.landmarker = await this._warm;
    } else {
      const { mod, fileset } = await this._loadVision(onProgress);
      this.landmarker = await this._createLandmarker(mod, fileset, onProgress);
    }

    this.overlay.width = 320;
    this.overlay.height = 240;
    this.mode = 'camera';
    if (this.camBox) this.camBox.classList.remove('hidden');
  }

  stopCamera() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // ---------- fare yedeği ----------
  _bindMouse() {
    this._mouse = { x: 0, y: 0.5, down: false };
    addEventListener('pointermove', (e) => {
      this._mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this._mouse.y = e.clientY / innerHeight;
    });
    addEventListener('pointerdown', () => { this._mouse.down = true; });
    addEventListener('pointerup',   () => { this._mouse.down = false; });
  }

  /** Menüden oyuna geçerken o anki tıklama/pinch'in tetiklenmesini engelle */
  suppress() {
    this._mouse.down = false;
    this._prevPinch = true;
    this._prevFist = true;
    this.hand.pinchEdge = false;
    this.hand.fistEdge = false;
  }

  startMouse() {
    this.mode = 'mouse';
    if (this.camBox) this.camBox.classList.add('hidden');
  }

  // ---------- her karede ----------
  update(dt, now) {
    if (this.mode === 'mouse') {
      this._raw.x = this._mouse.x;
      this._raw.y = this._mouse.y;
      this._raw.depth = 0.5;
      this._raw.tilt = clamp(this.hand.vx * 0.5, -1, 1);
      this.hand.present = true;
      this._pushHist(now, this._raw.x, this._raw.y);
      this._finish(dt, this._mouse.down, false);
      return;
    }

    if (this.mode !== 'camera' || !this.landmarker) return;
    if (this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) { this._finish(dt, this.hand.pinch, this.hand.fist); return; }
    this.lastVideoTime = this.video.currentTime;

    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, now);
    } catch {
      return;
    }

    const lm = res?.landmarks?.[0];
    if (!lm) {
      this._lostFor += dt;
      if (this._lostFor > 0.35) this.hand.present = false;
      if (this.camBox) this.camBox.classList.add('lost');
      this._draw(null);
      this._finish(dt, false, false);
      return;
    }

    this._lostFor = 0;
    this.hand.present = true;
    if (this.camBox) this.camBox.classList.remove('lost');

    // --- ölçümler ---
    const wrist = lm[0], idxMcp = lm[5], midMcp = lm[9], pinkyMcp = lm[17];
    const px = (wrist.x + idxMcp.x + midMcp.x + pinkyMcp.x) / 4;
    const py = (wrist.y + idxMcp.y + midMcp.y + pinkyMcp.y) / 4;

    // ayna: kamerada sağa gidince ekranda da sağa gitsin
    const mx = 1 - px;

    // el boyutu -> derinlik
    const size = Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y);
    const depth = clamp((size - 0.09) / 0.15, 0, 1);

    // eğim: bilek -> orta parmak tabanı ekseninin dikeyden sapması
    // (aynalanmış koordinatta; parmaklar sağa yatınca tilt > 0)
    const dxm = (1 - midMcp.x) - (1 - wrist.x);
    const dym = Math.max(wrist.y - midMcp.y, 1e-4);
    const tilt = clamp(Math.atan2(dxm, dym) / 0.95, -1, 1);

    // kullanılabilir alanı biraz genişlet (çerçevenin ortasındaki %70 -> tam erişim)
    const nx = clamp((mx - 0.5) / 0.34, -1, 1);
    const ny = clamp((py - 0.5) / 0.36 + 0.5, 0, 1);

    // pinch: başparmak ucu - işaret ucu
    const pinchD = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / Math.max(size, 1e-4);
    const pinch = pinchD < 0.62;

    // yumruk: uçlar avuca yakın
    let folded = 0;
    for (const [tip, mcp] of [[8,5],[12,9],[16,13],[20,17]]) {
      const dTip = Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
      const dMcp = Math.hypot(lm[mcp].x - wrist.x, lm[mcp].y - wrist.y);
      if (dTip < dMcp * 1.15) folded++;
    }
    const fist = folded >= 3;

    this._raw.x = nx; this._raw.y = ny; this._raw.depth = depth; this._raw.tilt = tilt;
    this._pushHist(now, nx, ny);
    this._draw(lm, { pinch, fist });
    this._finish(dt, pinch, fist);
  }

  _pushHist(now, x, y) {
    this._hist.push({ t: now, x, y });
    while (this._hist.length > 2 && now - this._hist[0].t > 120) this._hist.shift();
  }

  _finish(dt, pinch, fist) {
    const h = this.hand;
    const F = this._filt;

    h.x = F.x.filter(this._raw.x, dt);
    h.y = F.y.filter(this._raw.y, dt);
    h.depth = F.depth.filter(this._raw.depth, dt);
    h.tilt = F.tilt.filter(this._raw.tilt, dt);

    // hız: son ~120 ms
    const first = this._hist[0], last = this._hist[this._hist.length - 1];
    if (first && last && last.t > first.t) {
      const s = (last.t - first.t) / 1000;
      h.vx = (last.x - first.x) / s;
      h.vy = (last.y - first.y) / s;
    } else { h.vx = 0; h.vy = 0; }
    h.speed = Math.hypot(h.vx, h.vy);

    // --- savurma durum makinesi ---
    // Bir savuruş "kurulur", 350 ms boyunca açık kalır: temas savuruşun
    // zirvesindeki güçle olur, yavaşlarken vurunca güç kaybolmaz.
    const sw = this.swing;
    sw.since += dt;
    if (h.speed > 1.8) {
      if (!sw.armed || h.speed > sw.peak) {
        sw.peak = Math.max(sw.peak, h.speed);
        sw.dirX = h.vx; sw.dirY = h.vy;
      }
      sw.armed = true;
      sw.since = 0;
      sw.t = Math.min(1, sw.t + dt * 5);
    } else if (sw.since > 0.35) {
      sw.armed = false;
      sw.peak = 0;
      sw.t = Math.max(0, sw.t - dt * 3);
    }
    h.swingPeak = sw.peak;
    h.swingArmed = sw.armed;
    h.swingDirX = sw.dirX;
    h.swingDirY = sw.dirY;

    h.pinchEdge = pinch && !this._prevPinch;
    h.fistEdge = fist && !this._prevFist;
    this._prevPinch = pinch; this._prevFist = fist;
    h.pinch = pinch; h.fist = fist;
  }

  // ---------- iskelet çizimi ----------
  _draw(lm, flags = {}) {
    const c = this.ctx, W = this.overlay.width, H = this.overlay.height;
    c.clearRect(0, 0, W, H);
    if (!lm) return;

    const col = flags.fist ? '#ff9f43' : flags.pinch ? '#38e8ff' : '#d8ff3e';
    c.strokeStyle = col;
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      c.beginPath();
      c.moveTo(lm[a].x * W, lm[a].y * H);
      c.lineTo(lm[b].x * W, lm[b].y * H);
      c.stroke();
    }
    c.fillStyle = col;
    for (let i = 0; i < lm.length; i++) {
      const r = (i === 4 || i === 8 || i === 0) ? 4.2 : 2.6;
      c.beginPath();
      c.arc(lm[i].x * W, lm[i].y * H, r, 0, Math.PI * 2);
      c.fill();
    }
  }
}
