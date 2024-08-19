import { Queue } from 'queue-typescript'
import { randomInt, clamp } from './util'
import createColormap from 'colormap'
import * as THREE from 'three'
import * as d3 from 'd3'

type Diamond = [number, number, number, number, number]
type Triple = [number, number, number]

export function buildTerrain(width: number, height: number, randomness: number, erosionIterations: number): Float32Array {
    let start = performance.now()

    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    function borderProximity(x: number, y: number): number {
        let closest = Math.min(x / width, y / height, (width - 1 - x) / width, (height - 1 - y) / height)
        return Math.pow(closest, 0.05)
    }

    // init data and set corners to 0
    const data = new Float32Array(width * height)
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

        data[getPosition(centerX, centerY)] = Math.floor(clamp((Math.floor(
            (data[getPosition(left, top)] + data[getPosition(left, bottom)] + 
            data[getPosition(right, top)] + data[getPosition(right, bottom)]) / 4
        ) + randomInt(-rand, rand)) * borderProximity(centerX, centerY), 0, 100))

        if (top !== bottom) {
            data[getPosition(centerX, top)] = Math.floor(clamp((Math.floor(
                (data[getPosition(left, top)] + data[getPosition(right, top)] + 
                data[getPosition(centerX, centerY)]) / 3
            ) + randomInt(-rand, rand)) * borderProximity(centerX, top), 0, 100))
            data[getPosition(centerX, bottom)] = Math.floor(clamp((Math.floor(
                (data[getPosition(left, bottom)] + data[getPosition(right, bottom)] + data[getPosition(centerX, centerY)]) / 3
            ) + randomInt(-rand, rand)) * borderProximity(centerX, bottom), 0, 100))
        }

        if (left !== right) {
            data[getPosition(left, centerY)] = Math.floor(clamp((Math.floor(
                (data[getPosition(left, top)] + data[getPosition(left, bottom)] + data[getPosition(centerX, centerY)]) / 3
            ) + randomInt(-rand, rand)) * borderProximity(left, centerY), 0, 100))
            data[getPosition(right, centerY)] = Math.floor(clamp((Math.floor(
                (data[getPosition(right, top)] + data[getPosition(right, bottom)] + data[getPosition(centerX, centerY)]) / 3
            ) + randomInt(-rand, rand)) * borderProximity(right, centerY), 0, 100))
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

    thermalErode(data, width, height, erosionIterations)

    start = performance.now()
    let max = 0
    let min = 100
    for (let i = 0; i < data.length; i++) {
        if (data[i] > max) {
            max = data[i]
        }
        if (data[i] < min) {
            min = data[i]
        }
    }
    for (let i = 0; i < data.length; i++) {
        data[i] =  (data[i] - min) / (max - min)
    }
    end = performance.now()
    console.log(`Heightmap normalized in ${end - start}ms`)

    return data
}  

export function thermalErode(data: Float32Array, width: number, height: number, erosionIterations: number) {
    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    let start = performance.now()
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
                    data[getPosition(i, j)] -= dMax / 2
                    data[getPosition(indices[0], indices[1])] += dMax / 2
                }
            }
        }
        iter++
    }
    let end = performance.now()
    console.log(`Heightmap eroded in ${end - start}ms for ${erosionIterations} iterations`)
}

export function addRivers(data: Float32Array, width: number, height: number, numRivers: number, waterLevel: number) {
    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    function getNeighbors(x: number, y: number) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                neighbors.push(getPosition(x + dx, y + dy));
            }
        }
        return neighbors;
    }
    function downFrom(x: number, y: number) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) { return -1}
        let best = -1
        let besth = 100
        let nbs = getNeighbors(x, y)
        for (const j of nbs) {
            if (data[j] < besth) {
                besth = data[j]
                best = j
            }
        }
        return best
    }
    var downs = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            downs[getPosition(x, y)] = downFrom(x, y)
        }
    }
    let peaks = []
    while (peaks.length < numRivers) {
        let x = randomInt(1, width - 1)
        let y = randomInt(1, height - 1)
        if (data[getPosition(x, y)] > waterLevel + 0.01) {
            peaks.push([x, y])
        }
    }
    for (const [x, y] of peaks) {
        let position = getPosition(x, y)
        while (true) {
            if (downs[position] >= 0 && data[position] > waterLevel) {
                data[position] = 0
                position = downs[position]
            } else {
                break
            }
        }
    }
}

