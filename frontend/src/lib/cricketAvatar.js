import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function loft(rings, segments = 24) {
  const positions = [];
  const coordinates = [];
  const indices = [];
  rings.forEach(([height, width, depth, offset = 0], row) => {
    for (let column = 0; column <= segments; column++) {
      const angle = column / segments * Math.PI * 2;
      positions.push(Math.sin(angle) * width, height, -Math.cos(angle) * depth + offset);
      coordinates.push(column / segments, row / (rings.length - 1));
      if (row < rings.length - 1 && column < segments) {
        const vertex = row * (segments + 1) + column;
        indices.push(vertex, vertex + 1, vertex + segments + 1, vertex + 1, vertex + segments + 2, vertex + segments + 1);
      }
    }
  });
  for (const row of [0, rings.length - 1]) {
    const centre = positions.length / 3;
    positions.push(0, rings[row][0], rings[row][3] || 0);
    coordinates.push(0.5, row ? 1 : 0);
    for (let column = 0; column < segments; column++) {
      const vertex = row * (segments + 1) + column;
      indices.push(...(row ? [centre, vertex, vertex + 1] : [centre, vertex + 1, vertex]));
    }
  }
  if (rings[0][0] < rings[rings.length - 1][0]) {
    for (let index = 0; index < indices.length; index += 3) [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(coordinates, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCricketAvatar({ kit, skin, hair, white, dark, trim, helmet, lip, numberMap, shoe = white, padded = false, cap = true, index = 0, resources = new Set() }) {
  const player = new THREE.Group();
  player.name = `cricketer-${index}`;
  const oval = new THREE.SphereGeometry(1, 16, 12);
  const pending = new Map();

  function part(parent, geometry, surface, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(transform);
    if (!pending.has(parent)) pending.set(parent, new Map());
    const surfaces = pending.get(parent);
    if (!surfaces.has(surface)) surfaces.set(surface, []);
    surfaces.get(surface).push(geometry);
  }

  function ellipsoid(parent, size, position, surface) {
    part(parent, oval.clone(), surface, position, size);
  }

  function tube(parent, points, radius, surface) {
    part(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), 12, radius, 6, false), surface);
  }

  function limb(upper, lower, rings, jointHeight, sleeve = false) {
    const geometry = loft(rings, 20);
    const vertices = geometry.getAttribute("position");
    const weights = [];
    const joints = [];
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      const blend = THREE.MathUtils.smoothstep(-vertices.getY(vertex), jointHeight - 0.09, jointHeight + 0.09);
      joints.push(0, 1, 0, 0);
      weights.push(1 - blend, blend, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    if (sleeve) {
      for (let row = 0; row < rings.length - 1; row++) geometry.addGroup(row * 20 * 6, 20 * 6, (rings[row][0] + rings[row + 1][0]) / 2 > -0.25 ? 0 : 1);
      geometry.addGroup((rings.length - 1) * 20 * 6, 20 * 3, 0);
      geometry.addGroup((rings.length - 1) * 20 * 6 + 20 * 3, 20 * 3, 1);
    }
    const mesh = new THREE.SkinnedMesh(geometry, sleeve ? [kit, skin] : kit);
    mesh.name = sleeve ? "continuous-arm" : "continuous-trousers";
    mesh.position.copy(upper.position);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    player.add(mesh);
    player.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([upper, lower]);
    mesh.bind(skeleton);
    resources.add(geometry);
    resources.add(skeleton);
  }

  const torso = new THREE.Group();
  torso.position.y = 1.39;
  player.add(torso);
  part(torso, loft([
    [-0.35, 0.205, 0.13], [-0.31, 0.215, 0.136], [-0.24, 0.21, 0.14],
    [-0.13, 0.218, 0.146], [0.02, 0.255, 0.16], [0.16, 0.286, 0.162],
    [0.26, 0.288, 0.145], [0.32, 0.263, 0.123], [0.38, 0.105, 0.082],
  ], 32), kit);
  ellipsoid(torso, [0.218, 0.125, 0.135], [0, -0.355, 0], kit);
  tube(torso, [[-0.092, 0.365, -0.049], [-0.06, 0.29, -0.12], [0, 0.265, -0.151], [0.06, 0.29, -0.12], [0.092, 0.365, -0.049]], 0.012, trim);
  tube(torso, [[-0.255, 0.305, -0.055], [-0.23, 0.22, -0.12], [-0.205, 0.15, -0.15]], 0.011, trim);
  tube(torso, [[0.255, 0.305, -0.055], [0.23, 0.22, -0.12], [0.205, 0.15, -0.15]], 0.011, trim);
  ellipsoid(torso, [0.026, 0.035, 0.008], [-0.14, 0.185, -0.157], trim);
  part(torso, new THREE.CylinderGeometry(0.067, 0.084, 0.15, 16), skin, [0, 0.425, 0.012]);
  if (numberMap) {
    const printing = new THREE.MeshStandardMaterial({ map: numberMap, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
    resources.add(printing);
    part(torso, new THREE.PlaneGeometry(0.32, 0.38), printing, [0, 0.055, 0.166]);
  }

  const head = new THREE.Group();
  head.name = "sculpted-head";
  head.position.set(0, 1.975, 0.008);
  player.add(head);
  part(head, loft([
    [-0.148, 0.048, 0.063, -0.01], [-0.132, 0.077, 0.085], [-0.103, 0.108, 0.101],
    [-0.06, 0.125, 0.111], [-0.01, 0.133, 0.115], [0.04, 0.129, 0.115],
    [0.086, 0.116, 0.109], [0.12, 0.09, 0.091], [0.141, 0.055, 0.062], [0.15, 0.004, 0.008],
  ], 32), skin, [0, 0, 0], [0.98 + index % 3 * 0.025, 1, 1]);
  part(head, loft([[-0.041, 0.021, 0.014, -0.121], [-0.024, 0.025, 0.025, -0.132], [-0.004, 0.017, 0.021, -0.126], [0.043, 0.009, 0.008, -0.113]], 16), skin);
  for (const side of [-1, 1]) {
    ellipsoid(head, [0.019, 0.033, 0.017], [side * 0.132, -0.024, 0.009], skin);
    ellipsoid(head, [0.01, 0.02, 0.009], [side * 0.139, -0.027, -0.004], lip);
    ellipsoid(head, [0.027, 0.011, 0.01], [side * 0.052, 0.026, -0.105], white);
    ellipsoid(head, [0.007, 0.008, 0.004], [side * 0.051, 0.025, -0.115], hair);
    ellipsoid(head, [0.0035, 0.005, 0.002], [side * 0.051, 0.025, -0.119], dark);
    tube(head, [[side * 0.027, 0.048, -0.112], [side * 0.05, 0.053, -0.108], [side * 0.078, 0.045, -0.092]], 0.0045, hair);
    tube(head, [[side * 0.024, 0.034, -0.109], [side * 0.052, 0.038, -0.114], [side * 0.079, 0.029, -0.094]], 0.003, skin);
  }
  tube(head, [[-0.031, -0.078, -0.106], [0, -0.074, -0.115], [0.031, -0.078, -0.106]], 0.0035, lip);
  tube(head, [[-0.025, -0.084, -0.107], [0, -0.085, -0.112], [0.025, -0.084, -0.107]], 0.003, skin);
  part(head, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.43), hair, [0, 0.024, 0.012], [0.133, 0.135, 0.118]);
  if (index % 3 !== 0) {
    for (const side of [-1, 1]) tube(head, [[side * 0.107, -0.048, -0.07], [side * 0.093, -0.108, -0.075], [side * 0.04, -0.139, -0.068], [0, -0.142, -0.073]], 0.007, hair);
    tube(head, [[-0.026, -0.062, -0.119], [0, -0.06, -0.124], [0.026, -0.062, -0.119]], 0.005, hair);
  }
  if (padded) {
    part(head, new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.57), helmet, [0, 0.021, 0.01], [0.158, 0.162, 0.148]);
    ellipsoid(head, [0.171, 0.011, 0.079], [0, 0.072, -0.111], helmet);
    for (const height of [-0.035, -0.082, -0.125]) tube(head, [[-0.142, height, -0.08], [-0.105, height, -0.159], [0, height, -0.187], [0.105, height, -0.159], [0.142, height, -0.08]], 0.0045, dark);
    for (const side of [-1, 1]) {
      tube(head, [[side * 0.093, 0.027, -0.161], [side * 0.102, -0.133, -0.147]], 0.0045, dark);
      ellipsoid(head, [0.019, 0.058, 0.035], [side * 0.145, -0.031, 0.002], helmet);
    }
  } else if (cap) {
    part(head, new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), kit, [0, 0.027, 0.012], [0.142, 0.141, 0.135]);
    ellipsoid(head, [0.15, 0.012, 0.091], [0, 0.039, -0.123], kit);
  }

  const arms = [];
  const elbows = [];
  const hands = [];
  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Bone();
    arm.position.set(side * 0.3, 1.72, 0);
    const elbow = new THREE.Bone();
    elbow.position.y = -0.38;
    arm.add(elbow);
    player.add(arm);
    limb(arm, elbow, [[0.045, 0.035, 0.055], [0.015, 0.108, 0.106], [-0.08, 0.116, 0.104], [-0.17, 0.103, 0.093], [-0.245, 0.092, 0.084], [-0.253, 0.081, 0.074], [-0.32, 0.076, 0.068], [-0.38, 0.07, 0.068], [-0.43, 0.081, 0.074], [-0.5, 0.082, 0.073], [-0.59, 0.071, 0.063], [-0.69, 0.048, 0.043], [-0.76, 0.041, 0.036]], 0.38, true);
    const hand = new THREE.Group();
    hand.name = padded ? "batting-glove" : "anatomical-hand";
    hand.position.y = -0.38;
    elbow.add(hand);
    ellipsoid(hand, [padded ? 0.059 : 0.048, 0.064, padded ? 0.037 : 0.025], [0, -0.01, 0], padded ? white : skin);
    for (let finger = 0; finger < 4; finger++) {
      const length = [0.06, 0.075, 0.068, 0.05][finger];
      part(hand, new THREE.CapsuleGeometry(padded ? 0.013 : 0.01, length, 4, 8), padded ? white : skin, [(finger - 1.5) * (padded ? 0.028 : 0.022), -0.065 - length / 2, -0.005], [1, 1, 1], [-0.2, 0, (finger - 1.5) * -0.055]);
    }
    part(hand, new THREE.CapsuleGeometry(padded ? 0.016 : 0.013, 0.047, 4, 8), padded ? white : skin, [-side * 0.052, -0.035, -0.014], [1, 1, 1], [-0.4, 0, -side * 0.45]);
    if (padded) {
      ellipsoid(hand, [0.05, 0.045, 0.014], [0, 0.005, 0.037], trim);
      part(hand, new THREE.CylinderGeometry(0.045, 0.042, 0.05, 12), trim, [0, 0.05, 0]);
    }
    const leg = new THREE.Bone();
    leg.position.set(side * 0.16, 1.02, 0);
    const knee = new THREE.Bone();
    knee.position.y = -0.46;
    leg.add(knee);
    player.add(leg);
    limb(leg, knee, [[0.055, 0.083, 0.099], [0.015, 0.124, 0.139], [-0.1, 0.128, 0.14], [-0.22, 0.118, 0.125], [-0.34, 0.1, 0.102], [-0.42, 0.088, 0.091], [-0.49, 0.091, 0.097], [-0.57, 0.103, 0.105], [-0.66, 0.103, 0.103], [-0.77, 0.086, 0.085], [-0.88, 0.064, 0.065], [-0.925, 0.063, 0.065]], 0.46);
    ellipsoid(knee, [0.09, 0.067, 0.177], [0, -0.418, -0.07], shoe);
    ellipsoid(knee, [0.095, 0.023, 0.186], [0, -0.46, -0.065], dark);
    ellipsoid(knee, [0.085, 0.021, 0.13], [0, -0.362, -0.08], trim);
    for (let lace = 0; lace < 3; lace++) tube(knee, [[-0.043, -0.359 + lace * 0.003, -0.058 - lace * 0.025], [0.043, -0.359 + lace * 0.003, -0.058 - lace * 0.025]], 0.004, dark);
    if (padded) {
      ellipsoid(knee, [0.115, 0.266, 0.071], [0, -0.155, -0.095], white);
      ellipsoid(knee, [0.117, 0.071, 0.074], [0, 0.061, -0.095], white);
      for (const offset of [-0.064, -0.032, 0, 0.032, 0.064]) tube(knee, [[offset, 0.025, -0.155], [offset, -0.13, -0.169], [offset, -0.365, -0.137]], 0.009, trim);
      for (const height of [-0.06, -0.28]) part(knee, new THREE.BoxGeometry(0.18, 0.035, 0.035), trim, [0, height, 0.077]);
    }
    arms.push(arm); elbows.push(elbow); hands.push(hand); legs.push(leg); knees.push(knee);
  }
  for (const [parent, surfaces] of pending) for (const [surface, geometries] of surfaces) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((entry) => entry.dispose());
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    resources.add(geometry);
  }
  oval.dispose();
  player.userData = { torso, head, arms, elbows, hands, legs, knees, variation: index, skinMaterial: skin, home: new THREE.Vector3() };
  return player;
}