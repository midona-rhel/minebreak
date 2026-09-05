import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Focus the miniature, soften the distant sea, and bloom only bright surfaces. */
export function createSceneEffects(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.22;
  room.dispose();
  generator.dispose();

  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  const focus = new BokehPass(scene, camera, {
    focus: 22,
    aperture: 0.0008,
    maxblur: 0.012,
  });
  // Keep the whole game board legible: only distances outside its focal band blur.
  focus.materialBokeh.fragmentShader =
    focus.materialBokeh.fragmentShader.replace(
      'float factor = ( focus + viewZ );',
      'float factor = sign(focus + viewZ) * max(0.0, abs(focus + viewZ) - 5.0);',
    );
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 1.12);
  const output = new OutputPass();
  composer.addPass(render);
  composer.addPass(focus);
  composer.addPass(bloom);
  composer.addPass(output);
  const renderFocus = focus.render.bind(focus);
  focus.render = (...args: Parameters<typeof focus.render>) => {
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
      for (const pass of [render, focus, bloom, output]) pass.dispose();
      composer.dispose();
      scene.environment = null;
      environment.dispose();
    },
  };
}