export function fillSinks(data: Float32Array, width: number, height: number, maxIters: number, waterLevel: number): Float32Array {
    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    function getNeighbors(x: number, y: number) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                neighbors.push(getPosition(x + dx, y + dy));
            }
        }
        return neighbors;
    }
    let start = performance.now()
    const epsilon = 1e-3
    const infinity = Number.MAX_SAFE_INTEGER
    const surface = new Float32Array(width * height)
    const dx = [-1, 0, 1, -1, 1, -1, 0, 1]
    const dy = [-1, -1, -1, 0, 0, 1, 1, 1]
    let sinks = 0
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const pos = getPosition(x, y)
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                surface[pos] = data[pos];
            } else {
                surface[pos] = infinity;
            }
            if (data[pos] <= waterLevel) continue
            let sink = true
            for (let i = 0; i < 8; i++) {
                const nx = x + dx[i]
                const ny = y + dy[i]
                const npos = getPosition(nx, ny)

                if (data[npos] < data[pos]) {
                    sink = false
                }
            } 
            if (sink) { sinks++ }
        }
    }
    console.log("num sinks", sinks)

    let changed = true
    let iters = 0
    while (changed) {
        changed = false
        let changenum = 0
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = getPosition(x, y)
                if (surface[i] == data[i] || surface[i] < waterLevel) continue

                const neighbors = getNeighbors(x, y);
                for (const j of neighbors) {
                    if (data[i] >= surface[j] + epsilon) {
                        surface[i] = data[i]
                        changed = true
                        changenum++
                        break
                    }
                    const oh = surface[j] + 1 / randomInt(1000, 10000)
                    if (surface[i] > oh && oh > data[i]) {
                        surface[i] = oh
                        changed = true
                        changenum++
                    }
                }
            }
        }
        if (!changed) break
        iters++
        if (iters > maxIters) break
    }
    console.log(iters)

    for (let i = 0; i < data.length; i++) {
        if (data[i] > waterLevel) {
            data[i] = surface[i]
        }
    }
    sinks = 0
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const pos = getPosition(x, y)
            if (data[pos] <= waterLevel) continue
            let sink = true
            for (let i = 0; i < 8; i++) {
                const nx = x + dx[i]
                const ny = y + dy[i]
                const npos = getPosition(nx, ny)

                if (data[npos] < data[pos]) {
                    sink = false
                }
            } 
            if (sink) { sinks++ }
        }
    }
    console.log("num sinks", sinks)

    let end = performance.now()
    console.log(`Sinks filled in ${end - start}ms`)
    return data
}

export function fluxErode(data: Float32Array, width: number, height: number, amount: number): Float32Array {
    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    function getNeighbors(x: number, y: number) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                neighbors.push(getPosition(x + dx, y + dy));
            }
        }
        return neighbors;
    }
    function downFrom(x: number, y: number) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) { return -1}
        let best = -1
        let besth = data[getPosition(x, y)]
        let nbs = getNeighbors(x, y)
        for (const j of nbs) {
            if (data[j] < besth) {
                besth = data[j]
                best = j
            }
        }
        return best
    }
    var downs = new Float32Array(width * height)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            downs[getPosition(x, y)] = downFrom(x, y)
        }
    }
    const flux = new Float32Array(width * height)
    var idxs = []
    for (var i = 0; i < data.length; i++) {
        idxs[i] = i
        flux[i] = 1
    }
    idxs.sort(function (a, b) {
        return data[b] - data[a]
    });
    for (var i = 0; i < data.length; i++) {
        var j = idxs[i]
        if (downs[j] >= 0) {
            flux[downs[j]] += flux[j]
        }
    }
    let maxFlux = 0
    for (let i = 0; i < flux.length; i++) {
        if (flux[i] > maxFlux) {maxFlux = flux[i]}
    }
    for (let i = 0; i < flux.length; i++) {
        data[i] = Math.max(data[i] - amount * (flux[i] / maxFlux), 0)
    }
    let max = 0
    for (let i = 0; i < data.length; i++) {
        if (data[i] > max) {
            max = data[i]
        }
    }
    for (let i = 0; i < data.length; i++) {
        data[i] =  data[i] / max
    }
    return data
}

