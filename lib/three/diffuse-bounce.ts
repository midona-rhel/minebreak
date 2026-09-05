import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** One short-range, screen-space diffuse bounce from visible scene surfaces.
 * Reuses GTAO's G-buffer. It cannot include occluded/offscreen contributors;
 * environment lighting provides the stable long-range indirect component.
 */
export function createDiffuseBounce(
  depth: THREE.Texture,
  normals: THREE.Texture,
  camera: THREE.PerspectiveCamera,
) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      tNormal: { value: normals },
      inverseProjection: { value: camera.projectionMatrixInverse },
      projection: { value: camera.projectionMatrix },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse, tDepth, tNormal;
      uniform mat4 inverseProjection, projection;
      vec3 positionAt(vec2 uv, float depth) {
        vec4 p = inverseProjection * vec4(uv*2.-1., depth*2.-1.,1.);
        return p.xyz/p.w;
      }
      void main() {
        vec4 source = texture2D(tDiffuse,vUv);
        float depth = texture2D(tDepth,vUv).x;
        if (depth >= .9999) { gl_FragColor = source; return; }
        vec3 p = positionAt(vUv,depth);
        vec3 n = normalize(texture2D(tNormal,vUv).xyz*2.-1.);
        vec2 radius = vec2(projection[0][0],projection[1][1])*.65/max(1.,-p.z);
        vec3 radiance = vec3(0.);
        for (int i=0; i<16; i++) {
          float angle = float(i)*2.399963;
          float ring = sqrt((float(i)+.5)/16.);
          vec2 uv = vUv + vec2(cos(angle),sin(angle))*radius*ring;
          if (any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) continue;
          float otherDepth = texture2D(tDepth,uv).x;
          if (otherDepth >= .9999) continue;
          vec3 delta = positionAt(uv,otherDepth)-p;
          float distance = length(delta);
          if (distance < .025 || distance > 1.3) continue;
          vec3 direction = delta/distance;
          vec3 emitterNormal = normalize(texture2D(tNormal,uv).xyz*2.-1.);
          float coupling = max(0.,dot(n,direction)) * max(0.,dot(emitterNormal,-direction));
          coupling *= (1.-smoothstep(.6,1.3,distance)) / (1.+distance*distance*3.);
          radiance += min(texture2D(tDiffuse,uv).rgb,vec3(2.)) * coupling;
        }
        vec3 pigment = source.rgb / max(.22,max(source.r,max(source.g,source.b)));
        // Cap the bounce to preserve the reference's deep, colored shadows.
        vec3 bounce = min(radiance*.15,vec3(.22)) * mix(vec3(.65),pigment,.6);
        gl_FragColor = vec4(source.rgb+bounce,source.a);
      }
    `,
  });
}
