import * as THREE from 'three';

const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const UP = new THREE.Vector3(0, 1, 0);

// Shares the viewer's render loop, so navigation also works while motion is paused.
export class ReplayNavigation {
  constructor({ camera, target, viewport, canvas, panel, translate, onChange, onModeChange }) {
    Object.assign(this, { camera, target, viewport, canvas, panel, translate, onChange, onModeChange });
    this.mode = 'walk';
    this.keys = new Set();
    this.held = new Set();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.spherical = new THREE.Spherical();
    this.drag = null;
    this.events = new AbortController();
    const on = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: this.events.signal });
    this.speed = panel.querySelector('[data-camera="speed"]');
    this.modeButtons = [...panel.querySelectorAll('[data-camera-mode]')];
    this.moveButtons = [...panel.querySelectorAll('[data-camera-move]')];
    this.viewport.tabIndex = 0;
    on(viewport, 'keydown', event => {
      if (!KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || this.mode === 'recorded') return;
      if (event.target !== viewport && event.target !== canvas) return;
      event.preventDefault();
      this.keys.add(event.code);
      this.onChange();
    });
    on(viewport, 'keyup', event => {
      if (!KEYS.has(event.code)) return;
      if (this.keys.delete(event.code)) { event.preventDefault(); this.onChange(); }
    });
    on(viewport, 'focusout', event => { if (!viewport.contains(event.relatedTarget)) this.stop(); });
    on(window, 'blur', () => this.stop());
    on(document, 'visibilitychange', () => { if (document.hidden) this.stop(); });
    on(viewport, 'contextmenu', event => event.preventDefault());
    on(canvas, 'pointerdown', event => {
      if (event.button !== 0) return;
      viewport.focus({ preventScroll: true });
      if (this.mode !== 'walk') return;
      event.preventDefault();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    on(canvas, 'pointermove', event => {
      if (!this.drag || this.drag.id !== event.pointerId || this.mode !== 'walk') return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      this.look.subVectors(this.target, this.camera.position);
      this.spherical.setFromVector3(this.look);
      this.spherical.theta -= dx * 0.004;
      this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi + dy * 0.004, 0.08, Math.PI - 0.08);
      this.target.copy(this.camera.position).add(this.look.setFromSpherical(this.spherical));
      this.camera.lookAt(this.target);
      this.onChange();
    });
    const endDrag = event => { if (this.drag?.id === event.pointerId) this.drag = null; };
    on(canvas, 'pointerup', endDrag); on(canvas, 'pointercancel', endDrag); on(canvas, 'lostpointercapture', endDrag);
    on(canvas, 'wheel', event => {
      if (this.mode !== 'walk' || !viewport.contains(document.activeElement)) return;
      event.preventDefault();
      this.nudge('forward', -THREE.MathUtils.clamp(event.deltaY, -120, 120) * 0.004);
    }, { passive: false });
    for (const button of this.modeButtons) on(button, 'click', () => this.setMode(button.dataset.cameraMode));
    for (const button of this.moveButtons) {
      const direction = button.dataset.cameraMove;
      const end = () => { this.held.delete(direction); button.classList.remove('is-held'); this.onChange(); };
      on(button, 'pointerdown', event => {
        if (event.button !== 0 || this.mode === 'recorded') return;
        event.preventDefault();
        viewport.focus({ preventScroll: true });
        button.setPointerCapture(event.pointerId);
        this.held.add(direction); button.classList.add('is-held');
        this.nudge(direction, 0.1); this.onChange();
      });
      on(button, 'pointerup', end); on(button, 'pointercancel', end); on(button, 'lostpointercapture', end);
      // Enter/Space activation and assistive technology produce a click without a pointer press.
      on(button, 'click', event => { if (event.detail === 0) this.nudge(direction, 0.35); });
    }
    this.setMode('walk');
  }

  setMode(mode) {
    if (!['walk', 'orbit', 'recorded'].includes(mode)) return;
    const previous = this.mode;
    this.stop();
    this.mode = mode;
    this.modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cameraMode === mode)));
    this.moveButtons.forEach(button => { button.disabled = mode === 'recorded'; });
    this.speed.disabled = mode === 'recorded';
    this.viewport.dataset.cameraMode = mode;
    this.onModeChange(mode, previous);
    this.onChange();
  }

  stop() {
    this.keys.clear(); this.held.clear(); this.drag = null;
    this.moveButtons.forEach(button => button.classList.remove('is-held'));
  }

  get moving() {
    return this.mode !== 'recorded' && (this.held.size > 0 || [...this.keys].some(key => !key.startsWith('Shift')));
  }

  basis() {
    this.forward.subVectors(this.target, this.camera.position); this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-8) this.forward.set(0, 0, -1);
    else this.forward.normalize();
    this.right.crossVectors(this.forward, UP).normalize();
  }

  nudge(direction, distance) {
    if (this.mode === 'recorded') return;
    this.basis(); this.delta.set(0, 0, 0);
    if (direction === 'forward') this.delta.copy(this.forward);
    if (direction === 'back') this.delta.copy(this.forward).negate();
    if (direction === 'left') this.delta.copy(this.right).negate();
    if (direction === 'right') this.delta.copy(this.right);
    if (direction === 'up') this.delta.y = 1;
    if (direction === 'down') this.delta.y = -1;
    this.translate(this.delta.multiplyScalar(distance));
    this.onChange();
  }

  update(dt) {
    if (!this.moving || dt <= 0) return;
    const active = (key, direction) => this.keys.has(key) || this.held.has(direction);
    this.basis();
    this.delta.copy(this.forward).multiplyScalar(Number(active('KeyW', 'forward')) - Number(active('KeyS', 'back')));
    this.delta.addScaledVector(this.right, Number(active('KeyD', 'right')) - Number(active('KeyA', 'left')));
    this.delta.y = Number(active('KeyE', 'up')) - Number(active('KeyQ', 'down'));
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.delta.lengthSq()) this.translate(this.delta.normalize().multiplyScalar(dt * Number(this.speed.value) * (fast ? 2.5 : 1)));
  }

  dispose() { this.stop(); this.events.abort(); }
}
