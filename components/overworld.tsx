'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createTile,
  createFlag,
  createPortal,
  updateAssetAnimations,
  disposeObjects,
} from '@/lib/three/asset-kit';
import {
  createIslandCliff,
  createBeach,
  createSeabed,
  createFloatingRocks,
} from '@/lib/three/terrain';
import { createOcean, createAtmosphere } from '@/lib/three/ocean';
import { createScenery } from '@/lib/three/scenery';
import { createSceneEffects } from '@/lib/three/scene-effects';
import { bindDioramaAtlas } from '@/lib/three/surface-material';
import { createUnderwaterScenery } from '@/lib/three/underwater-scenery';
import { createBackgroundScenery } from '@/lib/three/background-scenery';

export type BoardCell = {
  id: number;
  mine: boolean;
  nearby: number;
  open: boolean;
  flagged: boolean;
  disarmed: boolean;
};
type Props = {
  cells: BoardCell[];
  locked: boolean;
  flagMode: boolean;
  reveal: (id: number) => void;
  flag: (id: number) => void;
};
type CameraAction = 'left' | 'right' | 'in' | 'out' | 'reset';
function numberLabel(value: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 92px Georgia';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#493e33';
  ctx.strokeText(String(value), 64, 69);
  ctx.fillStyle = [
    '',
    '#3985b8',
    '#547727',
    '#c98122',
    '#b94839',
    '#805399',
    '#187a87',
    '#533a66',
    '#665042',
  ][value];
  ctx.fillText(String(value), 64, 69);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.83, 0.83),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.044;
  return label;
}

