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

  /** Camcorder zoom 0..1 (RMB). Exposed so the post stack can add tape strain. */
  zoom = 0
  /** Mantle progress: <0 idle, 0..1 climbing (input locked while climbing). */
  private mantleT = -1
  private mantleFrom = new THREE.Vector3()
  private mantleTo = new THREE.Vector3()
  /** External freeze (reading a note, cutscenes). Camera still syncs. */
  frozen = false
  /** Seconds of almond-water steadiness left (damps handheld sway). */
  steadyT = 0

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
    this.steadyT = Math.max(0, this.steadyT - dt)

    if (this.frozen) {
      input.consumeMouse()
      this.syncCamera()
      return
    }

    if (this.mantleT >= 0) {
      this.stepMantle(dt)
      this.updateZoom(dt, input)
      this.syncCamera()
      return
    }

    this.look(input)
    this.updateZoom(dt, input)
    this.crouchStand(dt, input, colliders)
    if (input.isDown('Space')) this.tryMantle(colliders)
    if (this.mantleT >= 0) return
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
    const sens = MOUSE_SENS * (1 - this.zoom * 0.55) // zoomed = steadier
    this.yaw -= dx * sens
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -PITCH_LIMIT, PITCH_LIMIT)
  }

  private updateZoom(dt: number, input: Input): void {
    const target = input.isMouseDown(2) ? 1 : 0
    this.zoom += (target - this.zoom) * (1 - Math.exp(-9 * dt))
    const fov = THREE.MathUtils.lerp(66, 30, this.zoom)
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }

  /**
   * Mantle (DESIGN.md §5): chest-height obstacle ahead + clear top within
   * reach → 0.7s scripted climb, input locked. Raycasts against the BVH
   * colliders: forward at chest height, down to find the ledge, up for
   * headroom.
   */
  private tryMantle(colliders: THREE.Mesh[]): void {
    if (!this.onGround) return
    _move.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))

    _delta.copy(this.position)
    _delta.y += 1.0
    _upRay.set(_delta, _move)
    _upRay.far = RADIUS + 0.65
    let nearest: THREE.Intersection | null = null
    for (const c of colliders) {
      const hit = _upRay.intersectObject(c, false)[0]
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit
    }
    if (!nearest) return

    // top scan: from above a point just past the obstacle face, cast down
    _delta.copy(this.position).addScaledVector(_move, nearest.distance + RADIUS + 0.12)
    _delta.y = this.position.y + 1.45
    _upRay.set(_delta, new THREE.Vector3(0, -1, 0))
    _upRay.far = 1.6
    let top: THREE.Intersection | null = null
    for (const c of colliders) {
      const hit = _upRay.intersectObject(c, false)[0]
      if (hit && (!top || hit.distance < top.distance)) top = hit
    }
    if (!top) return
    const topY = top.point.y
    const rise = topY - this.position.y
    if (rise < 0.35 || rise > 1.2) return

    // headroom above the ledge for a crouched body
    _delta.set(top.point.x, topY + 0.05, top.point.z)
    _upRay.set(_delta, new THREE.Vector3(0, 1, 0))
    _upRay.far = CROUCH_HEIGHT + 0.1
    for (const c of colliders) {
      if (_upRay.intersectObject(c, false).length > 0) return
    }

    this.mantleFrom.copy(this.position)
    this.mantleTo.set(top.point.x, topY + 0.02, top.point.z)
    this.mantleT = 0
    this.velocity.set(0, 0, 0)
  }

  private stepMantle(dt: number): void {
    this.mantleT += dt / 0.7
    const t = Math.min(this.mantleT, 1)
    // rise first (60%), then move over the lip
    const riseT = Math.min(t / 0.6, 1)
    const overT = Math.max((t - 0.55) / 0.45, 0)
    const ease = (v: number): number => v * v * (3 - 2 * v)
    this.position.y = THREE.MathUtils.lerp(this.mantleFrom.y, this.mantleTo.y, ease(riseT))
    this.position.x = THREE.MathUtils.lerp(this.mantleFrom.x, this.mantleTo.x, ease(overT))
    this.position.z = THREE.MathUtils.lerp(this.mantleFrom.z, this.mantleTo.z, ease(overT))
    if (this.mantleT >= 1) {
      this.mantleT = -1
      this.onGround = true
    }
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

    const calm = this.steadyT > 0 ? 0.4 : 1 // almond water steadies the hands
    const bob = this.bobAmount * calm
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * bob
    const bobX = Math.sin(this.bobPhase) * 0.016 * bob
    const roll = Math.sin(this.bobPhase) * 0.006 * bob + Math.sin(this.time * 0.23) * 0.0035 * calm
    const swayYaw = Math.sin(this.time * 0.31) * 0.004 * calm
    const swayPitch = Math.sin(this.time * 0.43) * 0.003 * calm

    this.camera.position.copy(this.position)
    this.camera.position.y += this.eyeHeight + bobY
    _euler.set(this.pitch + swayPitch, this.yaw + swayYaw, roll)
    this.camera.quaternion.setFromEuler(_euler)
    // lateral bob in view space
    _move.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(bobX)
    this.camera.position.add(_move)
  }
}
