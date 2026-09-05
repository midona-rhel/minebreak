'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createTile,
  createFlag,
  createCrystal,
  createLantern,
  createPortal,
  createCliff,
  createBridge,
  createFoliage,
  createRoots,
  disposeObjects,
} from '@/lib/three/asset-kit';

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
  label.position.y = 0.026;
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
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100);
    camera.position.set(3.2, 12, 16);
    camera.lookAt(0, -0.7, 0.2);
    scene.add(new THREE.HemisphereLight(0xbfcce8, 0x43344a, 0.95));
    const sun = new THREE.DirectionalLight(0xffd08a, 3.2);
    sun.position.set(-6, 9, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5dbeef, 1.3);
    rim.position.set(7, 3, -5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xa9bbef, 0.8);
    fill.position.set(4, 3, 10);
    scene.add(fill);
    const island = new THREE.Group();
    scene.add(island);
    const underside = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 2.7, 2.8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x4b4b60,
        flatShading: true,
        roughness: 1,
      }),
    );
    underside.position.y = -1.7;
    underside.rotation.y = Math.PI / 8;
    underside.scale.z = 0.92;
    island.add(underside);
    for (let i = 0; i < 10; i++)
      for (const side of [-1, 1]) {
        const a = createCliff(i);
        a.position.set(i - 4.5, 0, side * 4.5);
        island.add(a);
        if (i > 0 && i < 9) {
          const b = createCliff(i + 2);
          b.position.set(side * 4.5, 0, i - 4.5);
          island.add(b);
        }
      }
    for (let i = 0; i < 24; i++) {
      const edge = i % 4,
        along = (Math.floor(i / 4) - 2.5) * 1.5;
      const plant = createFoliage(i);
      plant.position.set(
        edge < 2 ? along : edge === 2 ? -4.6 : 4.6,
        0.03,
        edge < 2 ? (edge === 0 ? -4.55 : 4.55) : along,
      );
      plant.rotation.y = i * 2;
      island.add(plant);
      if (i % 3 === 0) {
        const roots = createRoots(i);
        roots.position.copy(plant.position);
        roots.position.x += edge === 2 ? -0.5 : edge === 3 ? 0.5 : 0;
        roots.position.z += edge === 0 ? -0.5 : edge === 1 ? 0.5 : 0;
        roots.rotation.y =
          edge === 0
            ? Math.PI
            : edge === 2
              ? -Math.PI / 2
              : edge === 3
                ? Math.PI / 2
                : 0;
        island.add(roots);
      }
    }
    for (const [x, z, s] of [
      [-4.6, -3.8, 1.1],
      [4.4, -4.2, 1.4],
      [-4.2, 3.8, 0.85],
      [4.6, 2.7, 0.65],
    ]) {
      const crystal = createCrystal();
      crystal.position.set(x, 0.03, z);
      crystal.scale.setScalar(s);
      island.add(crystal);
    }
    for (const [x, z] of [
      [-4.5, -4.2],
      [4.35, 3.8],
    ]) {
      const lantern = createLantern();
      lantern.position.set(x, 0.07, z);
      island.add(lantern);
    }
    const bridge = createBridge();
    bridge.position.set(2.2, -0.15, 4.6);
    bridge.scale.z = 1.25;
    island.add(bridge);
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI * 0.2;
      const shard = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.045, 0),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x796757 : 0x5f6070,
          flatShading: true,
        }),
      );
      shard.position.set(
        Math.cos(angle) * (5.6 + (i % 2) * 0.3),
        -0.7 - (i % 3) * 0.5,
        Math.sin(angle) * 5.6,
      );
      shard.scale.set(0.8, 1.7, 1);
      shard.rotation.set(i * 0.6, i * 0.3, 0);
      scene.add(shard);
    }
    const slots = new Map<number, THREE.Group>();
    const signatures = new Map<number, string>();
    const targets: THREE.Object3D[] = [];
    const highlight = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 0.025, 0.98),
      new THREE.MeshBasicMaterial({
        color: 0xfff2a4,
        transparent: true,
        opacity: 0.3,
      }),
    );
    highlight.visible = false;
    highlight.position.y = 0.22;
    scene.add(highlight);
    focus.current = (id) => {
      highlight.position.set((id % 8) - 3.5, 0.225, Math.floor(id / 8) - 3.5);
      highlight.visible = id >= 0;
    };
    redraw.current = () => {
      targets.length = 0;
      for (const c of latest.current.cells) {
        const signature = `${c.open}:${c.flagged}:${c.disarmed}:${c.open ? c.nearby : 0}`;
        if (signatures.get(c.id) !== signature) {
          const previous = slots.get(c.id);
          if (previous) {
            island.remove(previous);
            disposeObjects(previous);
          }
          const tile =
            c.open && c.mine ? createPortal() : createTile(!c.open, c.id);
          tile.position.set((c.id % 8) - 3.5, 0, Math.floor(c.id / 8) - 3.5);
          if (c.flagged) tile.add(createFlag());
          if (c.open && !c.mine && c.nearby) tile.add(numberLabel(c.nearby));
          tile.traverse((child) => {
            child.userData.cellId = c.id;
          });
          island.add(tile);
          slots.set(c.id, tile);
          signatures.set(c.id, signature);
        }
        targets.push(slots.get(c.id)!);
      }
    };
    redraw.current();
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const cellAt = (event: PointerEvent | MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(targets, true)[0]?.object.userData
        .cellId as number | undefined;
    };
    const onMove = (event: PointerEvent) => {
      const id = cellAt(event);
      focus.current(id ?? -1);
      renderer.domElement.style.cursor =
        id === undefined || latest.current.locked ? 'default' : 'pointer';
    };
    const onClick = (event: MouseEvent) => {
      if (latest.current.locked) return;
      const id = cellAt(event);
      if (id !== undefined)
        (latest.current.flagMode ? latest.current.flag : latest.current.reveal)(
          id,
        );
    };
    const onContext = (event: MouseEvent) => {
      event.preventDefault();
      if (latest.current.locked) return;
      const id = cellAt(event);
      if (id !== undefined) latest.current.flag(id);
    };
    const onLeave = () => focus.current(-1);
    const onLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('contextmenu', onContext);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight,
        aspect = w / Math.max(h, 1);
      const height = Math.max(12.3, 13.6 / aspect);
      camera.left = (-height * aspect) / 2;
      camera.right = (height * aspect) / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const draw = (t: number) => {
      for (const c of latest.current.cells)
        if (c.open && c.mine) {
          const slot = slots.get(c.id)!;
          slot.rotation.y = reduced.matches ? 0 : t * 0.00015;
        }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      redraw.current = () => {};
      focus.current = () => {};
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      disposeObjects(scene);
      renderer.dispose();
      renderer.domElement.remove();
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
            onContextMenu={(e) => {
              e.preventDefault();
              props.flag(c.id);
            }}
            onKeyDown={(e) => {
              if (e.key.toLowerCase() === 'f') {
                e.preventDefault();
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
