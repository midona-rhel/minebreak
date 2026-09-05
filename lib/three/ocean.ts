import * as THREE from 'three';
import { shorelineRadius } from './terrain';

/** Sea, foam and spray share a clock so a splash is attached to a breaking crest. */
export const SEA_LEVEL = -2.65;
const TAU = Math.PI * 2;
const waveDirections = [
  [0.92, 0.39, 0.115, 1.25, 1.1],
  [-0.36, 0.93, 0.065, 2.1, 1.55],
  [0.72, -0.69, 0.035, 3.7, 2.05],
] as const;

function coastDistance(x: number, z: number) {
  return Math.hypot(x, z) - shorelineRadius(Math.atan2(z, x));
}

export function sampleWave(x: number, z: number, time: number) {
  let y = SEA_LEVEL;
  for (const [dx, dz, amplitude, frequency, speed] of waveDirections)
    y += amplitude * Math.sin((x * dx + z * dz) * frequency - time * speed);
  const d = coastDistance(x, z);
  return y + 0.075 * Math.sin(d * 3.4 - time * 1.65) * Math.exp(-d * d * 0.035);
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
  vec2 dirs[3]; dirs[0]=vec2(.92,.39); dirs[1]=vec2(-.36,.93); dirs[2]=vec2(.72,-.69);
  float amps[3]; amps[0]=.115; amps[1]=.065; amps[2]=.035;
  float freq[3]; freq[0]=1.25; freq[1]=2.1; freq[2]=3.7;
  float speed[3]; speed[0]=1.1; speed[1]=1.55; speed[2]=2.05;
  for(int i=0;i<3;i++) {
    float a=dot(p,dirs[i])*freq[i]-t*speed[i];
    wave.x+=amps[i]*sin(a);
    wave.yz+=amps[i]*freq[i]*cos(a)*dirs[i];
  }
  float d=coast(p), falloff=exp(-d*d*.035), phase=d*3.4-t*1.65;
  wave.x+=.075*sin(phase)*falloff;
  wave.yz+=.075*falloff*(3.4*cos(phase)-.07*d*sin(phase))*coastGradient(p);
  return wave;
}
`;

const noiseGLSL = `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
`;

export function createOcean() {
  const group = new THREE.Group();
  group.name = 'ocean-and-breaking-surf';
  const uniformTime = { value: 0 };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: uniformTime },
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
      varying vec3 vWorld;
      ${waveGLSL}
      ${noiseGLSL}
      void main() {
        vec2 p=vWorld.xz;
        float d=coast(p);
        if(d < -1.7) discard;
        vec3 wave=oceanWave(p,uTime);
        // The same derivative as displacement, with only subpixel ripples added here.
        vec2 detail=vec2(cos(p.x*10.1+p.y*4.7-uTime*2.2),cos(p.y*9.3-p.x*3.6-uTime*1.8))*.028;
        vec3 n=normalize(vec3(-wave.y-detail.x,1.,-wave.z-detail.y));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 lightDir=normalize(vec3(-.65,.85,.25));
        float fresnel=.025+.975*pow(1.-max(dot(n,viewDir),0.),5.);
        float shallows=exp(-max(d,0.)*.27);
        vec3 deep=vec3(.022,.14,.23), shallow=vec3(.045,.40,.34);
        vec3 water=mix(deep,shallow,shallows);
        // Sandy submerged shelf gives the water depth instead of a flat painted fill.
        float caustic=pow(.5+.5*sin(p.x*5.1+sin(p.y*3.1-uTime)*1.7+uTime),11.);
        water+=vec3(.08,.115,.055)*caustic*shallows;
        vec3 sky=mix(vec3(.26,.43,.57),vec3(.77,.68,.48),pow(max(dot(reflect(-viewDir,n),lightDir),0.),3.));
        water=mix(water,sky,fresnel*.75);
        float specular=pow(max(dot(n,normalize(lightDir+viewDir)),0.),155.);
        water+=vec3(1.5,1.14,.65)*specular*.75;
        float breaking=.5+.5*sin(d*3.4-uTime*1.65);
        float turbulent=noise(p*3.6+vec2(uTime*.2,-uTime*.11))*.6+noise(p*8.5-uTime*.16)*.4;
        float rim=exp(-pow((d-.4+wave.x*.75)*1.7,2.));
        float froth=smoothstep(.49,.72,turbulent+breaking*.22)*rim;
        // A fading second wash rolls outward; broken coverage avoids contour-line rings.
        float wash=exp(-pow((d-1.05-.25*sin(uTime*1.65))*2.5,2.));
        froth=max(froth,wash*smoothstep(.59,.76,turbulent)*.62);
        water=mix(water,vec3(.77,.88,.78),froth*.9);
        float horizon=1.-exp(-max(length(p)-18.,0.)*.028);
        water=mix(water,vec3(.23,.39,.48),horizon*.55);
        gl_FragColor=vec4(water,1.);
      }
    `,
  });
  // Concentrate vertices around the island while still covering the distant ocean.
  const geometry = new THREE.PlaneGeometry(2, 2, 224, 224);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const stretch = (v: number) =>
      Math.sign(v) * (Math.abs(v) * 13 + Math.pow(Math.abs(v), 4) * 55);
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
    opacity: 0.7,
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
  const period = TAU / 1.65;
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
      phase: (coastDistance(p.x, p.y) * 3.4 - Math.PI / 2) / 1.65,
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
      if (age > lifetime) {
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
    dispose() {
      geometry.dispose();
      waterMaterial.dispose();
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
