import * as THREE from "three";

/**
 * Project a board's pixel box into viewport pixels in ONE CSS matrix.
 *
 * CSS3DRenderer normally spreads this over three DOM ancestors (perspective,
 * camera and object). Flattening that chain mathematically lets the live
 * board stay in the same connected host when switching between 3D and a 2D
 * fit. Moving even an ancestor of an iframe reloads its browsing context in
 * older Chromium/WebViews/Safari; restoring its playback time is not a fix.
 *
 * `object` maps board-local metres to world space; its scale already includes
 * pixels-to-metres. Local CSS y points down, whereas world y points up.
 * The caller owns/reuses `matrix`, so the render loop allocates no matrices.
 */
export function projectBoardMatrix(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  pixelWidth: number,
  pixelHeight: number,
  matrix: THREE.Matrix4,
): THREE.Matrix4 {
  matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  matrix.multiply(object.matrixWorld);
  const e = matrix.elements;

  // Right-multiply translate(-pixelWidth/2, pixelHeight/2, 0) * scale(1,-1,1).
  for (let row = 0; row < 4; row += 1) {
    e[12 + row] += e[row] * (-pixelWidth / 2) + e[4 + row] * (pixelHeight / 2);
    e[4 + row] *= -1;
  }
  // Clip coordinates -> CSS viewport coordinates, preserving homogeneous w.
  // Keep z invertible: a singular CSS transform is not painted/hit-tested.
  for (let col = 0; col < 16; col += 4) {
    e[col] = (e[col] + e[col + 3]) * width / 2;
    e[col + 1] = (-e[col + 1] + e[col + 3]) * height / 2;
  }
  // Normalising makes the fourth coordinate 1 at the top-left of the face,
  // avoiding giant CSS coefficients at long camera distances. All painted
  // corners must already have passed the engine's near-plane test.
  const w = e[15];
  if (Math.abs(w) > 1e-10) {
    for (let i = 0; i < 16; i += 1) e[i] /= w;
  }
  return matrix;
}
