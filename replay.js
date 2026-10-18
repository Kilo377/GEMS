import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFullSkin } from './replay-skin.js';
import { RoomCameraBounds } from './replay-room.js?v=20261018-scene20';
import { ReplayNavigation } from './replay-navigation.js?v=20261016-clean17';

// All assets are relative to this module; works under a GitHub Pages project subpath.
const host = document.querySelector('#interactive-demo');
const $ = id => host.querySelector(`[data-replay="${id}"]`);
let renderer, scene, camera, controls, root, data, floats, meshes = [], materials = [];
let loading = false;
const fullSkinTextures = new Set();
const sourceTextures = new Set();
let seconds = 0, playing = false, visible = false, pending = false, previous = 0, loaded = false;
let width = 1, height = 1, homePosition, homeTarget, sceneHomePosition, sceneHomeTarget, sceneBounds;
let freeMaxDistance = 100;
let navigation;
const cameraDirection = new THREE.Vector3();
const scratchA = new THREE.Matrix4(), scratchB = new THREE.Matrix4();
const pa = new THREE.Vector3(), pb = new THREE.Vector3(), sa = new THREE.Vector3(), sb = new THREE.Vector3();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const reflect = new THREE.Matrix4().makeScale(1, 1, -1);

function recorded() { return navigation?.mode === 'recorded'; }
function sceneLimitsEnabled() { return sceneBounds && $('room').checked && !recorded(); }
function enforceSceneBounds() {
  if (!sceneLimitsEnabled()) return;
  const changed = navigation?.mode === 'orbit'
    ? sceneBounds.constrain(camera.position, controls.target)
    : sceneBounds.constrainWalk(camera.position, controls.target);
  if (changed) camera.lookAt(controls.target);
}
function translateCamera(delta) {
  camera.position.add(delta); controls.target.add(delta);
  // Preserve orientation when translating; only orbit gestures constrain the focus point.
  if (sceneLimitsEnabled()) sceneBounds.constrainWalk(camera.position, controls.target);
  camera.lookAt(controls.target);
}
function onViewChange() { enforceSceneBounds(); requestDraw(); }
function setNavigationMode(mode, previous) {
  controls.enabled = mode === 'orbit';
  if (previous === 'recorded' && mode !== 'recorded') {
    camera.getWorldDirection(cameraDirection);
    controls.target.copy(camera.position).addScaledVector(cameraDirection, 2.5);
  }
  $('hint').textContent = mode === 'recorded'
    ? 'The camera follows the original recording. Choose Walk or Orbit to explore freely.'
    : mode === 'orbit'
      ? 'Drag to orbit, scroll to zoom, or right-drag to pan. Click the scene to use W/A/S/D and Q/E.'
      : 'Click the scene to explore · W/A/S/D to move · Drag to look · Q/E to move down/up · Shift to move faster';
  if (mode !== 'recorded') { enforceSceneBounds(); camera.lookAt(controls.target); }
  requestDraw();
}
function structuralKind(node) {
  // Legacy captures have one broad cover flag. Use structural names to avoid
  // hiding furniture such as Clothcloset_with_wall or wall-mounted lamps.
  const name = node.name || '';
  if (node.roof || /^(roof|ceiling)|屋顶|天花/i.test(name)) return 'roof';
  if (node.wall || /^(wall(?:_|s$)|墙)/i.test(name)) return 'wall';
  return '';
}
function updateSceneHome() {
  const home = sceneBounds.home();
  sceneHomePosition = home.position; sceneHomeTarget = home.target;
  if (data.hasCamera) {
    // The first captured camera is already an interior composition in this scene.
    const offset = 1 + data.stride - 17;
    const matrix = new THREE.Matrix4().fromArray(floats, offset).premultiply(reflect).multiply(reflect);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    if (sceneBounds.cameraBox.containsPoint(position)) {
      sceneHomePosition.copy(position);
      sceneHomeTarget.copy(position).add(new THREE.Vector3(0, 0, -2.5).applyQuaternion(rotation));
      sceneBounds.constrain(sceneHomePosition, sceneHomeTarget);
    }
  }
}

