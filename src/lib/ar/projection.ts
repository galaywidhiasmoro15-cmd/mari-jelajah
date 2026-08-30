import * as THREE from "three";

/** Proyeksi objek dunia 3D ke koordinat layar (piksel) untuk gaze/dwell & HUD. */

const tmpVec = new THREE.Vector3();
const tmpEdge = new THREE.Vector3();
const tmpRight = new THREE.Vector3();

export type ScreenProjection = {
  x: number;
  y: number;
  /** radius piksel perkiraan dari objek */
  radius: number;
  inFront: boolean;
  onScreen: boolean;
  distance: number;
};

export function projectObject(
  object: THREE.Object3D,
  worldRadius: number,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): ScreenProjection {
  object.getWorldPosition(tmpVec);
  const distance = tmpVec.distanceTo(camera.position);

  camera.getWorldDirection(tmpEdge);
  tmpRight.crossVectors(tmpEdge, camera.up).normalize();
  const edgeWorld = tmpVec.clone().addScaledVector(tmpRight, worldRadius);

  const center = tmpVec.clone().project(camera);
  const edge = edgeWorld.project(camera);

  const inFront = center.z < 1;
  const x = (center.x * 0.5 + 0.5) * width;
  const y = (-center.y * 0.5 + 0.5) * height;
  const ex = (edge.x * 0.5 + 0.5) * width;
  const ey = (-edge.y * 0.5 + 0.5) * height;
  const radius = Math.max(18, Math.hypot(ex - x, ey - y));

  return {
    x,
    y,
    radius,
    inFront,
    onScreen: inFront && x >= 0 && x <= width && y >= 0 && y <= height,
    distance,
  };
}

/** Sudut horizontal (derajat) dari arah pandang menuju objek — hanya untuk HUD navigasi. */
export function screenSpaceBearingDelta(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
): number {
  object.getWorldPosition(tmpVec);
  const toObject = tmpVec.clone().sub(camera.position);
  toObject.y = 0;
  camera.getWorldDirection(tmpEdge);
  tmpEdge.y = 0;
  if (toObject.lengthSq() === 0 || tmpEdge.lengthSq() === 0) return 0;
  toObject.normalize();
  tmpEdge.normalize();
  const angle = Math.atan2(
    toObject.x * tmpEdge.z - toObject.z * tmpEdge.x,
    toObject.x * tmpEdge.x + toObject.z * tmpEdge.z,
  );
  return (-angle * 180) / Math.PI;
}
