import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type CubitoScene = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  dispose(): void
}

/**
 * Renderer/camera/controls bootstrap. Deliberately thin: everything with
 * logic lives outside so it can be tested without WebGL.
 */
export function createScene(container: HTMLElement): CubitoScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e12)
  scene.fog = new THREE.FogExp2(0x0a0e12, 0.012)

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  )
  camera.position.set(0, 14, 34)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  scene.add(new THREE.AmbientLight(0x334455, 1.2))
  const key = new THREE.DirectionalLight(0x9fef00, 0.8)
  key.position.set(10, 20, 10)
  scene.add(key)

  const grid = new THREE.GridHelper(200, 40, 0x1c2a1a, 0x11181f)
  grid.position.y = -12
  scene.add(grid)

  const onResize = (): void => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    scene,
    camera,
    renderer,
    controls,
    dispose() {
      renderer.setAnimationLoop(null)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }
}
