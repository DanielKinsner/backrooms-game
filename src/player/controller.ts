import * as THREE from 'three'
import type { Input } from '../core/input'

const STAND_HEIGHT = 1.75
const CROUCH_HEIGHT = 1.15
const EYE_OFFSET = 0.15 // eyes sit this far below the capsule top
const RADIUS = 0.35
const WALK_SPEED = 2.2
const SPRINT_SPEED = 4.6
const CROUCH_SPEED = 1.1
const ACCEL_GROUND = 12
const GRAVITY = -22
const TERMINAL_VY = -30
const MOUSE_SENS = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.12

const _delta = new THREE.Vector3()
const _move = new THREE.Vector3()
const _segment = new THREE.Line3()
const _box = new THREE.Box3()
const _invMat = new THREE.Matrix4()
const _triPoint = new THREE.Vector3()
const _capsulePoint = new THREE.Vector3()
const _newStart = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _upRay = new THREE.Raycaster()
_upRay.firstHitOnly = true

/**
 * Hand-rolled first-person capsule controller (DESIGN.md §5, tech brief §4).
 * Capsule = vertical segment + radius, resolved against three-mesh-bvh
 * boundsTree colliders via shapecast push-out. No physics engine —
 * a walking sim needs exactly one capsule.
 *
 * `position` is the capsule's lowest point (the feet).
 */
export class PlayerController {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  height = STAND_HEIGHT
  onGround = false
  crouching = false
  sprinting = false

  private spawn = new THREE.Vector3()
  private time = 0
  private bobPhase = 0
  private bobAmount = 0 // smoothed walk-energy 0..1

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  setSpawn(x: number, y: number, z: number, yaw = 0): void {
    this.spawn.set(x, y, z)
    this.yaw = yaw
    this.respawn()
  }

  respawn(): void {
    this.position.copy(this.spawn)
    this.velocity.set(0, 0, 0)
    this.pitch = 0
    this.syncCamera()
  }

  get eyeHeight(): number {
    return this.height - EYE_OFFSET
  }

  update(dt: number, input: Input, colliders: THREE.Mesh[]): void {
    this.time += dt
    this.look(input)
    this.crouchStand(dt, input, colliders)
    this.accelerate(dt, input)

    // Integrate
    this.position.addScaledVector(this.velocity, dt)

    // Resolve collisions
    const pushY = this.collide(colliders)

    // Grounding: a meaningful upward correction while falling means floor.
    this.onGround = this.velocity.y <= 0 && pushY > Math.abs(dt * this.velocity.y * 0.25)
    if (this.onGround) {
      this.velocity.y = 0
    }

    // Safety net: fell out of the world.
    if (this.position.y < -20) this.respawn()

    this.syncCamera()
  }

