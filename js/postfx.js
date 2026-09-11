import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/** Ton + vinyet + kromatik sapma + film grenli son geçiş. */
const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uVignette:  { value: 0.42 },
    uAberration:{ value: 0.0016 },
    uGrain:     { value: 0.035 },
    uSaturation:{ value: 1.10 },
    uContrast:  { value: 1.045 },
    uImpact:    { value: 0.0 },     // vuruş anında kısa parlama
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberration, uGrain, uSaturation, uContrast, uImpact;

    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // kromatik sapma: kenarlara doğru artar
      float ab = uAberration * (1.0 + uImpact * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab * 1.00).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab * 1.00).b;

      // kontrast + doygunluk
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);

      // vinyet
      float vig = smoothstep(0.95, 0.18, r2 * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette);

      // vuruş parlaması
      col += uImpact * 0.16;

      // film greni
      float g = rand(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (1.0 - l * 0.6);

      gl_FragColor = vec4(clamp(col, 0.0, 1.4), 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.enabled = true;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.62, 0.86
    );
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass(innerWidth, innerHeight);
    this.composer.addPass(this.smaa);

    this.resize();
  }

  setBloom({ strength, radius, threshold }) {
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
  }

  /** Kısa süreli vuruş parlaması */
  impact(v = 1) { this.grade.uniforms.uImpact.value = Math.min(1, this.grade.uniforms.uImpact.value + v); }

  update(dt, time) {
    const u = this.grade.uniforms;
    u.uTime.value = time;
    u.uImpact.value = Math.max(0, u.uImpact.value - dt * 4.5);
  }

  resize(pixelRatio) {
    const w = innerWidth, h = innerHeight;
    if (pixelRatio) this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  render() { this.composer.render(); }
}