function createRenderer() {
  try {
    return new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
}

export default function Overworld(props: Props) {
  const mount = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    redraw = useRef<() => void>(() => {}),
    focus = useRef<(id: number) => void>(() => {});
  const cameraAction = useRef<(action: CameraAction) => void>(() => {});
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    const renderer = createRenderer();
    if (!renderer) {
      const pending = requestAnimationFrame(() => setFallback(true));
      return () => cancelAnimationFrame(pending);
    }
    renderer.setPixelRatio(Math.min(2, Math.max(devicePixelRatio, 1.5)));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb5d0d6);
    scene.fog = new THREE.FogExp2(0xb5d0d6, 0.007);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.15, 160);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -0.55, 0.3);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = 1.13;
    controls.minDistance = 13.5;
    controls.maxDistance = 34;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    let defaultDistance = 23;
    const resetCamera = () => {
      camera.position
        .copy(controls.target)
        .add(
          new THREE.Vector3(0.22, 1.03, 0.95)
            .normalize()
            .multiplyScalar(defaultDistance),
        );
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
      controls.saveState();
    };
    resetCamera();
    cameraAction.current = (action) => {
      if (action === 'reset') {
        controls.reset();
        resetCamera();
        return;
      }
      const offset = camera.position.clone().sub(controls.target);
      if (action === 'left' || action === 'right')
        offset.applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          action === 'left' ? -0.24 : 0.24,
        );
      else
        offset.setLength(
          THREE.MathUtils.clamp(
            offset.length() * (action === 'in' ? 0.85 : 1.18),
            controls.minDistance,
            controls.maxDistance,
          ),
        );
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    scene.add(new THREE.HemisphereLight(0x7592cc, 0x3a3047, 0.4));
    const sun = new THREE.DirectionalLight(0xffce88, 3.5);
    sun.position.set(-10, 8, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
      near: 0.5,
      far: 42,
    });
    sun.shadow.normalBias = 0.012;
    sun.shadow.bias = -0.00005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x558bff, 1.7);
    rim.position.set(7, 3, 1);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x8b9ecf, 0.18);
    fill.position.set(4, 3, 10);
    scene.add(fill);
    RectAreaLightUniformsLib.init();
    const warmEdge = new THREE.RectAreaLight(0xffd49a, 3.5, 7, 9);
    warmEdge.position.set(-7, 7, -2);
    warmEdge.lookAt(0, 0, 0);
    scene.add(warmEdge);

    const island = new THREE.Group();
    scene.add(island);
    let disposed = false;
    const materialAtlas = new THREE.TextureLoader().load(
      '/assets/shared/diorama-material-atlas.png',
      () => {
        if (!disposed) bindDioramaAtlas(scene, materialAtlas);
      },
    );
    materialAtlas.colorSpace = THREE.SRGBColorSpace;
    materialAtlas.anisotropy = Math.min(
      8,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const cliff = createIslandCliff();
    const seabed = createSeabed();
    const underwater = createUnderwaterScenery(seabed);
    island.add(cliff, createBeach(), seabed, underwater.group);
    const scenery = createScenery(cliff);
    island.add(scenery);
    bindDioramaAtlas(island, materialAtlas);
    const rocks = createFloatingRocks();
    scene.add(rocks.group);
    const ocean = createOcean();
    scene.add(ocean.group);
    const backdrop = createBackgroundScenery('archipelago', 17);
    bindDioramaAtlas(backdrop.group, materialAtlas);
    scene.add(backdrop.group);
    ocean.setObstacles(backdrop.shorelines);
    const atmosphere = createAtmosphere();
    atmosphere.group.userData.noDofDepth = true;
    scene.add(atmosphere.group);
    const effects = createSceneEffects(renderer, scene, camera);

    const slots = new Map<number, THREE.Group>(),
      signatures = new Map<number, string>();
    const flags = new Map<number, THREE.Group>();
    const highlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 0.015, 0.98),
      new THREE.MeshBasicMaterial({
        color: 0xfff2a4,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    );
    highlight.visible = false;
    scene.add(highlight);
    focus.current = (id) => {
      const cell = latest.current.cells[id];
      highlight.position.set(
        (id % 8) - 3.5,
        cell?.open ? 0.055 : 0.225,
        Math.floor(id / 8) - 3.5,
      );
      highlight.visible = id >= 0 && !latest.current.locked;
    };
    redraw.current = () => {
      for (const c of latest.current.cells) {
        const signature = `${c.open}:${c.flagged}:${c.disarmed}:${c.open ? c.nearby : 0}`;
        if (signatures.get(c.id) === signature) continue;
        const previous = slots.get(c.id);
        if (previous) {
          island.remove(previous);
          disposeObjects(previous);
        }
        flags.delete(c.id);
        const tile =
          c.open && c.mine ? createPortal() : createTile(!c.open, c.id);
        tile.position.set((c.id % 8) - 3.5, 0, Math.floor(c.id / 8) - 3.5);
        if (c.flagged) {
          const flag = createFlag();
          tile.add(flag);
          flags.set(c.id, flag);
        }
        if (c.open && !c.mine && c.nearby) tile.add(numberLabel(c.nearby));
        tile.traverse((child) => {
          child.userData.cellId = c.id;
        });
        island.add(tile);
        bindDioramaAtlas(tile, materialAtlas);
        slots.set(c.id, tile);
        signatures.set(c.id, signature);
      }
    };
    redraw.current();

    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const down = new Map<number, THREE.Vector2>();
    let dragged = false;
    const cellAt = (event: PointerEvent | MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      );
      raycaster.setFromCamera(pointer, camera);
      // Respect scenery occlusion instead of selecting a tile through a tree or cliff.
      return raycaster.intersectObject(island, true)[0]?.object.userData
        .cellId as number | undefined;
    };
    const onDown = (event: PointerEvent) => {
      if (down.size === 0) dragged = false;
      down.set(
        event.pointerId,
        new THREE.Vector2(event.clientX, event.clientY),
      );
      if (down.size > 1) dragged = true;
    };
    const onMove = (event: PointerEvent) => {
      const start = down.get(event.pointerId);
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
      )
        dragged = true;
      const id = dragged && down.size ? undefined : cellAt(event);
      focus.current(id ?? -1);
      renderer.domElement.style.cursor =
        down.size && dragged
          ? 'grabbing'
          : id === undefined
            ? 'grab'
            : 'pointer';
    };
    const onUp = (event: PointerEvent) => down.delete(event.pointerId);
    const onCancel = (event: PointerEvent) => {
      dragged = true;
      down.delete(event.pointerId);
    };
    const onClick = (event: MouseEvent) => {
      if (dragged || latest.current.locked) return;
      const id = cellAt(event);
      if (id !== undefined)
        (latest.current.flagMode ? latest.current.flag : latest.current.reveal)(
          id,
        );
    };
    const onContext = (event: MouseEvent) => {
      event.preventDefault();
      if (dragged || latest.current.locked) return;
      const id = cellAt(event);
      if (id !== undefined) latest.current.flag(id);
    };
    const onLeave = () => focus.current(-1);
    const onLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('webglcontextlost', onLost);
    let previousAspect = 0;
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight,
        aspect = w / Math.max(h, 1);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      defaultDistance = 22 * Math.max(1, 1.35 / aspect);
      controls.maxDistance = Math.max(34, defaultDistance * 1.22);
      // Fit only when the viewport shape changes substantially; don't undo orbiting.
      if (previousAspect === 0 || Math.abs(aspect - previousAspect) > 0.4)
        resetCamera();
      previousAspect = aspect;
      renderer.setSize(w, h, false);
      effects.resize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const draw = (milliseconds: number) => {
      const time = reduced.matches ? 0 : milliseconds * 0.001;
      controls.update();
      ocean.update(time);
      underwater.update(time);
      atmosphere.update(time);
      rocks.update(time);
      flags.forEach((flag, id) => updateAssetAnimations(flag, time, id * 0.17));
      // Only glow/motes move; rotating the whole well caused corners to clip tiles.
      for (const c of latest.current.cells)
        if (c.open && c.mine) {
          const portal = slots.get(c.id)!;
          portal.children.forEach((child) => {
            if (child instanceof THREE.PointLight)
              child.intensity = 1.4 + Math.sin(time * 1.7) * 0.15;
          });
        }
      ocean.renderReflection(renderer, scene, camera);
      effects.render();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      redraw.current = () => {};
      focus.current = () => {};
      cameraAction.current = () => {};
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost);
      scene.remove(ocean.group, atmosphere.group);
      disposed = true;
      materialAtlas.dispose();
      ocean.dispose();
      atmosphere.dispose();
      effects.dispose();
      disposeObjects(scene);
      renderer.dispose();
      canvas.remove();
    };
  }, []);
  useEffect(() => {
    redraw.current();
  }, [props.cells]);
  return (
    <div className="overworld">
      <div
        className={`world-canvas ${fallback ? 'canvas-hidden' : ''}`}
        ref={mount}
      />
      {!fallback && (
        <div className="camera-tools" aria-label="Camera controls">
          <button
            onClick={() => cameraAction.current('left')}
            aria-label="Orbit camera left"
            title="Orbit left"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => cameraAction.current('right')}
            aria-label="Orbit camera right"
            title="Orbit right"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => cameraAction.current('in')}
            aria-label="Zoom camera in"
            title="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => cameraAction.current('out')}
            aria-label="Zoom camera out"
            title="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={() => cameraAction.current('reset')}
            aria-label="Reset camera"
            title="Reset view"
          >
            <RotateCcw size={17} />
          </button>
        </div>
      )}
      <div
        className={fallback ? 'fallback-grid' : 'keyboard-board'}
        aria-label="Minefield cells"
      >
        {props.cells.map((c) => (
          <button
            key={c.id}
            disabled={props.locked}
            onFocus={() => focus.current(c.id)}
            onBlur={() => focus.current(-1)}
            onClick={() =>
              props.flagMode ? props.flag(c.id) : props.reveal(c.id)
            }
            onContextMenu={(event) => {
              event.preventDefault();
              props.flag(c.id);
            }}
            onKeyDown={(event) => {
              if (event.key.toLowerCase() === 'f') {
                event.preventDefault();
                props.flag(c.id);
              }
            }}
            aria-label={`Row ${Math.floor(c.id / 8) + 1}, column ${(c.id % 8) + 1}: ${c.flagged ? 'flagged' : c.open ? (c.mine ? 'portal' : `${c.nearby} nearby mines`) : 'covered'}`}
          >
            {c.flagged ? '⚑' : c.open ? (c.mine ? '◉' : c.nearby || '·') : '?'}
          </button>
        ))}
      </div>
      {fallback && (
        <p className="fallback-notice">
          3D is unavailable. You can continue on the accessible board.
        </p>
      )}
    </div>
  );
}
