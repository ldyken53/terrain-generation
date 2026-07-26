import { Queue } from 'queue-typescript'
import { randomInt, clamp, extent, normalize, timed } from './util'
import { Grid } from './grid'
import * as THREE from 'three'
import * as d3 from 'd3'

/** A rectangle waiting to be subdivided: [left, bottom, right, top, noise amplitude]. */
type Rect = [number, number, number, number, number]
/** A BFS frontier cell: [x, y, city id]. */
type Frontier = [number, number, number]

/** Working range of the diamond-square pass, before the map is normalized to 0..1. */
const MAX_ELEVATION = 100
/** Noise amplitude is divided by this at every subdivision level. */
const RANDOM_DECAY = 2

/**
 * Diamond-square heightmap, thermally eroded and normalized to 0..1.
 *
 * `randomness` is the initial noise amplitude (in MAX_ELEVATION units) and halves with every
 * subdivision, so larger values give rougher terrain.
 */
export function buildTerrain(
    grid: Grid,
    randomness: number,
    erosionIterations: number
): Float32Array {
    const data = new Float32Array(grid.length) // the four corners start at 0

    // Fades the map towards 0 near the edges, so the result reads as an island.
    function borderProximity(x: number, y: number): number {
        const { width, height } = grid
        const closest = Math.min(
            x / width,
            y / height,
            (width - 1 - x) / width,
            (height - 1 - y) / height
        )
        return Math.pow(closest, 0.05)
    }

    const at = (x: number, y: number) => data[grid.index(x, y)]

    /** Sets (x, y) to the average of `sources`, jittered by +-rand and faded towards the border. */
    function displace(x: number, y: number, rand: number, ...sources: number[]) {
        const average = Math.floor(sources.reduce((sum, h) => sum + h, 0) / sources.length)
        const jittered = (average + randomInt(-rand, rand)) * borderProximity(x, y)
        data[grid.index(x, y)] = Math.floor(clamp(jittered, 0, MAX_ELEVATION))
    }

    timed('Heightmap generated', () => {
        const queue = new Queue<Rect>([0, 0, grid.width - 1, grid.height - 1, randomness])
        while (queue.length > 0) {
            const [left, bottom, right, top, rand] = queue.dequeue()
            const cx = Math.floor((left + right) / 2)
            const cy = Math.floor((top + bottom) / 2)

            // Diamond step: the centre is the average of the four corners.
            const corners = [at(left, top), at(left, bottom), at(right, top), at(right, bottom)]
            displace(cx, cy, rand, ...corners)

            // Square step: each edge midpoint averages its two corners and the new centre.
            if (top !== bottom) {
                displace(cx, top, rand, at(left, top), at(right, top), at(cx, cy))
                displace(cx, bottom, rand, at(left, bottom), at(right, bottom), at(cx, cy))
            }
            if (left !== right) {
                displace(left, cy, rand, at(left, top), at(left, bottom), at(cx, cy))
                displace(right, cy, rand, at(right, top), at(right, bottom), at(cx, cy))
            }

            if (right - left > 1 || top - bottom > 1) {
                const rest = Math.floor(rand / RANDOM_DECAY)
                queue.enqueue([left, bottom, cx, cy, rest])
                queue.enqueue([left, cy, cx, top, rest])
                queue.enqueue([cx, bottom, right, cy, rest])
                queue.enqueue([cx, cy, right, top, rest])
            }
        }
    })

    thermalErode(data, grid, erosionIterations)
    normalize(data)
    return data
}

/**
 * Talus slippage: every interior cell gives half of its steepest downhill drop to that neighbour,
 * which rounds off slopes that are too steep to hold material.
 */
export function thermalErode(data: Float32Array, grid: Grid, iterations: number) {
    // Interior cells only, so plain index offsets are always in bounds.
    const offsets = [-1, 1, -grid.width, grid.width]
    timed(`Heightmap eroded (${iterations} iterations)`, () => {
        for (let iteration = 0; iteration < iterations; iteration++) {
            for (let x = 1; x < grid.width - 1; x++) {
                for (let y = 1; y < grid.height - 1; y++) {
                    const here = grid.index(x, y)
                    let steepest = -1
                    let drop = 0
                    for (const offset of offsets) {
                        const d = data[here] - data[here + offset]
                        if (d > drop) {
                            drop = d
                            steepest = here + offset
                        }
                    }
                    if (steepest >= 0) {
                        data[here] -= drop / 2
                        data[steepest] += drop / 2
                    }
                }
            }
        }
    })
}

