export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}
export function clamp(val: number, min: number, max: number) { return Math.min(Math.max(val, min), max) }
