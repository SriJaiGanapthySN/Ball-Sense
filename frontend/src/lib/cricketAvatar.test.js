import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCricketAvatar } from "./cricketAvatar.js";

test("anatomical avatars have continuous skinned limbs, valid normals, and stable hand anchors", () => {
  for (const padded of [false, true]) {
    const material = new THREE.MeshStandardMaterial();
    const resources = new Set();
    const avatar = createCricketAvatar({ kit: material, skin: material, hair: material, white: material, dark: material, trim: material, helmet: material, lip: material, padded, resources });
    const limbs = [];
    avatar.traverse((object) => {
      if (!object.isMesh) return;
      for (const name of ["position", "normal", "uv"]) assert.ok([...object.geometry.getAttribute(name).array].every(Number.isFinite));
      if (object.isSkinnedMesh) {
        limbs.push(object);
        const weights = object.geometry.getAttribute("skinWeight");
        for (let vertex = 0; vertex < weights.count; vertex++) assert.ok(Math.abs(weights.getX(vertex) + weights.getY(vertex) - 1) < 0.00001);
      }
    });
    assert.equal(limbs.length, 4);
    assert.equal(avatar.userData.hands.length, 2);
    assert.equal(avatar.userData.head.position.y, 1.975);
    assert.ok(avatar.userData.torso.children[0].geometry.getAttribute("normal").getZ(66) < 0);
    assert.ok(limbs[0].geometry.getAttribute("normal").getZ(42) < 0);
    avatar.updateMatrixWorld(true);
    const before = avatar.userData.hands[0].getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(before.y - 0.96) < 0.00001);
    avatar.userData.elbows[0].rotation.x = -1.2;
    avatar.updateMatrixWorld(true);
    limbs.forEach((limb) => limb.skeleton.update());
    const after = avatar.userData.hands[0].getWorldPosition(new THREE.Vector3());
    assert.ok(before.distanceTo(after) > 0.3);
    for (const limb of limbs) {
      const point = new THREE.Vector3().fromBufferAttribute(limb.geometry.getAttribute("position"), 100);
      limb.applyBoneTransform(100, point);
      assert.ok(point.toArray().every(Number.isFinite));
    }
    for (const resource of resources) resource.dispose();
    material.dispose();
  }
});