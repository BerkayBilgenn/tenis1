import * as THREE from 'three';

/* ------------------------------------------------------------------ gökyüzü */
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;
  uniform float uHazeGain;
  uniform float uStars;

  // ucuz hash tabanlı yıldız alanı
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // dikey gradyan
    float t = clamp(h * 1.15 + 0.08, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uZenith, pow(t, 0.72));

    // ufuk pusu
    float haze = pow(1.0 - clamp(abs(h) * 2.4, 0.0, 1.0), 2.5);
    sky += uHorizon * haze * uHazeGain;

    // zemin yarısı
    if (h < 0.0) sky = mix(sky, uGround, clamp(-h * 3.2, 0.0, 1.0));

    // güneş / ay
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
    float glow = pow(sd, 220.0) * 0.7 + pow(sd, 14.0) * 0.22;
    sky += uSunColor * (disc * 2.4 + glow);

    // yıldızlar
    if (uStars > 0.001 && h > -0.02) {
      vec3 cell = floor(d * 340.0);
      float s = hash(cell);
      float star = smoothstep(0.9975, 0.99995, s) * smoothstep(-0.02, 0.35, h);
      sky += vec3(star) * uStars * (0.6 + 0.4 * hash(cell + 3.1));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/* ------------------------------------------------------------------ ayarlar */
export const LOOKS = {
  day: {
    zenith:  [0.055, 0.170, 0.400],
    horizon: [0.640, 0.760, 0.880],
    ground:  [0.140, 0.230, 0.230],
    sunDir:  [-0.42, 0.30, 0.36],
    sunColor:[1.000, 0.760, 0.470],
    sunSize: 0.0055,
    haze: 0.55,
    stars: 0.0,
    keyColor: 0xffd9a8, keyIntensity: 3.4,
    fillColor: 0xbcd8ff, fillIntensity: 0.85,
    hemiSky: 0xbfdcff, hemiGround: 0x40795f, hemiIntensity: 0.85,
    fog: 0x9fc0dc, fogDensity: 0.0042,
    exposure: 1.05,
    bloom: { strength: 0.34, radius: 0.62, threshold: 0.86 },
    lampsOn: 0,
    crowdEmissive: 0.0,
  },
  night: {
    zenith:  [0.008, 0.020, 0.055],
    horizon: [0.045, 0.075, 0.145],
    ground:  [0.020, 0.035, 0.050],
    sunDir:  [0.35, 0.55, -0.60],
    sunColor:[0.190, 0.215, 0.290],
    sunSize: 0.0035,
    haze: 0.30,
    stars: 0.95,
    keyColor: 0xdfeaff, keyIntensity: 2.6,
    fillColor: 0x8fb4ff, fillIntensity: 0.45,
    hemiSky: 0x4a6a9a, hemiGround: 0x14202c, hemiIntensity: 0.35,
    fog: 0x0a1220, fogDensity: 0.0075,
    exposure: 1.18,
    bloom: { strength: 0.85, radius: 0.72, threshold: 0.62 },
    lampsOn: 1,
    crowdEmissive: 0.10,
  },
};

/* ------------------------------------------------------------------ kurulum */
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.mode = 'day';

    const L = LOOKS.day;
    this.uniforms = {
      uZenith:   { value: new THREE.Color().fromArray(L.zenith) },
      uHorizon:  { value: new THREE.Color().fromArray(L.horizon) },
      uGround:   { value: new THREE.Color().fromArray(L.ground) },
      uSunDir:   { value: new THREE.Vector3().fromArray(L.sunDir) },
      uSunColor: { value: new THREE.Color().fromArray(L.sunColor) },
      uSunSize:  { value: L.sunSize },
      uHazeGain: { value: L.haze },
      uStars:    { value: L.stars },
    };

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    scene.fog = new THREE.FogExp2(L.fog, L.fogDensity);

    // --- ışıklar ---
    this.hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    scene.add(this.hemi);

    this.key = new THREE.DirectionalLight(L.keyColor, L.keyIntensity);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const s = 17;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.022;
    this.key.shadow.radius = 2.2;
    scene.add(this.key);
    scene.add(this.key.target);

    this.fill = new THREE.DirectionalLight(L.fillColor, L.fillIntensity);
    scene.add(this.fill);

    this.rim = new THREE.DirectionalLight(0xffffff, 0.35);
    this.rim.position.set(6, 5, -18);
    scene.add(this.rim);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._envSky = this.sky.clone();
    this._envSky.material = this.sky.material;
    this._envScene.add(this._envSky);

    this.apply('day', true);
  }

  /** Işık/gökyüzü ayarlarını uygula. lamps: sahnedeki projektör materyalleri. */
  apply(mode, instant = false) {
    const L = LOOKS[mode] || LOOKS.day;
    this.mode = mode;
    this.look = L;

    this.uniforms.uZenith.value.fromArray(L.zenith);
    this.uniforms.uHorizon.value.fromArray(L.horizon);
    this.uniforms.uGround.value.fromArray(L.ground);
    this.uniforms.uSunDir.value.fromArray(L.sunDir).normalize();
    this.uniforms.uSunColor.value.fromArray(L.sunColor);
    this.uniforms.uSunSize.value = L.sunSize;
    this.uniforms.uHazeGain.value = L.haze;
    this.uniforms.uStars.value = L.stars;

    const d = this.uniforms.uSunDir.value;
    this.key.position.set(d.x * 34, Math.max(9, d.y * 34), d.z * 34);
    this.key.color.setHex(L.keyColor);
    this.key.intensity = L.keyIntensity;
    this.fill.position.set(-d.x * 22, 16, -d.z * 22);
    this.fill.color.setHex(L.fillColor);
    this.fill.intensity = L.fillIntensity;
    this.hemi.color.setHex(L.hemiSky);
    this.hemi.groundColor.setHex(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity;

    this.scene.fog.color.setHex(L.fog);
    this.scene.fog.density = L.fogDensity;
    this.renderer.toneMappingExposure = L.exposure;

    this.refreshEnvMap();
    return L;
  }

  /** Gökyüzünden IBL üret — metal/cam yüzeyler doğru yansısın. */
  refreshEnvMap() {
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this._envScene, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.mode === 'night' ? 0.55 : 1.0;
  }

  dispose() {
    if (this.envRT) this.envRT.dispose();
    this.pmrem.dispose();
  }
}
