/**
 * PRISMA ATLAS — MP4 Video & Thermal Shader Material
 * Blends playing HTML5 MP4 Video Texture with Thermal Ironbow Color Spectrum
 * and scroll-driven expanding aperture mask.
 */
import * as THREE from 'three';

export const VideoMaskShader = {
  uniforms: {
    uTexture: { value: null as THREE.Texture | null },
    uHasVideo: { value: 0.0 },
    uMaskProgress: { value: 0.0 },
    uTime: { value: 0.0 },
    uParallaxOffset: { value: new THREE.Vector2(0, 0) },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    uniform vec2 uParallaxOffset;

    void main() {
      vUv = uv + uParallaxOffset * 0.15;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D uTexture;
    uniform float uHasVideo;
    uniform float uMaskProgress;
    uniform float uTime;
    uniform vec2 uParallaxOffset;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    // Ironbow thermal color mapping
    vec3 ironbowPalette(float t) {
      t = clamp(t, 0.0, 1.0);
      if (t < 0.2) return mix(vec3(0.05, 0.02, 0.3), vec3(0.3, 0.05, 0.6), t / 0.2);
      if (t < 0.45) return mix(vec3(0.3, 0.05, 0.6), vec3(0.95, 0.2, 0.1), (t - 0.2) / 0.25);
      if (t < 0.75) return mix(vec3(0.95, 0.2, 0.1), vec3(1.0, 0.85, 0.05), (t - 0.45) / 0.3);
      return mix(vec3(1.0, 0.85, 0.05), vec3(1.0, 1.0, 0.95), (t - 0.75) / 0.25);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 st = (vUv - center);
      float dist = length(st);

      // Organic noise aperture boundary
      float n = noise(st * 10.0 + uTime * 0.5) * 0.06;
      float targetRadius = mix(0.0, 0.85, smoothstep(0.05, 0.95, uMaskProgress));
      float maskEdge = smoothstep(targetRadius + 0.05, targetRadius - 0.02, dist + n);

      vec3 finalColor = vec3(0.0);

      if (uHasVideo > 0.5) {
        vec4 texColor = texture2D(uTexture, vUv);
        // Thermal heat blend over MP4 video
        float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 thermalColor = ironbowPalette(gray);
        finalColor = mix(texColor.rgb, thermalColor, 0.65);
      } else {
        // Procedural thermal simulation
        float sowBody = smoothstep(0.4, 0.0, length(vUv - vec2(0.5, 0.5)));
        float heat = sowBody * 0.9 + noise(vUv * 15.0 + uTime * 0.3) * 0.2;
        finalColor = ironbowPalette(clamp(heat, 0.0, 1.0));
      }

      // Cybernetic scanning reticle ring
      float reticleRing = abs(dist - targetRadius) < 0.015 ? 1.0 : 0.0;
      vec3 reticleColor = vec3(0.38, 0.4, 0.98);
      finalColor = mix(finalColor, reticleColor, reticleRing * maskEdge);

      float alpha = maskEdge * smoothstep(0.01, 0.1, uMaskProgress) * 0.9;

      gl_FragColor = vec4(finalColor, alpha);
    }
  `,
};

export function createVideoMaskMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(VideoMaskShader.uniforms),
    vertexShader: VideoMaskShader.vertexShader,
    fragmentShader: VideoMaskShader.fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
