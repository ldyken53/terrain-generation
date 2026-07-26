/** Random integer in [min, max], inclusive on both ends. */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export function clamp(val: number, min: number, max: number): number {
    return Math.min(Math.max(val, min), max)
}

/** Smallest and largest value in a field. */
export function extent(data: Float32Array): [number, number] {
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i]
        if (data[i] > max) max = data[i]
    }
    return [min, max]
}

/** Rescales a field in place so that its values span 0..1. */
export function normalize(data: Float32Array) {
    const [min, max] = extent(data)
    const range = max - min || 1
    for (let i = 0; i < data.length; i++) {
        data[i] = (data[i] - min) / range
    }
}

/** Logs how long `work` took, so the expensive passes stay visible in the console. */
export function timed<T>(label: string, work: () => T): T {
    const start = performance.now()
    const result = work()
    console.log(`${label} in ${(performance.now() - start).toFixed(1)}ms`)
    return result
}
