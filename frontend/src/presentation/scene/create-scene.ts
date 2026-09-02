import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { ScenePalette } from '../theme/scene-palette'
import {
  CAMERA_DISTANCE,
  MAX_POLAR_DEG,
  MAX_RADIUS,
  MIN_POLAR_DEG,
  ORBIT_DAMPING,
  MIN_RADIUS,
  REFERENCE_HALF_HEIGHT
} from '../theme/scene-metrics'
import { createIsoGrid } from './iso-grid'

export type FrameCallback = (elapsedSeconds: number, deltaSeconds: number) => void
export type ResizeCallback = (width: number, height: number) => void

export type CubitoScene = {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  labelRenderer: CSS2DRenderer
  labelLayer: THREE.Object3D
  controls: OrbitControls
  /** Subscribe to the single animation loop. Returns an unsubscribe function. */
  onFrame(callback: FrameCallback): () => void
  /** Subscribe to resize. Fires once immediately with the current size, so subscribers
   *  that depend on it (LineMaterial.resolution, camera aspect) are never left unset. */
  onResize(callback: ResizeCallback): () => void
  dispose(): void
}

const MAX_PIXEL_RATIO = 2
/** Ortho depth range around the framing target; generous because ortho has no perspective cost. */
const DEPTH_MARGIN = MAX_RADIUS * 2 * 2

/**
 * Renderer / camera / controls / label-layer bootstrap and the app's ONLY
 * `setAnimationLoop` (design §5.5). Everything with logic lives outside so it can be
 * tested without WebGL; this file is a declared exclusion from unit coverage (NG-309)
 * because it constructs a `WebGLRenderer` and touches `window`/`document`.
 */
export function createScene(container: HTMLElement, palette: ScenePalette): CubitoScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(palette.background)
  // Horizon fade tied to the grid's own fade radius so the two never disagree.

  const width = container.clientWidth
  const height = container.clientHeight
  const aspect = width / height

  const camera = new THREE.OrthographicCamera(
    -REFERENCE_HALF_HEIGHT * aspect,
    REFERENCE_HALF_HEIGHT * aspect,
    REFERENCE_HALF_HEIGHT,
    -REFERENCE_HALF_HEIGHT,
    CAMERA_DISTANCE - DEPTH_MARGIN,
    CAMERA_DISTANCE + DEPTH_MARGIN
  )

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  const labelLayer = new THREE.Object3D()
  scene.add(labelLayer)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = ORBIT_DAMPING
  controls.screenSpacePanning = false
  controls.minPolarAngle = THREE.MathUtils.degToRad(MIN_POLAR_DEG)
  controls.maxPolarAngle = THREE.MathUtils.degToRad(MAX_POLAR_DEG)
  controls.minZoom = REFERENCE_HALF_HEIGHT / MAX_RADIUS
  controls.maxZoom = REFERENCE_HALF_HEIGHT / MIN_RADIUS

  const grid = createIsoGrid()
  grid.apply(palette.gridLine)
  scene.add(grid.object)

  const frameCallbacks = new Set<FrameCallback>()
  const resizeCallbacks = new Set<ResizeCallback>()

  const clock = new THREE.Clock()
  let elapsedSeconds = 0

  const onVisibilityChange = (): void => {
    // The clock is stopped rather than merely skipped, so animations resume in phase
    // instead of jumping forward by the hidden duration.
    if (document.hidden) clock.stop()
    else clock.start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  const onWindowResize = (): void => {
    const nextWidth = container.clientWidth
    const nextHeight = container.clientHeight
    renderer.setSize(nextWidth, nextHeight)
    labelRenderer.setSize(nextWidth, nextHeight)
    for (const callback of [...resizeCallbacks]) callback(nextWidth, nextHeight)
  }
  window.addEventListener('resize', onWindowResize)

  renderer.setAnimationLoop(() => {
    if (document.hidden) return
    const deltaSeconds = clock.getDelta()
    elapsedSeconds += deltaSeconds
    controls.update()
    for (const callback of [...frameCallbacks]) callback(elapsedSeconds, deltaSeconds)
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  })

  return {
    scene,
    camera,
    renderer,
    labelRenderer,
    labelLayer,
    controls,
    onFrame(callback: FrameCallback): () => void {
      frameCallbacks.add(callback)
      return () => void frameCallbacks.delete(callback)
    },
    onResize(callback: ResizeCallback): () => void {
      resizeCallbacks.add(callback)
      callback(container.clientWidth, container.clientHeight)
      return () => void resizeCallbacks.delete(callback)
    },
    dispose(): void {
      renderer.setAnimationLoop(null)
      window.removeEventListener('resize', onWindowResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      frameCallbacks.clear()
      resizeCallbacks.clear()
      grid.dispose()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
    }
  }
}
