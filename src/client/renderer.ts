import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GUI } from 'dat.gui'
import { addRivers, buildTerrain, cityMap, cityToRGB, fillSinks, fluxErode, terrainToDisMap, terrainToRGB, thermalErode } from './terrain'

export class Renderer {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    size: number
    waterLevel: number
    randomness: number
    erosionIterations: number
    erodeAmount: number
    maxIters: number
    numRivers: number
    numCities: number
    controls: OrbitControls
    geometry: THREE.PlaneGeometry
    material: THREE.MeshPhongMaterial
    plane: THREE.Mesh<any, any, THREE.Object3DEventMap>
    gui: GUI
    disMap: THREE.DataTexture
    rgbMap: THREE.DataTexture
    cityRGB: THREE.DataTexture
    heightMap: Float32Array
    cityMap: Uint8Array

    constructor() {
        this.size = 500
        this.waterLevel = 0.1
        this.randomness = 250
        this.erosionIterations = 2
        this.erodeAmount = 1.0
        this.maxIters = 50
        this.numRivers = 20
        this.numCities = 20
        
        this.scene = new THREE.Scene()
        const ambientLight = new THREE.AmbientLight( 0xffffff, 1 )
        this.scene.add( ambientLight )
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 5000)
        this.camera.position.set(0, 0, 600)
    
        this.renderer = new THREE.WebGLRenderer()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        document.body.appendChild(this.renderer.domElement)

        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.geometry = new THREE.PlaneGeometry(1000, 1000, 1000, 1000)
        this.material = new THREE.MeshPhongMaterial({ displacementScale: 100 })
        this.plane = new THREE.Mesh(this.geometry, this.material)
        this.scene.add(this.plane)

        this.heightMap = buildTerrain(this.size, this.size, this.randomness, this.erosionIterations)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.cityMap = cityMap(this.heightMap, this.size, this.size, this.waterLevel, this.numCities)
        this.cityRGB = cityToRGB(this.cityMap, this.size, this.size, this.numCities)

        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
        
        this.gui = new GUI({ width: window.innerWidth / 5 })
        this.gui.add(this, "waterLevel", 0, 1, 0.1).onChange(() => { this.updateRGB() }).name('Water Level')
        this.gui.add(this, "randomness", 10, 1000, 10).name("Randomness")
        this.gui.add(this, "erosionIterations", 0, 10, 1).name("Thermal Erosion Iterations")
        this.gui.add(this, "size", 100, 2000, 100).name("Terrain Size")
        this.gui.add(this, "rebuildTerrain").name("Rebuild Terrain")
        this.gui.add(this, "thermalErode").name("Thermal Erode")
        this.gui.add(this, "numRivers", 0, 40, 1).name("Num Rivers")
        this.gui.add(this, "addRivers").name("Add Rivers")
        this.gui.add(this, "maxIters", 10, 1000, 10).name("Max Iters For Filling Sinks")
        this.gui.add(this, "fillSinks").name("Fill Sinks")
        this.gui.add(this, "erodeAmount", 0.1, 2.0, 0.1).name("Flux Erode Amount")
        this.gui.add(this, "fluxErode").name("Erode with Water Flux")
        this.gui.add(this, "numCities", 10, 200, 1).name("Number of Cities")
        this.gui.add(this, "showCities").name("Show Cities")
    
        window.addEventListener('resize', onWindowResize, false)
        const rend = this
        function onWindowResize() {
            rend.camera.aspect = window.innerWidth / window.innerHeight
            rend.camera.updateProjectionMatrix()
            rend.renderer.setSize(window.innerWidth, window.innerHeight)
            rend.render()
        }
    
        this.animate()
    }

    showCities() {
        this.cityMap = cityMap(this.heightMap, this.size, this.size, this.waterLevel, this.numCities)
        this.cityRGB = cityToRGB(this.cityMap, this.size, this.size, this.numCities)
        this.material.map = this.cityRGB
        this.material.needsUpdate = true
    }

    rebuildTerrain() {
        this.heightMap = buildTerrain(this.size, this.size, this.randomness, this.erosionIterations)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
    }

    addRivers() {
        addRivers(this.heightMap, this.size, this.size, this.numRivers, this.waterLevel)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
    }

    fillSinks() {
        this.heightMap = fillSinks(this.heightMap, this.size, this.size, this.maxIters, this.waterLevel)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
    }

    thermalErode() {
        thermalErode(this.heightMap, this.size, this.size, this.erosionIterations)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
    }

    fluxErode() {
        this.heightMap = fluxErode(this.heightMap, this.size, this.size, this.erodeAmount)
        this.disMap = terrainToDisMap(this.heightMap, this.size, this.size)
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.displacementMap = this.disMap
        this.material.needsUpdate = true
    }

    updateRGB() {
        this.rgbMap = terrainToRGB(this.heightMap, this.size, this.size, this.waterLevel)
        this.material.map = this.rgbMap
        this.material.needsUpdate = true
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update()
        this.render()
    }

    render() {
        this.renderer.render(this.scene, this.camera)
    }
}