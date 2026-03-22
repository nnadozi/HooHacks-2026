"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { Keypoint } from "@/types";

type TargetPoint =
  | { kind: "kp"; index: number }
  | { kind: "mid"; a: number; b: number };

type BoneDriver = {
  bone: THREE.Bone;
  restQuat: THREE.Quaternion;
  restDirParent: THREE.Vector3;
  start: TargetPoint;
  end: TargetPoint;
  lastDirParent: THREE.Vector3;
};

function getPoint(frame: Keypoint[], target: TargetPoint) {
  if (target.kind === "kp") return frame[target.index];
  const pa = frame[target.a];
  const pb = frame[target.b];
  return {
    x: (pa.x + pb.x) / 2,
    y: (pa.y + pb.y) / 2,
    z: (pa.z + pb.z) / 2,
    visibility: Math.min(pa.visibility, pb.visibility),
  };
}

function findBone(bones: THREE.Bone[], patterns: (string | RegExp)[]) {
  for (const p of patterns) {
    const re = typeof p === "string" ? new RegExp(p, "i") : p;
    const match = bones.find((b) => re.test(b.name));
    if (match) return match;
  }
  return null;
}

function buildDriver(
  bones: THREE.Bone[],
  bonePatterns: (string | RegExp)[],
  childPatterns: (string | RegExp)[],
  start: TargetPoint,
  end: TargetPoint
): BoneDriver | null {
  const bone = findBone(bones, bonePatterns);
  if (!bone) return null;

  const child = findBone(bones, childPatterns);
  if (!child) return null;

  const parent = bone.parent;
  if (!parent) return null;

  const boneWorld = new THREE.Vector3();
  const childWorld = new THREE.Vector3();
  bone.getWorldPosition(boneWorld);
  child.getWorldPosition(childWorld);

  const parentWorldQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQuat);
  const invParentWorldQuat = parentWorldQuat.invert();

  const restDirParent = childWorld
    .sub(boneWorld)
    .applyQuaternion(invParentWorldQuat)
    .normalize();

  return {
    bone,
    restQuat: bone.quaternion.clone(),
    restDirParent,
    start,
    end,
    lastDirParent: restDirParent.clone(),
  };
}

function interpolateFrame(frames: Keypoint[][], fps: number, timeSeconds: number) {
  if (!frames.length) return null;
  if (frames.length === 1) return frames[0];

  const pos = Math.max(0, timeSeconds * fps);
  const i0 = Math.floor(pos) % frames.length;
  const i1 = (i0 + 1) % frames.length;
  const alpha = pos - Math.floor(pos);

  const a = frames[i0];
  const b = frames[i1];
  if (!a?.length) return b;
  if (!b?.length) return a;

  const n = Math.min(a.length, b.length);
  const out: Keypoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ka = a[i];
    const kb = b[i];
    out[i] = {
      x: ka.x + (kb.x - ka.x) * alpha,
      y: ka.y + (kb.y - ka.y) * alpha,
      z: ka.z + (kb.z - ka.z) * alpha,
      visibility: Math.min(ka.visibility, kb.visibility),
    };
  }
  return out;
}

