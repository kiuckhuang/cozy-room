// Render pipeline: MSAA PBR -> AO -> bloom -> tone map -> cute outline / grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1280, 720) },
    outlineResolution: { value: new THREE.Vector2(1280, 720) },
    time: { value: 0 },
    near: { value: 0.05 },
    far: { value: 60 },
    outlineStrength: { value: 0.0 },
    outlineColor: { value: new THREE.Color(0x3c3657) },
    grain: { value: 0.018 },
    vignette: { value: 0.26 },
    saturation: { value: 1.05 },
    contrast: { value: 1.015 },
    warmth: { value: 0.0 },
    shadowTint: { value: new THREE.Color(0.94, 0.93, 1.04) },
    highlightTint: { value: new THREE.Color(1.03, 1.0, 0.96) },
    lift: { value: 0.012 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse, tNormal, tDepth;
    uniform vec2 resolution, outlineResolution;
    uniform float time, near, far, outlineStrength, grain, vignette, saturation, contrast, warmth, lift;
    uniform vec3 outlineColor, shadowTint, highlightTint;
    varying vec2 vUv;

    float perspectiveZ(float d){ return (near * far) / ((far - near) * d - far); }
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 fetchNormal(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

    float edgeAt(vec2 uv, vec2 offs){
      vec2 o = offs / outlineResolution;
      float dC = texture2D(tDepth, uv).x;
      float zC = perspectiveZ(dC);
      vec3 nC = fetchNormal(uv);
      float e = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 dir = i == 0 ? vec2(1.0,0.0) : i == 1 ? vec2(-1.0,0.0) : i == 2 ? vec2(0.0,1.0) : vec2(0.0,-1.0);
        vec2 uvN = uv + dir * o;
        float dN = texture2D(tDepth, uvN).x;
        float zN = perspectiveZ(dN);
        float dz = abs(zN - zC) / max(0.35, -zC);
        float nd = 1.0 - dot(nC, fetchNormal(uvN));
        e = max(e, step(0.022, dz) * 0.9 + step(0.28, nd) * 0.55);
      }
      e *= smoothstep(0.35, 1.0, -zC) * (1.0 - smoothstep(6.0, 11.0, -zC));
      return clamp(e, 0.0, 1.0);
    }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // subtle chromatic dispersion toward the corners
      float ca = 0.0006 * smoothstep(0.05, 0.6, r2);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;

      // soft illustrative edge (depth + normal)
      if (outlineStrength > 0.001) {
        float e = edgeAt(uv, vec2(0.95));
        e = max(e, edgeAt(uv, vec2(-0.95, 0.95)) * 0.85);
        e = smoothstep(0.35, 0.95, e);
        vec3 lc = outlineColor;
        float lum = dot(col, vec3(0.299,0.587,0.114));
        lc = mix(lc, lc * (0.6 + 0.6 * lum), 0.35);
        col = mix(col, lc, e * outlineStrength);
      }

      // playful pastel grade
      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, col * shadowTint, (1.0 - smoothstep(0.0, 0.45, lum)) * 0.55);
      col = mix(col, col * highlightTint, smoothstep(0.55, 1.0, lum) * 0.4);
      col += lift * (1.0 - col);
      col = (col - 0.5) * contrast + 0.5;
      lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(lum), col, saturation);
      col *= vec3(1.0 + warmth * 0.5, 1.0 + warmth * 0.08, 1.0 - warmth * 0.35);

      // gentle vignette
      float vig = smoothstep(0.85, 0.18, length(c) * 1.25);
      col *= mix(1.0, vig, vignette);

      // film grain (very light, animated)
      float n = hash(uv * resolution + time * 60.0) - 0.5;
      col += n * grain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `
};

export function createRenderPipeline({ canvas, quality = 'high', forceQuality = false }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, stencil: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x0c0a12, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.045, 60);
  camera.layers.enable(1);

  const isSoftware = (() => {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      return /swiftshader|software|llvmpipe/i.test(name);
    } catch { return false; }
  })();
  if (isSoftware && quality === 'high' && !forceQuality) quality = 'med';

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  const composer = new EffectComposer(renderer);
  if (quality !== 'low') {
    const samples = quality === 'high' ? 4 : 2;
    composer.renderTarget1.samples = samples;
    composer.renderTarget2.samples = samples;
  }
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const gtaoPass = null;

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), quality === 'high' ? 0.14 : 0.08, 0.45, 1.25);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const gradePass = new ShaderPass(GradeShader);
  gradePass.uniforms.tNormal.value = null;
  gradePass.uniforms.tDepth.value = null;
  gradePass.uniforms.outlineStrength.value = quality === 'low' ? 0.0 : (quality === 'high' ? 0.38 : 0.3);
  composer.addPass(gradePass);

  // ---- normal + depth prepass for the cute edge outline
  const outlineRT = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType, depthBuffer: true,
    depthTexture: new THREE.DepthTexture(2, 2, THREE.UnsignedIntType)
  });
  outlineRT.depthTexture.minFilter = THREE.NearestFilter;
  outlineRT.depthTexture.magFilter = THREE.NearestFilter;
  const normalMaterial = new THREE.MeshNormalMaterial();

  let width = 1, height = 1;
  function setSize(w, h) {
    width = Math.max(1, Math.floor(w));
    height = Math.max(1, Math.floor(h));
    const pr = renderer.getPixelRatio();
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    gradePass.uniforms.resolution.value.set(width * pr, height * pr);
    const ow = Math.max(2, Math.floor(width * pr * 0.75));
    const oh = Math.max(2, Math.floor(height * pr * 0.75));
    outlineRT.setSize(ow, oh);
    gradePass.uniforms.outlineResolution.value.set(ow, oh);
    bloomPass.resolution.set(width * pr, height * pr);
    if (gtaoPass) { gtaoPass.setSize(width * pr, height * pr); }
    gradePass.uniforms.near.value = camera.near;
    gradePass.uniforms.far.value = camera.far;
  }

  const clock = new THREE.Clock();
  let outlineEnabled = quality !== 'low';
  const hiddenForOutline = [];

  function render() {
    renderer.info.reset();
    if (outlineEnabled) {
      // hide non-solid helpers / transparent-only objects from the edge pass
      hiddenForOutline.length = 0;
      scene.traverse(o => {
        if (!o.isMesh) return;
        if (o.userData.noOutline) { hiddenForOutline.push(o); o.visible = false; }
      });
      const oldBg = scene.background, oldFog = scene.fog, oldOverride = scene.overrideMaterial;
      const camMask = camera.layers.mask;
      camera.layers.set(0);
      scene.overrideMaterial = normalMaterial;
      scene.background = null; scene.fog = null;
      renderer.setRenderTarget(outlineRT);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      camera.layers.mask = camMask;
      scene.overrideMaterial = oldOverride;
      scene.background = oldBg; scene.fog = oldFog;
      for (const o of hiddenForOutline) o.visible = true;
      gradePass.uniforms.tNormal.value = outlineRT.texture;
      gradePass.uniforms.tDepth.value = outlineRT.depthTexture;
    }
    gradePass.uniforms.time.value = clock.elapsedTime % 100;
    if (quality === 'low') {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  return {
    renderer, scene, camera, composer, bloomPass, gradePass, setSize, render,
    quality, isSoftware, maxAniso,
    get outlineEnabled() { return outlineEnabled; },
    setOutline(v) { outlineEnabled = v; gradePass.uniforms.outlineStrength.value = v ? (quality === 'high' ? 0.38 : 0.3) : 0; }
  };
}
