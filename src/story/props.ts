import * as THREE from 'three'
import { CELL } from '../world/gen'
import type { InteractSystem } from '../player/interact'
import type { NoteOverlay } from '../player/interact'

/**
 * Interim prop set near spawn to exercise the interaction/mantle systems.
 * The director + narrative tasks replace this with paced placement.
 */
export interface PropSet {
  group: THREE.Group
  colliders: THREE.Mesh[]
}

const FIRST_NOTE = `DAY 3 (?)

the lights never turn off.
the hum gets in your teeth.

if you hear footsteps that
match yours — stop walking.
count to ten.
they keep going.

DON'T trust the arrows.

— D.`

export function buildTestProps(
  scene: THREE.Scene,
  interact: InteractSystem,
  notes: NoteOverlay,
): PropSet {
  const group = new THREE.Group()
  const colliders: THREE.Mesh[] = []
  const S = CELL * 4.5

  // a handwritten note on the carpet
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.297)
  paperGeo.rotateZ(0.6) // heading baked in, so the mesh X-flip keeps the normal up
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xd8cda8,
    roughness: 0.9,
    side: THREE.DoubleSide,
  })
  const paper = new THREE.Mesh(paperGeo, paperMat)
  paper.rotation.x = -Math.PI / 2
  paper.position.set(S + 2.6, 0.012, S - 1.8)
  group.add(paper)
  interact.add({
    object: paper,
    label: 'READ',
    once: false,
    onUse: () => notes.show(FIRST_NOTE),
  })

  // almond water, abandoned against a pillar
  const bottle = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0xcfd8d2, roughness: 0.35, metalness: 0.05 }),
  )
  body.position.y = 0.12
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.6 }),
  )
  cap.position.y = 0.26
  bottle.add(body, cap)
  bottle.position.set(S - 3.1, 0, S + 2.2)
  group.add(bottle)
  interact.add({
    object: body,
    label: 'DRINK',
    onUse: () => {
      scene.remove(bottle)
    },
  })

  // an office desk — mantle target
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x5a4a33, roughness: 0.75 })
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.75), deskMat)
  desk.position.set(S, 0.5, S - 4.2)
  desk.updateMatrix()
  group.add(desk)
  const deskCollider = new THREE.Mesh(desk.geometry.clone().applyMatrix4(desk.matrix))
  deskCollider.geometry.computeBoundsTree()
  deskCollider.visible = false
  deskCollider.updateMatrixWorld(true)
  colliders.push(deskCollider)

  scene.add(group)
  return { group, colliders }
}
