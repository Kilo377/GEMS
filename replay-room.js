import * as THREE from 'three';

// Configured in Unity world coordinates. The viewer reflects Z, so convert once
// here rather than making the bounds editor expose a different coordinate system.
export class RoomCameraBounds {
  constructor(config) { this.configure(config); }

  configure(config) {
    const min = config.min?.map(Number), max = config.max?.map(Number);
    const margin = Number(config.margin ?? 0.18);
    if (!min || !max || min.length !== 3 || max.length !== 3 ||
        ![...min, ...max, margin].every(Number.isFinite) || margin < 0 ||
        min.some((value, axis) => max[axis] - value <= margin * 2 + 1)) {
      throw new Error('Each room dimension must exceed twice the wall clearance plus 1 metre.');
    }
    this.config = { min, max, margin };
    this.cameraBox = new THREE.Box3(
      new THREE.Vector3(min[0] + margin, min[1] + margin, -max[2] + margin),
      new THREE.Vector3(max[0] - margin, max[1] - margin, -min[2] - margin)
    );
    // Keep the focus inside too, with enough space for the minimum orbit radius.
    this.targetBox = this.cameraBox.clone().expandByScalar(-0.4);
    this.offset = new THREE.Vector3();
    this.previousPosition = new THREE.Vector3();
    this.previousTarget = new THREE.Vector3();
  }

  constrain(position, target) {
    this.previousPosition.copy(position); this.previousTarget.copy(target);
    this.offset.subVectors(position, target);
    this.targetBox.clampPoint(target, target);
    if (this.offset.lengthSq() < 0.000001) this.offset.set(0, 0, 0.35);
    else if (this.offset.length() < 0.35) this.offset.setLength(0.35);
    // Shorten the orbit ray at the first boundary. Clamping each camera axis
    // independently would distort the requested orbit direction at corners.
    let scale = 1;
    for (const axis of ['x', 'y', 'z']) {
      const delta = this.offset[axis];
      if (delta > 0) scale = Math.min(scale, (this.cameraBox.max[axis] - target[axis]) / delta);
      else if (delta < 0) scale = Math.min(scale, (this.cameraBox.min[axis] - target[axis]) / delta);
    }
    position.copy(target).addScaledVector(this.offset, Math.max(0, scale));
    this.cameraBox.clampPoint(position, position);
    return !position.equals(this.previousPosition) || !target.equals(this.previousTarget);
  }

  // Walking keeps the viewing direction intact, including near a wall.
  constrainWalk(position, target) {
    this.previousPosition.copy(position);
    this.cameraBox.clampPoint(position, position);
    this.offset.subVectors(position, this.previousPosition);
    target.add(this.offset);
    return this.offset.lengthSq() > 0;
  }

  home() {
    const target = this.targetBox.getCenter(new THREE.Vector3());
    const size = this.cameraBox.getSize(new THREE.Vector3());
    const position = target.clone().add(new THREE.Vector3(-size.x * 0.32, size.y * 0.1, size.z * 0.3));
    this.constrain(position, target);
    return { position, target };
  }
}
