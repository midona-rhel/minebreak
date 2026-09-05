import * as THREE from 'three';
import { shorelineRadius } from './terrain.ts';

/** Sea, foam and spray share a clock so a splash is attached to a breaking crest. */
export const SEA_LEVEL = -2.65;
const TAU = Math.PI * 2;
export type SurfObstacle = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
};

/** Periodic normal fields, not one image translated over the entire ocean. */
export function createOceanNormalMap(seed: number) {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  const noise = (u: number, v: number, cells: number) => {
    const x = u * cells,
      y = v * cells,
      ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy,
      sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    const hash = (a: number, b: number) => {
      a = ((a % cells) + cells) % cells;
      b = ((b % cells) + cells) % cells;
      const value = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
      return value - Math.floor(value);
    };
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
      THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
      sy,
    );
  };
  const height = (x: number, y: number) =>
    noise(x / size, y / size, 5) * 0.6 +
    noise(x / size, y / size, 11) * 0.28 +
    noise(x / size, y / size, 23) * 0.12;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * 3.2;
      const dz = (height(x, y + 1) - height(x, y - 1)) * 3.2;
      const n = new THREE.Vector3(-dx, 1, -dz).normalize();
      const index = (y * size + x) * 4;
      data[index] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = `ocean-normal-${seed}`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
const waveDirections = [
  [0.92, 0.39, 0.105, 0.47, 0.79, 0.3],
  [0.74, 0.67, 0.062, 0.72, 1.03, 2.1],
  [-0.36, 0.93, 0.027, 1.35, 1.41, 4.7],
  [0.72, -0.69, 0.018, 2.13, 1.83, 1.2],
  [0.98, -0.2, 0.012, 3.2, 2.12, 3.4],
] as const;

function coastDistance(x: number, z: number) {
  return Math.hypot(x, z) - shorelineRadius(Math.atan2(z, x));
}

export function sampleWave(x: number, z: number, time: number) {
  let y = SEA_LEVEL;
  for (const [dx, dz, amplitude, frequency, speed, phase] of waveDirections)
    y +=
      amplitude *
      Math.sin((x * dx + z * dz) * frequency - time * speed + phase);
  return y;
}

export function sampleWaveNormal(x: number, z: number, time: number) {
  let gradientX = 0,
    gradientZ = 0;
  for (const [dx, dz, amplitude, frequency, speed, phase] of waveDirections) {
    const gradient =
      amplitude *
      frequency *
      Math.cos((x * dx + z * dz) * frequency - time * speed + phase);
    gradientX += dx * gradient;
    gradientZ += dz * gradient;
  }
  return new THREE.Vector3(-gradientX, 1, -gradientZ).normalize();
}

const coastGLSL = `
float shoreline(float angle) {
  float c=abs(cos(angle)),s=abs(sin(angle));
  return 5.66/pow(pow(c,6.)+pow(s,6.),1./6.)*(1.+sin(angle*7.)*.012+sin(angle*13.)*.006);
}
float coast(vec2 p) {
  return length(p)-shoreline(atan(p.y,p.x));
}
vec2 coastGradient(vec2 p) {
  float radius=max(length(p),.0001),angle=atan(p.y,p.x);
  float c=cos(angle),s=sin(angle),sum=pow(abs(c),6.)+pow(abs(s),6.);
  float sumDerivative=6.*(-c*c*c*c*c*s+s*s*s*s*s*c);
  float variation=1.+sin(angle*7.)*.012+sin(angle*13.)*.006;
  float variationDerivative=cos(angle*7.)*.084+cos(angle*13.)*.078;
  float derivative=5.66/pow(sum,1./6.)*(variationDerivative-variation*sumDerivative/(6.*sum));
  return p/radius-derivative*vec2(-p.y,p.x)/(radius*radius);
}
`;

const waveGLSL = `
${coastGLSL}
// x is elevation; yz are analytic partial derivatives with respect to world xz.
vec3 oceanWave(vec2 p,float t) {
  vec3 wave=vec3(0.);
  ${waveDirections
    .map(
      ([dx, dz, amplitude, frequency, speed, phase], index) => `
  float phase${index}=dot(p,vec2(${dx},${dz}))*${frequency}-t*${speed}+${phase};
  wave.x+=${amplitude}*sin(phase${index});
  wave.yz+=${amplitude * frequency}*cos(phase${index})*vec2(${dx},${dz});`,
    )
    .join('')}
  return wave;
}
`;

