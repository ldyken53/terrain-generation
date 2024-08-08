import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { Queue } from 'queue-typescript'
import { GUI } from 'dat.gui'
import * as d3 from 'd3'

(async () => {
    type Diamond = [number, number, number, number, number]

    function randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }
    function buildTerrain(width: number, height: number, randomness: number, erosionIterations: number): Uint8ClampedArray {
        let start = performance.now()

        function getPosition(x: number, y: number): number {
            x = Math.max(Math.min(x, width - 1), 0)
            y = Math.max(Math.min(y, height - 1), 0)
            return y * width + x
        }
        function borderProximity(x: number, y: number): number {
            let closest = Math.min(x / width, y / height, (width - 1 - x) / width, (height - 1 - y) / height)
            return Math.pow(closest, 0.05)
        }

        // init data and set corners to 0
        const data = new Uint8ClampedArray(width * height)
        data[getPosition(0,0)] = 0
        data[getPosition(width - 1, 0)] = 0
        data[getPosition(0, height - 1)] = 0
        data[getPosition(width - 1, height - 1)] = 0

        const randomDecay = 2
        let iterations = 0
        let queue = new Queue<Diamond>([0, 0, width - 1, height - 1, randomness])
        while (queue.length > 0) {
            iterations++
            let [left, bottom, right, top, rand] = queue.dequeue()
            let centerX = Math.floor((left + right) / 2)
            let centerY = Math.floor((top + bottom) / 2)

            data[getPosition(centerX, centerY)] = (Math.floor(
                (data[getPosition(left, top)] + data[getPosition(left, bottom)] + 
                data[getPosition(right, top)] + data[getPosition(right, bottom)]) / 4
            ) + randomInt(-rand, rand)) * borderProximity(centerX, centerY)
            if (iterations == 1) { 
                data[getPosition(centerX, centerY)] = randomInt(100, 150)
            }

            if (top !== bottom) {
                data[getPosition(centerX, top)] = (Math.floor(
                    (data[getPosition(left, top)] + data[getPosition(right, top)] + 
                    data[getPosition(centerX, centerY)]) / 3
                ) + randomInt(-rand, rand)) * borderProximity(centerX, top)
                data[getPosition(centerX, bottom)] = (Math.floor(
                    (data[getPosition(left, bottom)] + data[getPosition(right, bottom)] + data[getPosition(centerX, centerY)]) / 3
                ) + randomInt(-rand, rand)) * borderProximity(centerX, bottom)
            }

            if (left !== right) {
                data[getPosition(left, centerY)] = (Math.floor(
                    (data[getPosition(left, top)] + data[getPosition(left, bottom)] + data[getPosition(centerX, centerY)]) / 3
                ) + randomInt(-rand, rand)) * borderProximity(left, centerY)
                data[getPosition(right, centerY)] = (Math.floor(
                    (data[getPosition(right, top)] + data[getPosition(right, bottom)] + data[getPosition(centerX, centerY)]) / 3
                ) + randomInt(-rand, rand)) * borderProximity(right, centerY)
            }

            if (right - left > 1 || top - bottom > 1) {
                queue.enqueue([left, bottom, centerX, centerY, Math.floor(rand / randomDecay)])
                queue.enqueue([left, centerY, centerX, top, Math.floor(rand / randomDecay)])
                queue.enqueue([centerX, bottom, right, centerY, Math.floor(rand / randomDecay)])
                queue.enqueue([centerX, centerY, right, top, Math.floor(rand / randomDecay)])
            }
        }
        let end = performance.now()
        console.log(`Heightmap generated in ${end - start}ms with ${iterations} iterations`)
        start = performance.now()
        let iter = 0
        while (iter < erosionIterations) {
            for (let i = 1; i < width - 1; i++) {
                for (let j = 1; j < height - 1; j ++) {
                    let neighbors = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]
                    let dMax = 0
                    let indices: [number, number] | null = null
                    
                    for (const [x, y] of neighbors) {
                        let d = data[getPosition(i, j)] - data[getPosition(x, y)]
                        if (d > dMax) {
                            dMax = d
                            indices = [x, y]
                        }
                    }
                    
                    if (indices) {
                        data[getPosition(i, j)] -= Math.floor(dMax / 2)
                        data[getPosition(indices[0], indices[1])] += Math.floor(dMax / 2)
                    }
                }
            }
            iter++
        }
        end = performance.now()
        console.log(`Heightmap eroded in ${end - start}ms for ${erosionIterations} iterations`)
        start = performance.now()
        let max = 0
        for (let i = 0; i < data.length; i++) {
            if (data[i] > max) {
                max = data[i]
            }
        }
        for (let i = 0; i < data.length; i++) {
            data[i] = 255 * data[i] / max
        }
        end = performance.now()
        console.log(`Heightmap normalized in ${end - start}ms`)
        return data
    }   
    function terrainToRGB(data: Uint8ClampedArray, width: number, height: number): THREE.DataTexture {
        const rgbData = new Uint8Array(4 * data.length)
        for (let i = 0; i < data.length; i++) {
            let color;
            if (data[i] < params.waterLevel) {
                color = d3.color(d3.interpolateMagma(0))!.rgb()
            } else {
                color = d3.color(d3.interpolateMagma(data[i] / 255))!.rgb()
            }
            rgbData[i * 4] = color.r
            rgbData[i * 4 + 1] = color.g
            rgbData[i * 4 + 2] = color.b
            rgbData[i * 4 + 3] = 255
        }
        const rgbMap = new THREE.DataTexture(rgbData, width, height)
        rgbMap.needsUpdate = true
        return rgbMap
    }
    function terrainToDisMap(data: Uint8ClampedArray, width: number, height: number): THREE.DataTexture {
        const disData = new Uint8Array(4 * data.length)
        for (let i = 0; i < data.length; i++) {
            disData[i * 4] = data[i]
            disData[i * 4 + 1] = data[i]
            disData[i * 4 + 2] = data[i]
            disData[i * 4 + 3] = 255
        }
        const disMap = new THREE.DataTexture(disData, width, height)
        disMap.needsUpdate = true
        return disMap
    }

    const scene = new THREE.Scene()

    const ambientLight = new THREE.AmbientLight( 0xffffff, 1 )
    scene.add( ambientLight )

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 5000)
    camera.position.set(0, 0, 600)

    const renderer = new THREE.WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    let params = {
        waterLevel: 20,
        rebuild: () => {
            heightMap = buildTerrain(params.width, params.height, params.randomness, params.erosionIterations)
            const disMap = terrainToDisMap(heightMap, params.width, params.height)
            const rgbMap = terrainToRGB(heightMap, params.width, params.height)
            material.map = rgbMap
            material.displacementMap = disMap
            material.needsUpdate = true
            scene.remove(scene.children[1])
            const geometry = new THREE.PlaneGeometry(params.width * 2, params.height * 2, params.width * 2, params.height * 2)
            const plane = new THREE.Mesh(geometry, material)
            scene.add(plane)
        },
        randomness: 1000,
        erosionIterations: 2,
        width: 500,
        height: 500
    }

    let heightMap = buildTerrain(params.width, params.height, params.randomness, params.erosionIterations)
    const disMap = terrainToDisMap(heightMap, params.width, params.height)
    const rgbMap = terrainToRGB(heightMap, params.width, params.height)

    const gui = new GUI({ width: window.innerWidth / 5 })
    const viewFolder = gui.addFolder('Settings')
    gui.add(params, 'waterLevel', 0, 255, 1).onChange(() => {
        material.map = terrainToRGB(heightMap, params.width, params.height)
        material.needsUpdate = true
    }).name('Water Level')
    gui.add(params, "randomness", 100, 2000, 100).name("Randomness")
    gui.add(params, "erosionIterations", 0, 10, 1).name("Erosion Iterations")
    gui.add(params, "width", 100, 2000, 100).name("Width")
    gui.add(params, "height", 100, 2000, 100).name("Height")
    gui.add(params, "rebuild").name("Rebuild Terrain")

    const controls = new OrbitControls(camera, renderer.domElement)

    const geometry = new THREE.PlaneGeometry(params.width * 2, params.height * 2, params.width * 2, params.height * 2)
    const material = new THREE.MeshPhongMaterial({
        // color: new THREE.Color("rgb(100, 100, 100)"),
        // wireframe: true,
        // wireframeLinewidth: 10,
        map: rgbMap,
        displacementMap: disMap,
        displacementScale: 100
    })

    const plane = new THREE.Mesh(geometry, material)
    scene.add(plane)

    window.addEventListener('resize', onWindowResize, false)
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
        render()
    }

    function animate() {
        requestAnimationFrame(animate)
        
        controls.update()
        
        render()
    }

    function render() {
        renderer.render(scene, camera)
    }
    animate()
})();