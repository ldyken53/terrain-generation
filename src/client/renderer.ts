import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GUI } from 'dat.gui'
import {
    addRivers,
    buildTerrain,
    cityMap,
    cityToRGB,
    fillSinks,
    fluxErode,
    terrainToDisMap,
    terrainToRGB,
    thermalErode,
} from './terrain'
import { Grid } from './grid'

const MESH_SIZE = 1000
const DISPLACEMENT_SCALE = 100

export class Renderer {
    // Everything below is bound to a dat.GUI control, so it has to stay public.
    size = 500
    waterLevel = 0.1
    randomness = 250
    erosionIterations = 2
    erodeAmount = 1.0
    maxIters = 50
    numRivers = 20
    numCities = 20

    private scene = new THREE.Scene()
    private camera: THREE.PerspectiveCamera
    private renderer = new THREE.WebGLRenderer()
    private controls: OrbitControls
    private material = new THREE.MeshPhongMaterial({ displacementScale: DISPLACEMENT_SCALE })
    private gui = new GUI({ width: window.innerWidth / 5 })
    private grid: Grid
    private heightMap: Float32Array

    constructor() {
        const aspect = window.innerWidth / window.innerHeight
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.01, 5000)
        this.camera.position.set(0, 0, 600)
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        document.body.appendChild(this.renderer.domElement)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)

        this.scene.add(new THREE.AmbientLight(0xffffff, 1))
        const geometry = new THREE.PlaneGeometry(MESH_SIZE, MESH_SIZE, MESH_SIZE, MESH_SIZE)
        this.scene.add(new THREE.Mesh(geometry, this.material))

        this.grid = new Grid(this.size, this.size)
        this.heightMap = buildTerrain(this.grid, this.randomness, this.erosionIterations)
        this.refresh()

        this.buildGUI()
        window.addEventListener('resize', () => this.onWindowResize(), false)
        this.animate()
    }

    private buildGUI() {
        this.gui
            .add(this, 'waterLevel', 0, 1, 0.1)
            .onChange(() => this.repaint())
            .name('Water Level')
        this.gui.add(this, 'randomness', 10, 1000, 10).name('Randomness')
        this.gui.add(this, 'erosionIterations', 0, 10, 1).name('Thermal Erosion Iterations')
        this.gui.add(this, 'size', 100, 2000, 100).name('Terrain Size')
        this.gui.add(this, 'rebuildTerrain').name('Rebuild Terrain')
        this.gui.add(this, 'thermalErode').name('Thermal Erode')
        this.gui.add(this, 'numRivers', 0, 40, 1).name('Num Rivers')
        this.gui.add(this, 'addRivers').name('Add Rivers')
        this.gui.add(this, 'maxIters', 10, 1000, 10).name('Max Iters For Filling Sinks')
        this.gui.add(this, 'fillSinks').name('Fill Sinks')
        this.gui.add(this, 'erodeAmount', 0.1, 2.0, 0.1).name('Flux Erode Amount')
        this.gui.add(this, 'fluxErode').name('Erode with Water Flux')
        this.gui.add(this, 'numCities', 10, 200, 1).name('Number of Cities')
        this.gui.add(this, 'showCities').name('Show Cities')
    }

    /** Discards the terrain and generates a new one at the currently selected size. */
    rebuildTerrain() {
        this.grid = new Grid(this.size, this.size)
        this.heightMap = buildTerrain(this.grid, this.randomness, this.erosionIterations)
        this.refresh()
    }

    thermalErode() {
        thermalErode(this.heightMap, this.grid, this.erosionIterations)
        this.refresh()
    }

    addRivers() {
        addRivers(this.heightMap, this.grid, this.numRivers, this.waterLevel)
        this.refresh()
    }

    fillSinks() {
        fillSinks(this.heightMap, this.grid, this.maxIters, this.waterLevel)
        this.refresh()
    }

    fluxErode() {
        fluxErode(this.heightMap, this.grid, this.erodeAmount)
        this.refresh()
    }

    /** Swaps the colour map for the city territories. Any other action restores the terrain. */
    showCities() {
        const territories = cityMap(this.heightMap, this.grid, this.waterLevel, this.numCities)
        this.setTexture('map', cityToRGB(territories, this.grid, this.numCities))
    }

    /** Recolours the surface from the current heightmap, leaving the geometry alone. */
    private repaint() {
        this.setTexture('map', terrainToRGB(this.heightMap, this.grid, this.waterLevel))
    }

    /** Re-derives both the colour and the displacement of the surface from the heightmap. */
    private refresh() {
        this.repaint()
        this.setTexture('displacementMap', terrainToDisMap(this.heightMap, this.grid))
    }

    /** Installs a freshly generated texture, releasing the one it replaces. */
    private setTexture(slot: 'map' | 'displacementMap', texture: THREE.DataTexture) {
        this.material[slot]?.dispose()
        this.material[slot] = texture
        this.material.needsUpdate = true
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    private animate() {
        requestAnimationFrame(() => this.animate())
        this.controls.update()
        this.renderer.render(this.scene, this.camera)
    }
}