/**
 * For every cell, the index of its lowest neighbour, or -1 on the border (where water leaves the
 * map). When `strictlyDownhill`, cells that are already a local minimum also get -1.
 */
function downhillMap(data: Float32Array, grid: Grid, strictlyDownhill: boolean): Int32Array {
    const downs = new Int32Array(grid.length)
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            const here = grid.index(x, y)
            if (grid.isBorder(x, y)) {
                downs[here] = -1
                continue
            }
            let best = -1
            let lowest = strictlyDownhill ? data[here] : Infinity
            for (const neighbor of grid.neighbors(x, y)) {
                if (data[neighbor] < lowest) {
                    lowest = data[neighbor]
                    best = neighbor
                }
            }
            downs[here] = best
        }
    }
    return downs
}

/** Cells above water with nowhere lower to drain to. */
function countSinks(data: Float32Array, grid: Grid, waterLevel: number): number {
    let sinks = 0
    for (let y = 1; y < grid.height - 1; y++) {
        for (let x = 1; x < grid.width - 1; x++) {
            const here = grid.index(x, y)
            if (data[here] <= waterLevel) continue
            if (!grid.neighbors(x, y).some((n) => data[n] < data[here])) sinks++
        }
    }
    return sinks
}

/** Picks random points above water and carves a channel down to sea level from each. */
export function addRivers(data: Float32Array, grid: Grid, numRivers: number, waterLevel: number) {
    const downs = downhillMap(data, grid, false)

    const sources: number[] = []
    for (let tries = 0; sources.length < numRivers && tries < 10 * grid.length; tries++) {
        const source = grid.index(randomInt(1, grid.width - 1), randomInt(1, grid.height - 1))
        if (data[source] > waterLevel + 0.01) sources.push(source)
    }

    for (let position of sources) {
        while (downs[position] >= 0 && data[position] > waterLevel) {
            data[position] = 0
            position = downs[position]
        }
    }
}

/**
 * Planchon-Darboux depression filling: raises the land inside basins until every cell above water
 * has a downhill route off the map, so rivers and flux never dead-end.
 */
export function fillSinks(data: Float32Array, grid: Grid, maxIters: number, waterLevel: number) {
    const EPSILON = 1e-3
    /** Stand-in for "infinitely high", kept finite so it can never poison the height texture. */
    const UNRESOLVED = Number.MAX_SAFE_INTEGER

    timed('Sinks filled', () => {
        console.log(`Sinks before filling: ${countSinks(data, grid, waterLevel)}`)

        // Border cells drain off the map at height 0; everything else starts infinitely high and
        // is relaxed down towards the cheapest route out.
        const surface = new Float32Array(grid.length)
        for (let y = 1; y < grid.height - 1; y++) {
            for (let x = 1; x < grid.width - 1; x++) {
                surface[grid.index(x, y)] = UNRESOLVED
            }
        }

        let pass = 0
        for (; pass <= maxIters; pass++) {
            let changed = false
            for (let y = 0; y < grid.height; y++) {
                for (let x = 0; x < grid.width; x++) {
                    const here = grid.index(x, y)
                    if (surface[here] === data[here] || surface[here] < waterLevel) continue

                    for (const neighbor of grid.neighbors(x, y)) {
                        if (data[here] >= surface[neighbor] + EPSILON) {
                            // There is already a way out at our own height: nothing to fill.
                            surface[here] = data[here]
                            changed = true
                            break
                        }
                        // Otherwise settle just above the neighbour, keeping a slight downhill
                        // gradient across the filled basin.
                        const raised = surface[neighbor] + 1 / randomInt(1000, 10000)
                        if (surface[here] > raised && raised > data[here]) {
                            surface[here] = raised
                            changed = true
                        }
                    }
                }
            }
            if (!changed) break
        }
        console.log(`Sinks converged after ${pass} of at most ${maxIters + 1} passes`)

        for (let i = 0; i < data.length; i++) {
            if (data[i] > waterLevel) data[i] = surface[i]
        }
        console.log(`Sinks after filling: ${countSinks(data, grid, waterLevel)}`)
    })
}

/**
 * Hydraulic erosion. Every cell sheds one unit of water, which is routed downhill and accumulated,
 * then each cell is lowered in proportion to the drainage passing through it, carving valleys.
 */