export default function StickFigure3D({
  frames,
  fps,
  isPlaying,
  width = 640,
  height = 480,
  className,
  modelUrl = "/models/low_poly_stick_figure_rigged/scene.gltf",
  depthScale = 0.15,
  maxDepth = 0.25,
  autoMirrorX = true,
}: {
  frames: Keypoint[][];
  fps: number;
  isPlaying: boolean;
  width?: number;
  height?: number;
  className?: string;
  modelUrl?: string;
  depthScale?: number;
  maxDepth?: number;
  autoMirrorX?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const driversRef = useRef<BoneDriver[]>([]);

  const isPlayingRef = useRef(isPlaying);
  const framesRef = useRef(frames);
  const fpsRef = useRef(fps);
  const startTimeRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);
  const smoothedFrameRef = useRef<Keypoint[] | null>(null);
  const mirrorXRef = useRef<boolean | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      startTimeRef.current = null;
    }
  }, [isPlaying]);

  useEffect(() => {
    framesRef.current = frames;
    frameIndexRef.current = 0;
    startTimeRef.current = null;
    smoothedFrameRef.current = null;
    mirrorXRef.current = null;
  }, [frames]);

  useEffect(() => {
    fpsRef.current = fps;
  }, [fps]);

  const sizeKey = useMemo(() => `${width}x${height}`, [width, height]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0a0a");
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 100);
    camera.position.set(0, 0.8, 3);
    camera.lookAt(0, 0.4, 0);
    cameraRef.current = camera;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 4, 2);
    scene.add(dir);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    let disposed = false;
    let animId = 0;

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf: GLTF) => {
        if (disposed) return;
        const model = gltf.scene;

        // Center + scale to fit (local origin at model center)
        const box0 = new THREE.Box3().setFromObject(model);
        const center0 = box0.getCenter(new THREE.Vector3());
        model.position.sub(center0);
        const size0 = box0.getSize(new THREE.Vector3());
        const maxDim0 = Math.max(size0.x, size0.y, size0.z) || 1;
        const scale = 1.6 / maxDim0;
        model.scale.setScalar(scale);
        model.rotation.y = Math.PI; // face camera

        scene.add(model);
        modelRef.current = model;

        // Frame camera to fully fit the model
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const fitOffset = 1.2;
        const halfY = Math.max(0.001, size.y / 2);
        const halfX = Math.max(0.001, size.x / 2);
        const fov = (camera.fov * Math.PI) / 180;
        const distY = (halfY / Math.tan(fov / 2)) * fitOffset;
        const distX = (halfX / (Math.tan(fov / 2) * camera.aspect)) * fitOffset;
        const distance = Math.max(distX, distY);

        camera.near = Math.max(0.01, distance / 50);
        camera.far = Math.max(50, distance * 50);
        camera.updateProjectionMatrix();

        camera.position.set(center.x, center.y + size.y * 0.05, center.z + distance);
        camera.lookAt(center);

        // Find bones from first skinned mesh
        let bones: THREE.Bone[] = [];
        model.traverse((obj: THREE.Object3D) => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
            const skinned = obj as THREE.SkinnedMesh;
            bones = skinned.skeleton.bones as THREE.Bone[];
          }
        });

        if (bones.length) {
          const drivers: BoneDriver[] = [];

          const add = (d: BoneDriver | null) => {
            if (d) drivers.push(d);
          };

          // Spine chain (use midpoints for stability)
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_Spine_"],
              ["QuickRigCharacter_Spine1_"],
              { kind: "mid", a: 23, b: 24 },
              { kind: "mid", a: 11, b: 12 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_Neck_"],
              ["QuickRigCharacter_Head_"],
              { kind: "mid", a: 11, b: 12 },
              { kind: "kp", index: 0 }
            )
          );

          // Arms
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_LeftArm_", "LeftArm_"],
              ["QuickRigCharacter_LeftForeArm_", "LeftForeArm_"],
              { kind: "kp", index: 11 },
              { kind: "kp", index: 13 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_LeftForeArm_", "LeftForeArm_"],
              ["QuickRigCharacter_LeftHand_", "LeftHand_"],
              { kind: "kp", index: 13 },
              { kind: "kp", index: 15 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_RightArm_", "RightArm_"],
              ["QuickRigCharacter_RightForeArm_", "RightForeArm_"],
              { kind: "kp", index: 12 },
              { kind: "kp", index: 14 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_RightForeArm_", "RightForeArm_"],
              ["QuickRigCharacter_RightHand_", "RightHand_"],
              { kind: "kp", index: 14 },
              { kind: "kp", index: 16 }
            )
          );

          // Legs
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_LeftUpLeg_", "LeftUpLeg_"],
              ["QuickRigCharacter_LeftLeg_", "LeftLeg_"],
              { kind: "kp", index: 23 },
              { kind: "kp", index: 25 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_LeftLeg_", "LeftLeg_"],
              ["QuickRigCharacter_LeftFoot_", "LeftFoot_"],
              { kind: "kp", index: 25 },
              { kind: "kp", index: 27 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_RightUpLeg_", "RightUpLeg_"],
              ["QuickRigCharacter_RightLeg_", "RightLeg_"],
              { kind: "kp", index: 24 },
              { kind: "kp", index: 26 }
            )
          );
          add(
            buildDriver(
              bones,
              ["QuickRigCharacter_RightLeg_", "RightLeg_"],
              ["QuickRigCharacter_RightFoot_", "RightFoot_"],
              { kind: "kp", index: 26 },
              { kind: "kp", index: 28 }
            )
          );

          driversRef.current = drivers;
        } else {
          driversRef.current = [];
        }
      },
      undefined,
      () => {
        // Leave empty; editor UI will just show the dark background if model fails to load.
      }
    );

    const tmpParentWorldQuat = new THREE.Quaternion();
    const tmpInvParentWorldQuat = new THREE.Quaternion();
    const tmpDirParent = new THREE.Vector3();
    const tmpDeltaQuat = new THREE.Quaternion();
    const tmpDesiredQuat = new THREE.Quaternion();

    const kpToVec = (kp: Keypoint) => {
      const mirroredX = mirrorXRef.current ? 1 - kp.x : kp.x;
      const z = THREE.MathUtils.clamp(-kp.z * depthScale, -maxDepth, maxDepth);
      return new THREE.Vector3(mirroredX - 0.5, 0.5 - kp.y, z);
    };

    const smoothFrame = (raw: Keypoint[], alpha: number) => {
      const prev = smoothedFrameRef.current;
      if (!prev || prev.length !== raw.length) {
        smoothedFrameRef.current = raw.map((k) => ({ ...k }));
        return smoothedFrameRef.current;
      }

      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const p = prev[i];
        if (r.visibility < 0.2) continue;
        p.x += (r.x - p.x) * alpha;
        p.y += (r.y - p.y) * alpha;
        p.z += (r.z - p.z) * alpha;
        p.visibility = Math.max(p.visibility, r.visibility);
      }
      return prev;
    };

    const applyFrame = (frame: Keypoint[], slerpAlpha: number) => {
      if (!frame || frame.length < 33) return;

      for (const d of driversRef.current) {
        const parent = d.bone.parent;
        if (!parent) continue;

        const a = getPoint(frame, d.start);
        const b = getPoint(frame, d.end);
        if (a.visibility < 0.2 || b.visibility < 0.2) {
          tmpDirParent.copy(d.lastDirParent);
        } else {
          const va = kpToVec(a);
          const vb = kpToVec(b);
          const targetDir = vb.sub(va);
          if (targetDir.lengthSq() < 1e-6) continue;
          targetDir.normalize();

          parent.getWorldQuaternion(tmpParentWorldQuat);
          tmpInvParentWorldQuat.copy(tmpParentWorldQuat).invert();

          tmpDirParent.copy(targetDir).applyQuaternion(tmpInvParentWorldQuat).normalize();

          // Low-pass filter the direction to reduce jitter
          d.lastDirParent.lerp(tmpDirParent, 0.35).normalize();
          tmpDirParent.copy(d.lastDirParent);
        }

        tmpDeltaQuat.setFromUnitVectors(d.restDirParent, tmpDirParent);
        tmpDesiredQuat.copy(d.restQuat).premultiply(tmpDeltaQuat);
        d.bone.quaternion.slerp(tmpDesiredQuat, slerpAlpha);
      }
    };

    const lastRenderTimeRef = { current: 0 };

    const loop = (t: number) => {
      if (disposed) return;

      const localFrames = framesRef.current;
      const localFps = fpsRef.current || 30;
      const dt = Math.min(0.05, Math.max(0.001, (t - (lastRenderTimeRef.current || t)) / 1000));
      lastRenderTimeRef.current = t;
      const slerpAlpha = 1 - Math.exp(-dt * 14);
      const posAlpha = 1 - Math.exp(-dt * 18);

      if (isPlayingRef.current && localFrames.length > 0) {
        if (startTimeRef.current === null) startTimeRef.current = t;
        const elapsedS = (t - startTimeRef.current) / 1000;
        const pos = elapsedS * localFps;
        frameIndexRef.current = Math.floor(pos) % localFrames.length;
        const raw = interpolateFrame(localFrames, localFps, elapsedS);
        if (raw) {
          if (autoMirrorX && mirrorXRef.current === null && raw.length > 12) {
            const ls = raw[11];
            const rs = raw[12];
            if (ls.visibility >= 0.2 && rs.visibility >= 0.2) {
              mirrorXRef.current = ls.x > rs.x;
            }
          }
          const frame = smoothFrame(raw, posAlpha);
          if (frame) applyFrame(frame, slerpAlpha);
        }
      } else if (localFrames.length > 0) {
        // Idle pose: show first frame
        const raw = localFrames[0];
        if (autoMirrorX && mirrorXRef.current === null && raw.length > 12) {
          const ls = raw[11];
          const rs = raw[12];
          if (ls.visibility >= 0.2 && rs.visibility >= 0.2) {
            mirrorXRef.current = ls.x > rs.x;
          }
        }
        const frame = smoothFrame(raw, posAlpha);
        if (frame) applyFrame(frame, slerpAlpha);
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      driversRef.current = [];
      modelRef.current = null;

      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;

      container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, sizeKey]);

  return (
    <div
      ref={containerRef}
      className={className || "rounded-lg border border-zinc-700 bg-zinc-900"}
      style={{ width, height }}
    />
  );
}
