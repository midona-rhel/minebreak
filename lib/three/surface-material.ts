import * as THREE from 'three';
const atlases = new WeakMap<THREE.Material, THREE.Texture>();

export function bindDioramaAtlas(root: THREE.Object3D, atlas: THREE.Texture) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material.userData.dioramaSurface) continue;
      atlases.set(material, atlas);
      material.needsUpdate = true;
    }
  });
}

/** World-space pigment, roughness and shallow relief, independent of UV seams.
 * This is procedural surface texturing, not a post-process color filter.
 * Reapply to ObjectLoader materials using their serialized dioramaSurface tag.
 */
export function applyDioramaSurface<T extends THREE.MeshStandardMaterial>(
  material: T,
): T {
  material.userData.dioramaSurface = true;
  material.roughness = 0.72;
  material.onBeforeCompile = (shader) => {
    const atlas = atlases.get(material);
    shader.uniforms.craftAtlas = { value: atlas ?? null };
    shader.uniforms.useCraftAtlas = { value: Boolean(atlas?.image) };
    shader.uniforms.craftKind = { value: material.userData.surfaceKind ?? 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vCraftPosition;
      varying vec3 vCraftNormal;
    `,
      )
      .replace(
        '#include <project_vertex>',
        `
      #include <project_vertex>
      vec4 craftPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        craftPosition = instanceMatrix * craftPosition;
      #endif
      vCraftPosition = (modelMatrix * craftPosition).xyz;
      vCraftNormal = normalize(mat3(modelMatrix) * objectNormal);
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vCraftPosition;
      varying vec3 vCraftNormal;
      uniform sampler2D craftAtlas;
      uniform bool useCraftAtlas;
      uniform float craftKind;
      vec3 craftTexture(vec3 p, vec2 quadrant) {
        vec3 weights = pow(abs(normalize(vCraftNormal)), vec3(8.));
        weights /= max(.0001,weights.x+weights.y+weights.z);
        vec2 uvX = fract(p.zy), uvY = fract(p.xz), uvZ = fract(p.xy);
        return texture2D(craftAtlas,quadrant+.008+uvX*.484).rgb*weights.x
          + texture2D(craftAtlas,quadrant+.008+uvY*.484).rgb*weights.y
          + texture2D(craftAtlas,quadrant+.008+uvZ*.484).rgb*weights.z;
      }
      float craftHash(vec3 p) {
        p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float craftNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(mix(craftHash(i),craftHash(i+vec3(1,0,0)),f.x),
          mix(craftHash(i+vec3(0,1,0)),craftHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(craftHash(i+vec3(0,0,1)),craftHash(i+vec3(1,0,1)),f.x),
          mix(craftHash(i+vec3(0,1,1)),craftHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float craftRelief(vec3 p) {
        return craftNoise(p*19.)*.72 + craftNoise(p*57.)*.2 + craftNoise(p*113.)*.08;
      }
    `,
      )
      .replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      float mossSurface = smoothstep(.025,.09,diffuseColor.g-diffuseColor.b)
        * smoothstep(-.02,.035,diffuseColor.g-diffuseColor.r);
      float largePigment = craftNoise(vCraftPosition*3.7);
      float grain = craftNoise(vCraftPosition*48.);
      float pores = smoothstep(.66,.81,craftNoise(vCraftPosition*93.));
      float islands = smoothstep(.44,.66,craftNoise(vCraftPosition*13.));
      diffuseColor.rgb *= .86 + largePigment*.26 + (grain-.5)*.055;
      diffuseColor.rgb *= 1. - pores * .17;
      diffuseColor.rgb = mix(diffuseColor.rgb,
        diffuseColor.rgb * vec3(1.10,1.065,.82), islands*mossSurface*.36);
      float paintedRelief = 0.;
      if (useCraftAtlas) {
        vec2 quadrant = vec2(.5,.5);
        vec3 averagePigment = vec3(.485,.391,.267);
        float textureScale = 1.1;
        if (craftKind > 1.5 && craftKind < 2.5) {
          quadrant=vec2(0.); averagePigment=vec3(.091,.082,.105); textureScale=.72;
        }
        if (craftKind > 2.5) {
          quadrant=vec2(.5,0.); averagePigment=vec3(.314,.125,.027); textureScale=1.2;
        }
        if (mossSurface > .5) {
          quadrant=vec2(0.,.5); averagePigment=vec3(.224,.301,.0103); textureScale=1.4;
        }
        vec3 painted = craftTexture(vCraftPosition*textureScale,quadrant);
        diffuseColor.rgb *= mix(vec3(1.),clamp(painted/(averagePigment+.01),.62,1.65),.78);
        paintedRelief = dot(painted,vec3(.2126,.7152,.0722));
      }
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (grain-.5)*.2 - islands*.07, .48, .95);
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      float surfaceHeight = craftRelief(vCraftPosition) * mix(.004,.007,mossSurface) + paintedRelief*.014;
      vec3 craftDx = dFdx(-vViewPosition), craftDy = dFdy(-vViewPosition);
      vec3 craftR1 = cross(craftDy, normal), craftR2 = cross(normal, craftDx);
      float craftDet = dot(craftDx, craftR1);
      vec3 craftGradient = sign(craftDet) * (dFdx(surfaceHeight)*craftR1 + dFdy(surfaceHeight)*craftR2);
      normal = normalize(abs(craftDet)*normal - craftGradient);
    `,
      );
  };
  material.customProgramCacheKey = () => 'minebreak-crafted-surface-v2';
  return material;
}

export function restoreDioramaSurfaces(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        material instanceof THREE.MeshStandardMaterial &&
        material.userData.dioramaSurface
      )
        applyDioramaSurface(material);
    }
  });
}