async function fetchOK(url, kind = 'json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset unavailable (${response.status}): ${new URL(url).pathname}`);
  return kind === 'json' ? response.json() : response.arrayBuffer();
}
function attribute(buffer, span, itemSize) {
  if (!span || !span.count) return null;
  const array = span.type === 'u32' ? new Uint32Array(buffer, span.offset, span.count) : new Float32Array(buffer, span.offset, span.count);
  return new THREE.BufferAttribute(array, itemSize);
}
function matrixAt(offset, frame, matrix) { return matrix.fromArray(floats, frame * (data.stride + 1) + 1 + offset); }
function interpolate(offset, a, b, alpha, target) {
  matrixAt(offset, a, scratchA).decompose(pa, qa, sa);
  matrixAt(offset, b, scratchB).decompose(pb, qb, sb);
  target.compose(pa.lerp(pb, alpha), qa.slerp(qb, alpha), sa.lerp(sb, alpha));
}
function locate(time) {
  let low = 0, high = data.frames - 1;
  while (low < high) { const m = Math.ceil((low + high) / 2); if (floats[m * (data.stride + 1)] <= time) low = m; else high = m - 1; }
  const next = Math.min(low + 1, data.frames - 1);
  const start = floats[low * (data.stride + 1)], end = floats[next * (data.stride + 1)];
  return [low, next, end > start ? THREE.MathUtils.clamp((time - start) / (end - start), 0, 1) : 0];
}
function pose() {
  const [a, b, alpha] = locate(seconds);
  for (const item of meshes) {
    const n = item.node;
    if (n.track >= 0 && !n.skin) interpolate(n.track, a, b, alpha, item.group.matrix);
    const on = n.track < 0 || floats[a * (data.stride + 1) + 1 + n.track + 16] > .5;
    const kind = item.structuralKind;
    item.group.visible = on && !(kind === 'wall' && !$('walls').checked) && !(kind === 'roof' && !$('roofs').checked);
    item.group.matrixWorldNeedsUpdate = true;
    if (n.skin) {
      for (let j = 0; j < n.bones; j++) {
        interpolate(n.boneTrack + j * 16, a, b, alpha, item.bones[j].matrix);
        item.bones[j].matrixWorldNeedsUpdate = true;
      }
    }
  }
  if (recorded()) {
    const offset = data.stride - 17;
    const fov = floats[a * (data.stride + 1) + 1 + offset + 16];
    if (fov > 0) {
      interpolate(offset, a, b, alpha, scratchB);
      // Camera local +Z in Unity corresponds to -Z in Three.js.
      scratchB.premultiply(reflect).multiply(reflect).decompose(camera.position, camera.quaternion, camera.scale);
      camera.scale.set(1, 1, 1);
      camera.fov = fov; camera.updateProjectionMatrix();
    }
  }
  $('seek').value = seconds;
}
function requestDraw() { if (loaded && visible && !document.hidden && !pending) { pending = true; requestAnimationFrame(draw); } }
function draw(now) {
  pending = false;
  if (!loaded || !visible || document.hidden) { previous = 0; return; }
  const dt = previous ? Math.min((now - previous) / 1000, .1) : 0;
  previous = now;
  if (playing) {
    seconds += dt;
    if (seconds >= data.duration) { seconds = data.duration; playing = false; $('play').textContent = 'Play'; }
  }
  navigation?.update(dt);
  pose();
  if (!recorded()) {
    if (navigation?.mode === 'orbit') controls.update();
    enforceSceneBounds();
  }
  renderer.render(scene, camera);
  if (playing || navigation?.moving) requestDraw(); else previous = 0;
}
function reset() {
  navigation?.setMode('walk');
  controls.enabled = false;
  const restricted = sceneLimitsEnabled();
  controls.minDistance = 0.35; controls.maxDistance = freeMaxDistance;
  camera.position.copy(restricted ? sceneHomePosition : homePosition); camera.fov = 45; camera.updateProjectionMatrix();
  controls.target.copy(restricted ? sceneHomeTarget : homeTarget);
  enforceSceneBounds(); camera.lookAt(controls.target); previous = 0; requestDraw();
}
export async function load() {
  if (loading || loaded) return; loading = true;
  $('load').disabled = true; $('status').textContent = 'Loading scene and motion…';
  try {
    if (location.protocol === 'file:') throw new Error('Please open this website through HTTP, not by double-clicking the HTML file.');
    const catalogURL = new URL('./assets/replay/catalog.json', import.meta.url);
    const catalog = await fetchOK(catalogURL);
    if (!catalog.manifest) throw new Error('The interactive capture has not been exported from Unity yet. The recorded video is available above.');
    const manifestURL = new URL(catalog.manifest, catalogURL);
    manifestURL.searchParams.set('v', '20261016-english8');
    data = await fetchOK(manifestURL);
    if (!['gems-replay-v1', 'gems-replay-v2'].includes(data.format) || data.frames < 2) throw new Error('Unsupported or incomplete capture.');
    const [geometry, motion] = await Promise.all([fetchOK(new URL(data.geometry, manifestURL), 'binary'), fetchOK(new URL(data.animation, manifestURL), 'binary')]);
    floats = new Float32Array(motion);
    if (floats.length !== data.frames * (data.stride + 1)) throw new Error('Animation data is incomplete.');
    scene = new THREE.Scene(); scene.background = new THREE.Color('white');
    root = new THREE.Group(); root.scale.z = -1; scene.add(root);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc1bdba, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(4, 10, 6); scene.add(light);
    camera = new THREE.PerspectiveCamera(45, width / height, .03, 2000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.debug.onShaderError = () => {
      playing = false;
      $('play').textContent = 'Play';
      $('status').textContent = 'The graphics driver could not compile the full-weight skin shader. See the browser console for details; no simplified skin was substituted.';
    };
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    $('viewport').append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false;
    controls.minDistance = 0.35; controls.addEventListener('change', onViewChange);
    const loader = new THREE.TextureLoader();
    const cache = new Map();
    materials = await Promise.all(data.materials.map(async m => {
      let map = null;
      if (m.texture) {
        const url = new URL(m.texture, manifestURL).href;
        if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
        const originalTexture = await cache.get(url); sourceTextures.add(originalTexture); map = originalTexture.clone(); map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(m.uv[0], m.uv[1]); map.offset.set(m.uv[2], m.uv[3]); map.needsUpdate = true;
      }
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.color[0], m.color[1], m.color[2]), map, roughness: Math.max(.25, m.roughness), metalness: 0, side: THREE.DoubleSide, transparent: m.transparent, opacity: m.transparent ? m.color[3] : 1, alphaTest: m.cutoff });
      mat.userData.original = mat.color.clone(); mat.userData.map = map; return mat;
    }));
    const attributeCache = new Map();
    const sharedAttribute = (span, size) => {
      if (!span || !span.count) return null; const key = `${span.offset}:${span.count}:${span.type}:${size}`;
      if (!attributeCache.has(key)) attributeCache.set(key, attribute(geometry, span, size)); return attributeCache.get(key);
    };
    for (const n of data.nodes) {
      // Older exports can contain empty material slots. They draw no triangles;
      // setting a null index would instead make Three treat them as non-indexed meshes.
      const parts = (n.parts || []).filter(part => {
        if (!part.indices || !Number.isInteger(part.indices.count) || part.indices.count < 0)
          throw new Error(`Missing or invalid triangle indices: ${n.name}`);
        if (part.indices.count % 3 !== 0) throw new Error(`Incomplete triangle indices: ${n.name}`);
        return part.indices.count > 0;
      });
      if (!parts.length) continue;
      if (!n.positions || !Number.isInteger(n.positions.count) || n.positions.count <= 0 || n.positions.count % 3 !== 0)
        throw new Error(`Missing or invalid vertex positions: ${n.name}`);
      const group = new THREE.Group(); group.matrixAutoUpdate = false;
      if (!n.skin) group.matrix.fromArray(n.matrix);
      root.add(group);
      const item = { node: n, group, bones: [], structuralKind: structuralKind(n) }; meshes.push(item);
      let skeleton, fullSkin;
      if (n.skin) {
        const inverses = attribute(geometry, n.inverses, 16).array;
        for (let j = 0; j < n.bones; j++) { const bone = new THREE.Bone(); bone.matrixAutoUpdate = false; group.add(bone); item.bones.push(bone); }
        skeleton = new THREE.Skeleton(item.bones, item.bones.map((_, j) => new THREE.Matrix4().fromArray(inverses, j * 16)));
      }
      if (n.skin && n.influences > 0 && n.influences !== 4) {
        fullSkin = createFullSkin(renderer, n, attribute(geometry, n.joints, n.influences).array, attribute(geometry, n.weights, n.influences).array);
        fullSkinTextures.add(fullSkin.texture);
      }
      for (const part of parts) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', sharedAttribute(n.positions, 3));
        const normals = sharedAttribute(n.normals, 3), uv = sharedAttribute(n.uv, 2);
        if (normals) geo.setAttribute('normal', normals); if (uv) geo.setAttribute('uv', uv);
        geo.setIndex(sharedAttribute(part.indices, 1)); if (!normals) geo.computeVertexNormals();
        let mesh;
        if (n.skin) {
          let material = materials[part.material];
          if (fullSkin) {
            material = fullSkin.material(material); materials.push(material);
            // These satisfy the standard SkinnedMesh interface only. The custom shader reads every weight.
            geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n.positions.count / 3 * 4), 4));
            geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n.positions.count / 3 * 4), 4));
          } else {
            geo.setAttribute('skinIndex', sharedAttribute(n.joints, 4)); geo.setAttribute('skinWeight', sharedAttribute(n.weights, 4));
          }
          mesh = new THREE.SkinnedMesh(geo, material); mesh.bind(skeleton, new THREE.Matrix4()); mesh.frustumCulled = false;
          // Three's CPU bounding-box calculation supports four influences only; never use it to truncate geometry.
          geo.computeBoundingBox(); mesh.boundingBox = geo.boundingBox.clone();
          geo.computeBoundingSphere(); mesh.boundingSphere = geo.boundingSphere.clone();
        } else mesh = new THREE.Mesh(geo, materials[part.material]);
        group.add(mesh);
      }
    }
    pose(); scene.updateMatrixWorld(true);
    const box = new THREE.Box3(), sceneBox = new THREE.Box3(), point = new THREE.Vector3();
    for (const item of meshes) {
      if (item.node.skin) { for (const bone of item.bones) box.expandByPoint(bone.getWorldPosition(point)); }
      else item.group.traverse(object => {
        if (!object.isMesh) return;
        const positions = object.geometry.getAttribute('position'), indices = object.geometry.index;
        // Combined meshes can contain unselected rooms: frame only vertices actually drawn by this part.
        if (!positions) throw new Error(`Missing vertex positions while framing: ${item.node.name}`);
        const count = indices ? indices.count : positions.count;
        for (let i = 0; i < count; i++) {
          point.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
          if (item.group.visible) box.expandByPoint(point);
          // Static geometry defines the outer scene limits, even when walls/roofs are hidden.
          if (item.node.track < 0) sceneBox.expandByPoint(point);
        }
      });
    }
    if (box.isEmpty()) throw new Error('No visible scene geometry in this capture.');
    sceneBounds = RoomCameraBounds.fromSceneBox(sceneBox.isEmpty() ? box : sceneBox);
    homeTarget = box.getCenter(new THREE.Vector3());
    const radius = Math.max(2, box.getSize(new THREE.Vector3()).length() * .5);
    homePosition = homeTarget.clone().add(new THREE.Vector3(radius, radius * .75, radius));
    freeMaxDistance = radius * 8; controls.maxDistance = freeMaxDistance; camera.far = Math.max(200, radius * 20);
    updateSceneHome();
    $('seek').max = data.duration; $('seek').step = 1 / data.fps;
    $('tools').hidden = false;
    $('camera-tools').hidden = false;
    host.querySelector('[data-camera-mode="recorded"]').disabled = !data.hasCamera;
    navigation = new ReplayNavigation({ camera, target: controls.target, viewport: $('viewport'), canvas: renderer.domElement,
      panel: $('camera-tools'), translate: translateCamera, onChange: requestDraw, onModeChange: setNavigationMode });
    $('load').hidden = true;
    $('status').textContent = ''; loaded = true; reset(); requestDraw();
  } catch (error) { dispose(); $('status').textContent = error.message; $('load').disabled = false; } finally { loading = false; }
}
function dispose() {
  loaded = false; playing = false; navigation?.dispose(); navigation = null; controls?.dispose();
  for (const { group } of meshes) group.traverse(o => { o.geometry?.dispose(); if (o.isSkinnedMesh) o.skeleton?.dispose(); });
  for (const m of materials) { m.userData.map?.dispose(); m.dispose(); }
  for (const texture of fullSkinTextures) texture.dispose(); fullSkinTextures.clear();
  for (const texture of sourceTextures) texture.dispose(); sourceTextures.clear();
  renderer?.dispose(); renderer?.domElement.remove(); renderer = null; controls = null; meshes = []; materials = [];
}

$('play').addEventListener('click', () => { if (seconds >= data.duration) seconds = 0; playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; previous = 0; requestDraw(); });
$('seek').addEventListener('input', e => { seconds = Number(e.target.value); previous = 0; requestDraw(); });
$('reset').addEventListener('click', reset);
$('walls').addEventListener('change', requestDraw);
$('roofs').addEventListener('change', requestDraw);
$('room').addEventListener('change', () => { enforceSceneBounds(); requestDraw(); });
$('gray').addEventListener('change', e => { for (const m of materials) { m.color.copy(e.target.checked ? new THREE.Color(.65, .65, .65) : m.userData.original); m.map = e.target.checked ? null : m.userData.map; m.needsUpdate = true; } requestDraw(); });
new ResizeObserver(entries => { const r = entries[0].contentRect; width = Math.max(1, r.width); height = Math.max(1, r.height); if (renderer) { renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); requestDraw(); } }).observe($('viewport'));
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible) navigation?.stop(); previous = 0; requestDraw(); }, { threshold: .05 }).observe(host);
document.addEventListener('visibilitychange', () => { previous = 0; requestDraw(); });
window.addEventListener('pagehide', dispose);