const noiseGLSL = `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
  float result=noise(p)*.57;
  p=mat2(.8,-.6,.6,.8)*p*2.13+17.4;
  result+=noise(p)*.28;
  p=mat2(.6,.8,-.8,.6)*p*2.07+9.1;
  return result+noise(p)*.15;
}
`;

export function createOcean() {
  const group = new THREE.Group();
  group.name = 'ocean-and-breaking-surf';
  const uniformTime = { value: 0 };
  const normalMaps = [
    createOceanNormalMap(11),
    createOceanNormalMap(29),
    createOceanNormalMap(47),
  ];
  const obstacles = Array.from({ length: 8 }, () => new THREE.Vector4());
  const obstacleCount = { value: 0 };
  const reflection = new THREE.WebGLRenderTarget(768, 768, {
    type: THREE.HalfFloatType,
  });
  const refraction = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  refraction.texture.name = 'underwater-scene-color';
  const viewport = new THREE.Vector2(1, 1);
  const inverseProjection = new THREE.Matrix4();
  const reflectionMatrix = new THREE.Matrix4();
  const mirror = new THREE.PerspectiveCamera();
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniformTime,
      uHorizon: { value: new THREE.Color(0xb5d0d6) },
      uReflection: { value: reflection.texture },
      uReflectionMatrix: { value: reflectionMatrix },
      uRefraction: { value: refraction.texture },
      uSceneDepth: { value: refraction.depthTexture },
      uViewport: { value: viewport },
      uInverseProjection: { value: inverseProjection },
      uSwellNormal: { value: normalMaps[0] },
      uCrossNormal: { value: normalMaps[1] },
      uRippleNormal: { value: normalMaps[2] },
      uIslets: { value: obstacles },
      uIsletCount: obstacleCount,
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      ${waveGLSL}
      void main() {
        vec3 p=position;
        p.y+=oceanWave(p.xz,uTime).x;
        vWorld=(modelMatrix*vec4(p,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHorizon;
      uniform sampler2D uReflection;
      uniform sampler2D uRefraction,uSceneDepth;
      uniform vec2 uViewport;
      uniform mat4 uInverseProjection;
      uniform sampler2D uSwellNormal,uCrossNormal,uRippleNormal;
      uniform vec4 uIslets[8];
      uniform int uIsletCount;
      uniform mat4 uReflectionMatrix;
      varying vec3 vWorld;
      ${waveGLSL}
      ${noiseGLSL}
      float sceneDistance(vec2 uv,float depth) {
        vec4 p=uInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
        return length(p.xyz/p.w);
      }
      void main() {
        vec2 p=vWorld.xz;
        float d=coast(p);
        for(int i=0;i<8;i++) {
          if(i>=uIsletCount) break;
          vec4 island=uIslets[i];
          float shore=(length((p-island.xy)/island.zw)-1.)*min(island.z,island.w);
          d=min(d,shore);
        }
        if(d < -1.7) discard;
        vec3 wave=oceanWave(p,uTime);
        // Three unrelated periodic normal maps, different scales, directions and
        // clocks: swell, crossing waves and small wind ripples.
        vec2 warp=vec2(noise(p*.17+uTime*.013),noise(p*.19+17.-uTime*.011))*.15;
        vec2 swell=texture2D(uSwellNormal,p*.083+warp+vec2(-uTime*.014,uTime*.007)).rg*2.-1.;
        vec2 crossWave=texture2D(uCrossNormal,mat2(.6,-.8,.8,.6)*p*.193-warp+vec2(uTime*.021,-uTime*.013)).rg*2.-1.;
        vec2 ripple=texture2D(uRippleNormal,p*.517+warp*.4+vec2(-uTime*.031,-uTime*.023)).rg*2.-1.;
        vec2 detail=swell*.5+crossWave*.34+ripple*.17;
        float waveVisibility=1.-smoothstep(12.,50.,length(p))*.985;
        vec3 n=normalize(vec3((-wave.y-detail.x)*waveVisibility,1.,(-wave.z-detail.y)*waveVisibility));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 lightDir=normalize(vec3(-.65,.85,.25));
        float fresnel=.025+.975*pow(1.-max(dot(n,viewDir),0.),5.);
        float shallows=exp(-max(d,0.)*.72);
        vec3 deep=vec3(.006,.039,.075), shallow=vec3(.026,.18,.142);
        vec3 water=mix(deep,shallow,shallows);
        // Color and depth of the actual scene behind the water. Absorption is
        // exponential in the ray's underwater distance (Beer-Lambert), not alpha
        // guessed from distance to the island center.
        vec2 screenUv=gl_FragCoord.xy/uViewport;
        float surfaceDistance=length(cameraPosition-vWorld);
        float rawDepth=texture2D(uSceneDepth,screenUv).x;
        float opticalDepth=rawDepth>.9999?30.:max(0.,sceneDistance(screenUv,rawDepth)-surfaceDistance);
        vec3 viewNormal=mat3(viewMatrix)*n;
        vec2 refractedUv=clamp(screenUv+viewNormal.xy*.016*min(opticalDepth,2.),.002,.998);
        float refractedDepth=texture2D(uSceneDepth,refractedUv).x;
        // Don't refract foreground dry rock across the water's silhouette.
        if(refractedDepth<.9999 && sceneDistance(refractedUv,refractedDepth)<surfaceDistance)
          refractedUv=screenUv;
        vec3 bottom=texture2D(uRefraction,refractedUv).rgb;
        vec3 transmittance=exp(-vec3(.63,.23,.14)*opticalDepth);
        vec3 transmission=bottom*transmittance+water*(1.-transmittance);
        water=mix(water,transmission,.92);
        float sandyShelf=exp(-pow((d-.25)*1.8,2.));
        water+=vec3(.038,.048,.014)*smoothstep(.56,.75,fbm(p*3.3+uTime*.08))*sandyShelf;
        vec3 reflected=reflect(-viewDir,n);
        vec3 sky=mix(uHorizon,vec3(.22,.37,.48),smoothstep(0.,.9,reflected.y));
        sky+=vec3(.13,.08,.025)*pow(max(dot(reflected,lightDir),0.),5.);
        water=mix(water,sky,.025+fresnel*.35);
        vec4 projected=uReflectionMatrix*vec4(p.x,${SEA_LEVEL},p.y,1.);
        vec2 reflectionUv=projected.xy/projected.w+n.xz*.043;
        vec3 reflectedScene=texture2D(uReflection,clamp(reflectionUv,.002,.998)).rgb;
        water=mix(water,reflectedScene,clamp(.035+fresnel*.42,0.,.55));
        float specular=pow(max(dot(n,normalize(lightDir+viewDir)),0.),110.);
        water+=vec3(.37,.29,.17)*specular;
        float breaking=smoothstep(-.035,.11,wave.x);
        float turbulent=fbm(p*4.3-vec2(uTime*.24,uTime*.15));
        float patches=smoothstep(.28,.65,fbm(p*1.3+vec2(uTime*.07,-uTime*.05)));
        float wash=exp(-pow((d+wave.x*1.5-.1)*2.6,2.));
        float roll=.58+.23*sin(uTime*.9+p.x*.12+p.y*.08);
        float breaker=exp(-pow((d-roll)*5.,2.))*breaking*patches;
        float lace=smoothstep(.29,.64,turbulent);
        float froth=wash*(.34+.66*breaking)*(.32+.68*lace)+breaker*.55;
        float whitecaps=smoothstep(.115,.19,wave.x)*smoothstep(.64,.79,turbulent)*smoothstep(1.3,3.,d);
        water=mix(water,vec3(.82,.94,.9),clamp(froth*.93+whitecaps*.45,0.,.94));
        // Match the scene background before the camera's far clip so even the
        // widest allowed orbit has no visible finite plane edge.
        float horizon=smoothstep(42.,92.,length(p));
        water=mix(water,uHorizon,horizon);
        gl_FragColor=vec4(water,1.);
      }
    `,
  });
  // One continuous mesh: dense near the dollhouse, sparse out to two kilometres.
  const geometry = new THREE.PlaneGeometry(2, 2, 224, 224);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const stretch = (v: number) =>
      Math.sign(v) * (Math.abs(v) * 17 + Math.pow(Math.abs(v), 8) * 1983);
    positions.setXYZ(
      i,
      stretch(positions.getX(i)),
      SEA_LEVEL,
      stretch(positions.getZ(i)),
    );
  }
  geometry.computeBoundingSphere();
  const surface = new THREE.Mesh(geometry, waterMaterial);
  surface.name = 'analytic-wave-surface';
  surface.frustumCulled = false;
  group.add(surface);

  const dropletGeometry = new THREE.IcosahedronGeometry(0.026, 0);
  const dropletMaterial = new THREE.MeshBasicMaterial({
    color: 0xbce9df,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const count = 144;
  const spray = new THREE.InstancedMesh(
    dropletGeometry,
    dropletMaterial,
    count,
  );
  spray.name = 'crest-synchronized-splash-droplets';
  spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spray.frustumCulled = false;
  group.add(spray);
  const dummy = new THREE.Object3D();
  const period = TAU / waveDirections[0][4];
  // Twelve bursts around the actual beach contour. Their cycle follows the shore wave.
  const sources = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * TAU + 0.13;
    const radius = shorelineRadius(angle) + 0.04 + (index % 3) * 0.07;
    const p = new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
    const epsilon = 0.01;
    const normal = new THREE.Vector2(
      coastDistance(p.x + epsilon, p.y) - coastDistance(p.x - epsilon, p.y),
      coastDistance(p.x, p.y + epsilon) - coastDistance(p.x, p.y - epsilon),
    ).normalize();
    return {
      p,
      normal,
      phase:
        ((p.x * waveDirections[0][0] + p.y * waveDirections[0][1]) *
          waveDirections[0][3] +
          waveDirections[0][5] -
          Math.PI / 2) /
        waveDirections[0][4],
    };
  });

  function update(time: number) {
    uniformTime.value = time;
    for (let i = 0; i < count; i++) {
      const source = sources[Math.floor(i / 12)],
        particle = i % 12;
      const age =
        (((time - source.phase - particle * 0.018) % period) + period) % period;
      const lifetime = 0.56 + (particle % 4) * 0.07;
      const birthTime = time - age;
      const crest = sampleWave(source.p.x, source.p.y, birthTime) - SEA_LEVEL;
      if (age > lifetime || crest < 0.09) {
        dummy.scale.setScalar(0);
      } else {
        const spread = Math.sin(i * 14.31) * 0.16;
        const outward = (0.2 + (particle % 5) * 0.08) * age;
        const birthHeight = sampleWave(source.p.x, source.p.y, time - age);
        dummy.position.set(
          source.p.x + source.normal.x * outward - source.normal.y * spread,
          birthHeight + (1.55 + (particle % 4) * 0.24) * age - 2.7 * age * age,
          source.p.y + source.normal.y * outward + source.normal.x * spread,
        );
        const fade = Math.sin((age / lifetime) * Math.PI);
        const size = (0.7 + (particle % 3) * 0.25) * fade;
        dummy.scale.set(size, size * (1.4 - age), size);
      }
      dummy.updateMatrix();
      spray.setMatrixAt(i, dummy.matrix);
    }
    spray.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return {
    group,
    update,
    setObstacles(islets: SurfObstacle[]) {
      obstacleCount.value = Math.min(obstacles.length, islets.length);
      islets
        .slice(0, obstacles.length)
        .forEach((islet, i) =>
          obstacles[i].set(
            islet.x,
            islet.z,
            Math.max(0.1, islet.radiusX),
            Math.max(0.1, islet.radiusZ),
          ),
        );
    },
    renderReflection(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
    ) {
      camera.updateMatrixWorld();
      renderer.getDrawingBufferSize(viewport);
      inverseProjection.copy(camera.projectionMatrixInverse);
      const ratio = Math.min(1, 1280 / Math.max(viewport.x, viewport.y));
      const width = Math.max(1, Math.round(viewport.x * ratio)),
        height = Math.max(1, Math.round(viewport.y * ratio));
      if (refraction.width !== width || refraction.height !== height)
        refraction.setSize(width, height);
      mirror.position.copy(camera.position);
      mirror.position.y = 2 * SEA_LEVEL - camera.position.y;
      const direction = camera.getWorldDirection(new THREE.Vector3());
      direction.y *= -1;
      mirror.up.copy(camera.up);
      mirror.up.y *= -1;
      mirror.lookAt(mirror.position.clone().add(direction));
      mirror.far = camera.far;
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      mirror.updateMatrixWorld();
      reflectionMatrix
        .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(mirror.projectionMatrix)
        .multiply(mirror.matrixWorldInverse);
      // Oblique near plane clips submerged geometry from the mirrored view.
      const plane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -SEA_LEVEL,
      ).applyMatrix4(mirror.matrixWorldInverse);
      const clip = new THREE.Vector4(
        plane.normal.x,
        plane.normal.y,
        plane.normal.z,
        plane.constant,
      );
      const m = mirror.projectionMatrix.elements;
      const q = new THREE.Vector4(
        (Math.sign(clip.x) + m[8]) / m[0],
        (Math.sign(clip.y) + m[9]) / m[5],
        -1,
        (1 + m[10]) / m[14],
      );
      clip.multiplyScalar(2 / clip.dot(q));
      m[2] = clip.x;
      m[6] = clip.y;
      m[10] = clip.z + 1 - 0.003;
      m[14] = clip.w;
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.visible && o.userData.noDofDepth) {
          o.visible = false;
          hidden.push(o);
        }
      });
      const previous = renderer.getRenderTarget(),
        shadowUpdate = renderer.shadowMap.autoUpdate;
      group.visible = false;
      renderer.shadowMap.autoUpdate = false;
      try {
        renderer.setRenderTarget(refraction);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(reflection);
        renderer.clear();
        renderer.render(scene, mirror);
      } finally {
        renderer.setRenderTarget(previous);
        renderer.shadowMap.autoUpdate = shadowUpdate;
        group.visible = true;
        hidden.forEach((o) => (o.visible = true));
      }
    },
    dispose() {
      reflection.dispose();
      refraction.dispose();
      geometry.dispose();
      waterMaterial.dispose();
      normalMaps.forEach((texture) => texture.dispose());
      dropletGeometry.dispose();
      dropletMaterial.dispose();
      spray.dispose();
    },
  };
}

/** Bounded single-scattering raymarch, not solid cones. Kept behind the play surface. */
export function createAtmosphere() {
  const group = new THREE.Group();
  group.name = 'sunlit-sea-mist';
  const uniformTime = { value: 0 };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: uniformTime,
      uMin: { value: new THREE.Vector3(-15, -2.3, -17) },
      uMax: { value: new THREE.Vector3(10, 13, -3.8) },
    },
    vertexShader:
      'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}',
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uMin,uMax;
      ${noiseGLSL}
      void main(){
        vec3 direction=normalize(vWorld-cameraPosition);
        vec3 inv=1./(direction+vec3(.000001));
        vec3 a=(uMin-cameraPosition)*inv,b=(uMax-cameraPosition)*inv;
        vec3 nearV=min(a,b),farV=max(a,b);
        float start=max(max(nearV.x,nearV.y),max(nearV.z,0.));
        float end=min(min(farV.x,farV.y),farV.z);
        if(end<=start) discard;
        float stepSize=min(end-start,30.)/28.;
        float jitter=hash(gl_FragCoord.xy);
        float density=0.;
        for(int i=0;i<28;i++) {
          vec3 p=cameraPosition+direction*(start+(float(i)+jitter)*stepSize);
          vec2 shaft=vec2(p.x+p.y*.72,p.z-p.y*.22);
          float beam=pow(noise(shaft*.42+uTime*.008),6.);
          float height=exp(-max(p.y+1.,0.)*.12);
          vec3 edge=min(p-uMin,uMax-p);
          float fade=smoothstep(0.,2.,min(min(edge.x,edge.y),edge.z));
          density+=(.035+beam*2.8)*height*fade*stepSize*.065;
        }
        float phase=.6+.4*pow(max(dot(direction,normalize(vec3(-.72,1.,.22))),0.),3.);
        float opacity=1.-exp(-density);
        gl_FragColor=vec4(vec3(.85,.65,.35)*phase,opacity*.25);
      }
    `,
  });
  const geometry = new THREE.BoxGeometry(25, 15.3, 13.2);
  const volume = new THREE.Mesh(geometry, material);
  volume.position.set(-2.5, 5.35, -10.4);
  volume.name = 'bounded-volumetric-light-scattering';
  volume.renderOrder = 2;
  group.add(volume);
  return {
    group,
    update(time: number) {
      uniformTime.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