  private look(input: Input): void {
    const { dx, dy } = input.consumeMouse()
    this.yaw -= dx * MOUSE_SENS
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * MOUSE_SENS, -PITCH_LIMIT, PITCH_LIMIT)
  }

  private crouchStand(dt: number, input: Input, colliders: THREE.Mesh[]): void {
    const wantCrouch = input.isDown('ControlLeft') || input.isDown('KeyC')
    if (!wantCrouch && this.crouching) {
      // Only stand if there's headroom.
      _move.copy(this.position)
      _move.y += this.height - RADIUS
      _upRay.set(_move, new THREE.Vector3(0, 1, 0))
      _upRay.far = STAND_HEIGHT - this.height + RADIUS + 0.05
      const blocked = colliders.some((c) => _upRay.intersectObject(c, false).length > 0)
      if (!blocked) this.crouching = false
    } else if (wantCrouch) {
      this.crouching = true
    }

    const target = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT
    this.height = THREE.MathUtils.damp(this.height, target, 14, dt)
  }

  private accelerate(dt: number, input: Input): void {
    _move.set(0, 0, 0)
    if (input.isDown('KeyW')) _move.z -= 1
    if (input.isDown('KeyS')) _move.z += 1
    if (input.isDown('KeyA')) _move.x -= 1
    if (input.isDown('KeyD')) _move.x += 1
    if (_move.lengthSq() > 0) _move.normalize()
    _move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)

    this.sprinting = input.isDown('ShiftLeft') && !this.crouching && _move.lengthSq() > 0
    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED
    _move.multiplyScalar(speed)

    // Exponential approach to target horizontal velocity.
    const k = 1 - Math.exp(-ACCEL_GROUND * dt)
    this.velocity.x += (_move.x - this.velocity.x) * k
    this.velocity.z += (_move.z - this.velocity.z) * k

    if (!this.onGround) {
      this.velocity.y = Math.max(this.velocity.y + GRAVITY * dt, TERMINAL_VY)
    } else {
      this.velocity.y = -2 // small stick-to-ground force
    }
  }

  /** Push the capsule out of every collider. Returns total upward correction. */
  private collide(colliders: THREE.Mesh[]): number {
    let totalPushY = 0
    for (let iter = 0; iter < 3; iter++) {
      let moved = false
      for (const collider of colliders) {
        const bvh = collider.geometry.boundsTree
        if (!bvh) continue

        _invMat.copy(collider.matrixWorld).invert()
        _segment.start.copy(this.position)
        _segment.start.y += RADIUS
        _segment.end.copy(this.position)
        _segment.end.y += this.height - RADIUS
        _newStart.copy(_segment.start)
        _segment.start.applyMatrix4(_invMat)
        _segment.end.applyMatrix4(_invMat)

        _box.makeEmpty()
        _box.expandByPoint(_segment.start)
        _box.expandByPoint(_segment.end)
        _box.min.addScalar(-RADIUS)
        _box.max.addScalar(RADIUS)

        bvh.shapecast({
          intersectsBounds: (box) => box.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            const distance = tri.closestPointToSegment(_segment, _triPoint, _capsulePoint)
            if (distance < RADIUS) {
              const depth = RADIUS - distance
              const direction = _capsulePoint.sub(_triPoint).normalize()
              _segment.start.addScaledVector(direction, depth)
              _segment.end.addScaledVector(direction, depth)
            }
          },
        })

        // Back to world space; how far did the capsule get pushed?
        _delta.copy(_segment.start).applyMatrix4(collider.matrixWorld).sub(_newStart)
        if (_delta.lengthSq() > 1e-10) {
          moved = true
          totalPushY += Math.max(_delta.y, 0)
          this.position.add(_delta)
          // Kill velocity into the surface so walls don't accumulate speed.
          const into = _delta.clone().normalize()
          const vn = this.velocity.dot(into)
          if (vn < 0) this.velocity.addScaledVector(into, -vn)
        }
      }
      if (!moved) break
    }
    return totalPushY
  }

  /**
   * Amateur-camcorder feel (market brief: gimbal-smooth kills immersion):
   * walk bob scaled by speed, plus a slow idle breathing sway. Subtle.
   */
  private syncCamera(): void {
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    const energy = Math.min(horizSpeed / SPRINT_SPEED, 1)
    this.bobAmount += (energy - this.bobAmount) * 0.12
    this.bobPhase += horizSpeed * 0.55 * (1 / 60)

    const bob = this.bobAmount
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * bob
    const bobX = Math.sin(this.bobPhase) * 0.016 * bob
    const roll = Math.sin(this.bobPhase) * 0.006 * bob + Math.sin(this.time * 0.23) * 0.0035
    const swayYaw = Math.sin(this.time * 0.31) * 0.004
    const swayPitch = Math.sin(this.time * 0.43) * 0.003

    this.camera.position.copy(this.position)
    this.camera.position.y += this.eyeHeight + bobY
    _euler.set(this.pitch + swayPitch, this.yaw + swayYaw, roll)
    this.camera.quaternion.setFromEuler(_euler)
    // lateral bob in view space
    _move.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(bobX)
    this.camera.position.add(_move)
  }
}
