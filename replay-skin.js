import * as THREE from 'three';

// Three r180 standard material lighting, with all SOMA influences fetched in the vertex shader.
// One RGBA texel per influence: joint index, exact weight, 0, 0. Indexed draws use vertex ID.
export function createFullSkin(renderer, node, joints, weights) {
  const count = node.positions.count / 3, stride = node.influences;
  if (!Number.isInteger(stride) || stride < 1 || joints.length !== count * stride || weights.length !== joints.length)
    throw new Error(`Invalid complete skin weights: ${node.name}`);
  const limit = renderer.capabilities.maxTextureSize;
  const width = Math.min(1024, limit), height = Math.ceil(joints.length / width);
  if (height > limit) throw new Error('This device cannot hold the full skin-weight texture. No weights were discarded.');
  const values = new Float32Array(width * height * 4);
  for (let i = 0; i < joints.length; i++) {
    if (!Number.isFinite(weights[i]) || weights[i] < 0 || joints[i] >= node.bones) throw new Error(`Invalid skin influence: ${node.name}`);
    values[i * 4] = joints[i]; values[i * 4 + 1] = weights[i];
  }
  const texture = new THREE.DataTexture(values, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  return {
    texture,
    material(base) {
      const material = base.clone();
      material.userData.original = base.userData.original.clone(); material.userData.map = base.userData.map;
      material.customProgramCacheKey = () => `gems-full-influence-r180-${stride}`;
      material.onBeforeCompile = shader => {
        shader.uniforms.gemsInfluences = { value: texture };
        shader.uniforms.gemsInfluenceWidth = { value: width };
        shader.vertexShader = 'uniform highp sampler2D gemsInfluences;\nuniform int gemsInfluenceWidth;\n' + shader.vertexShader;
        const baseChunk = `
          #ifdef USE_SKINNING
            mat4 gemsSkin = mat4(0.0);
            for (int influence = 0; influence < ${stride}; influence++) {
              int index = gl_VertexID * ${stride} + influence;
              vec2 item = texelFetch(gemsInfluences, ivec2(index % gemsInfluenceWidth, index / gemsInfluenceWidth), 0).xy;
              if (item.y > 0.0) gemsSkin += getBoneMatrix(item.x) * item.y;
            }
          #endif`;
        const normalChunk = `
          #ifdef USE_SKINNING
            mat4 gemsNormal = bindMatrixInverse * gemsSkin * bindMatrix;
            objectNormal = (gemsNormal * vec4(objectNormal, 0.0)).xyz;
            #ifdef USE_TANGENT
              objectTangent = (gemsNormal * vec4(objectTangent, 0.0)).xyz;
            #endif
          #endif`;
        const positionChunk = `
          #ifdef USE_SKINNING
            transformed = (bindMatrixInverse * gemsSkin * bindMatrix * vec4(transformed, 1.0)).xyz;
          #endif`;
        const replacements = [['skinbase_vertex', baseChunk], ['skinnormal_vertex', normalChunk], ['skinning_vertex', positionChunk]];
        for (const [name, replacement] of replacements) {
          const token = `#include <${name}>`;
          if (!shader.vertexShader.includes(token)) throw new Error('Incompatible Three.js skinning shader version.');
          shader.vertexShader = shader.vertexShader.replace(token, replacement);
        }
      };
      return material;
    }
  };
}
