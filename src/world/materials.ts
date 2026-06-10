import * as THREE from 'three'

/**
 * Shared world materials. One material per surface type keeps the whole
 * level at a handful of draw calls per chunk. Placeholder colors now;
 * Task 5 swaps in the ambientCG PBR sets (UVs are already world-meters,
 * so only texture.repeat changes).
 */
export const worldMaterials = {
  carpet: new THREE.MeshStandardMaterial({ color: 0x8a7a45, roughness: 1.0 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xb9a55c, roughness: 0.92 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xd8d0b2, roughness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x4a3c28, roughness: 0.85 }),
  fixture: new THREE.MeshStandardMaterial({
    color: 0xe8e4d8,
    emissive: 0xfff6dc,
    emissiveIntensity: 1.6,
  }),
}