export function fluxErode(data: Float32Array, grid: Grid, amount: number) {
    timed('Heightmap flux eroded', () => {
        const downs = downhillMap(data, grid, true)

        const flux = new Float32Array(grid.length).fill(1)
        const byDescendingHeight = new Int32Array(grid.length)
        for (let i = 0; i < byDescendingHeight.length; i++) byDescendingHeight[i] = i
        byDescendingHeight.sort((a, b) => data[b] - data[a])
        for (const i of byDescendingHeight) {
            if (downs[i] >= 0) flux[downs[i]] += flux[i]
        }

        const maxFlux = extent(flux)[1] || 1
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.max(data[i] - amount * (flux[i] / maxFlux), 0)
        }

        // Rescale back to 0..1 without lifting the sea floor.
        const max = extent(data)[1] || 1
        for (let i = 0; i < data.length; i++) data[i] /= max
    })
}

/**
 * Places `numCities` cities greedily, each one as far as possible from those already placed, then
 * labels every land cell with the id (1-based; 0 means water) of the city that reaches it first.
 */
export function cityMap(
    data: Float32Array,
    grid: Grid,
    waterLevel: number,
    numCities: number
): Uint8Array {
    const land: [number, number][] = []
    for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
            if (data[grid.index(x, y)] >= waterLevel) land.push([x, y])
        }
    }

    // Farthest-point sampling, maintaining each candidate's distance to the closest city so far.
    const nearest = new Float64Array(land.length).fill(Infinity)
    const cities: [number, number][] = []
    while (cities.length < numCities && cities.length < land.length) {
        let bestScore = 0
        let best = 0
        for (let i = 0; i < land.length; i++) {
            if (nearest[i] > bestScore) {
                bestScore = nearest[i]
                best = i
            }
        }
        const [cityX, cityY] = land[best]
        cities.push([cityX, cityY])
        for (let i = 0; i < land.length; i++) {
            nearest[i] = Math.min(nearest[i], grid.distance(land[i][0], land[i][1], cityX, cityY))
        }
    }

    // Flood fill outwards from every city at once to get their territories.
    const territories = new Uint8Array(grid.length)
    const queue = new Queue<Frontier>()
    cities.forEach(([x, y], i) => {
        territories[grid.index(x, y)] = i + 1
        queue.enqueue([x, y, i + 1])
    })
    while (queue.length > 0) {
        const [x, y, city] = queue.dequeue()
        for (const [nx, ny] of grid.orthogonalInteriorNeighbors(x, y)) {
            const neighbor = grid.index(nx, ny)
            if (data[neighbor] > waterLevel && territories[neighbor] === 0) {
                territories[neighbor] = city
                queue.enqueue([nx, ny, city])
            }
        }
    }
    return territories
}

/** Builds an RGBA byte texture by evaluating `colorAt` (any CSS colour) for every cell. */
function colorTexture(
    grid: Grid,
    count: number,
    colorAt: (i: number) => string
): THREE.DataTexture {
    const pixels = new Uint8Array(4 * count)
    for (let i = 0; i < count; i++) {
        const { r, g, b } = d3.rgb(colorAt(i))
        pixels[i * 4] = r
        pixels[i * 4 + 1] = g
        pixels[i * 4 + 2] = b
        pixels[i * 4 + 3] = 255
    }
    const texture = new THREE.DataTexture(pixels, grid.width, grid.height)
    texture.needsUpdate = true
    return texture
}

/** Terrain shaded by elevation, with everything below the water level flattened to sea colour. */
export function terrainToRGB(
    data: Float32Array,
    grid: Grid,
    waterLevel: number
): THREE.DataTexture {
    return colorTexture(grid, data.length, (i) =>
        d3.interpolateMagma(data[i] < waterLevel ? 0 : data[i])
    )
}

/** One colour per city territory. */
export function cityToRGB(
    territories: Uint8Array,
    grid: Grid,
    numCities: number
): THREE.DataTexture {
    return colorTexture(grid, territories.length, (i) =>
        d3.interpolateRainbow(territories[i] / numCities)
    )
}

/** The heightmap as a float texture, for use as the mesh's displacement map. */
export function terrainToDisMap(data: Float32Array, grid: Grid): THREE.DataTexture {
    const pixels = new Float32Array(4 * data.length)
    for (let i = 0; i < data.length; i++) {
        pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = data[i]
        pixels[i * 4 + 3] = 1.0
    }
    const { width, height } = grid
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType)
    texture.needsUpdate = true
    return texture
}