export function cityMap(data: Float32Array, width: number, height: number, waterLevel: number, numCities: number): Uint8Array {
    const cityMap = new Uint8Array(width * height)
    function getPosition(x: number, y: number): number {
        x = clamp(x, 0, width - 1)
        y = clamp(y, 0, height - 1)
        return y * width + x
    }
    function getDistance(x1: number, y1: number, x2: number, y2: number) {
        x1 = x1 / (width - 1)
        x2 = x2 / (width - 1)
        y1 = y1 / (height - 1)
        y2 = y2 / (height - 1)
        return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
    }
    function getNeighbors(x: number, y: number) {
        const neighbors: [number, number][] = []
        const dxs = [-1, 0, 1, 0]
        const dys = [0, -1, 0, 1]
        for (let i = 0; i < 4; i++) {
            let dx = dxs[i]
            let dy = dys[i]
            if (0 < x + dx && x + dx < width - 1 && 0 < y + dy && y + dy < height - 1)  {
                neighbors.push([x + dx, y + dy])
            }
        }
        return neighbors;
    }
    let possibleCities: [number, number][] = []
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let pos = getPosition(x, y)
            if (data[pos] < waterLevel) continue
            possibleCities.push([x, y])
            // let nbs = getNeighbors(x, y)
            // for (const [x2, y2] of nbs) {
            //     let pos = getPosition(x2, y2)
            //     if (data[pos] <= waterLevel) {
            //         possibleCities.push([x, y])
            //         break
            //     }
            // }
        }
    }
    let cities: [number, number][] = []
    while (cities.length < numCities) {
        let maxScore = 0
        let maxPos: [number, number] = [0, 0]
        for (const [x, y] of possibleCities) {
            let pos = getPosition(x, y)
            let minDist = width * width + height * height
            for (const [x2, y2] of cities) {
                let dist = getDistance(x, y, x2, y2)
                if (dist < minDist) minDist = dist
            }
            let score = minDist
            // let nbs = getNeighbors(x, y)
            // for (const [x2, y2] of nbs) {
            //     let pos = getPosition(x2, y2)
            //     if (data[pos] < waterLevel) {
            //         score += 1
            //         break
            //     } 
            // }
            if (score > maxScore) {
                maxScore = score
                maxPos = [x, y]
            }
        }
        cities.push(maxPos)
    }
    console.log(cities)
    let i = 1
    let q = new Queue<Triple>()
    for (const [x, y] of cities) {
        cityMap[getPosition(x, y)] = i
        q.enqueue([x, y, i])
        i++        
    }
    while (q.length > 0) {
        let [x, y, i] = q.dequeue()
        let nbs = getNeighbors(x, y)
        for (const [x2, y2] of nbs) {
            let pos = getPosition(x2, y2)
            if (data[pos] > waterLevel && cityMap[pos] == 0) {
                cityMap[pos] = i
                q.enqueue([x2, y2, i])
            }
        }
    }
    return cityMap
}

export function terrainToRGB(data: Float32Array, width: number, height: number, waterLevel: number): THREE.DataTexture {
    const rgbData = new Uint8Array(4 * data.length)
    for (let i = 0; i < data.length; i++) {
        let color;
        if (data[i] < waterLevel) {
            color = d3.color(d3.interpolateMagma(0))!.rgb()
        } else {
            color = d3.color(d3.interpolateMagma(data[i]))!.rgb()
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

export function cityToRGB(data: Uint8Array, width: number, height: number, numCities: number): THREE.DataTexture {
    const rgbData = new Uint8Array(4 * data.length)
    for (let i = 0; i < data.length; i++) {
        let color = d3.color(d3.interpolateRainbow(data[i] / numCities))!.rgb()
        rgbData[i * 4] = color.r
        rgbData[i * 4 + 1] = color.g
        rgbData[i * 4 + 2] = color.b
        rgbData[i * 4 + 3] = 255
    }
    const rgbMap = new THREE.DataTexture(rgbData, width, height)
    rgbMap.needsUpdate = true
    return rgbMap 
}

export function terrainToDisMap(data: Float32Array, width: number, height: number): THREE.DataTexture {
    const disData = new Float32Array(4 * data.length)
    for (let i = 0; i < data.length; i++) {
        disData[i * 4] = data[i]
        disData[i * 4 + 1] = data[i]
        disData[i * 4 + 2] = data[i]
        disData[i * 4 + 3] = 1.0
    }
    const disMap = new THREE.DataTexture(disData, width, height, THREE.RGBAFormat, THREE.FloatType)
    disMap.needsUpdate = true
    return disMap
}