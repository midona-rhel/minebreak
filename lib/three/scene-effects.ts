import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDiffuseBounce } from './diffuse-bounce.ts';

/** Focus the miniature, soften the distant sea, and bloom only bright surfaces. */
export function createSceneEffects(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const room = new RoomEnvironment();
  // Tint the capture itself: warm broad sources and cool environment fill,
  // rather than a neutral white studio reflected in every facet.
  room.traverse((object) => {
    if (object instanceof THREE.PointLight) object.color.setHex(0xffd5a2);
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      const material = object.material as THREE.MeshStandardMaterial;
      if (material.color)
        material.color.setHex(object.position.x < 0 ? 0xffd6a1 : 0x91b0ed);
    }
  });
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.16;
  room.dispose();
  generator.dispose();

  // The renderer's default-framebuffer antialiasing does not cover the composer.
  // Multisample the actual scene target so bevels and fine crystal edges stay clean.
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, sceneTarget);
  composer.setPixelRatio(renderer.getPixelRatio());
  const render = new RenderPass(scene, camera);
  // Short-range contact shading gives bevels, moss and masonry weight without
  // painting permanent shadows into assets that can be viewed from every side.
  const contact = new GTAOPass(scene, camera, 1, 1);
  contact.updateGtaoMaterial({
    radius: 0.42,
    thickness: 0.65,
    distanceExponent: 1.4,
    distanceFallOff: 0.8,
    scale: 1,
    samples: 16,
    screenSpaceRadius: false,
  });
  contact.blendIntensity = 0.85;
  contact.updatePdMaterial({ radius: 4, samples: 8, rings: 2 });
  const bounce = createDiffuseBounce(
    contact.depthTexture,
    contact.normalTexture,
    camera,
  );
  const focus = new BokehPass(scene, camera, {
    focus: 22,
    aperture: 0.00035,
    maxblur: 0.006,
  });
  // Keep the whole game board legible: only distances outside its focal band blur.
  focus.materialBokeh.fragmentShader =
    focus.materialBokeh.fragmentShader.replace(
      'float factor = ( focus + viewZ );',
      'float factor = sign(focus + viewZ) * max(0.0, abs(focus + viewZ) - 6.2);',
    );
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 1.4);
  const output = new OutputPass();
  composer.addPass(render);
  composer.addPass(contact);
  composer.addPass(bounce);
  composer.addPass(focus);
  composer.addPass(bloom);
  composer.addPass(output);
  const renderContact = contact.render.bind(contact);
  contact.render = (...args: Parameters<typeof contact.render>) => {
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.visible && object.userData.noDofDepth) {
        object.visible = false;
        hidden.push(object);
      }
    });
    try {
      renderContact(...args);
    } finally {
      renderer.shadowMap.autoUpdate = shadowUpdate;
      hidden.forEach((object) => {
        object.visible = true;
      });
    }
  };
  const renderFocus = focus.render.bind(focus);
  focus.render = (...args: Parameters<typeof focus.render>) => {
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.visible && object.userData.noDofDepth) {
        object.visible = false;
        hidden.push(object);
      }
    });
    try {
      renderFocus(...args);
    } finally {
      renderer.shadowMap.autoUpdate = shadowUpdate;
      hidden.forEach((object) => {
        object.visible = true;
      });
    }
  };
  const focusUniforms = focus.uniforms as Record<string, { value: number }>;
  return {
    render: () => {
      focusUniforms.focus.value = camera.position.length();
      composer.render();
    },
    resize: (width: number, height: number) => composer.setSize(width, height),
    dispose: () => {
      for (const pass of [render, contact, bounce, focus, bloom, output])
        pass.dispose();
      composer.dispose();
      scene.environment = null;
      environment.dispose();
    },
  };
}
