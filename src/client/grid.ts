/**
 * A width x height lattice. Fields over it (heights, flux, city ids, ...) are stored as flat
 * row-major arrays of length `grid.length`, indexed by `grid.index(x, y)`.
 */
export class Grid {
    constructor(readonly width: number, readonly height: number) {}

    get length(): number {
        return this.width * this.height
    }

    /** Flat index of (x, y). Coordinates outside the grid are clamped to the edge. */
    index(x: number, y: number): number {
        const cx = x < 0 ? 0 : x > this.width - 1 ? this.width - 1 : x
        const cy = y < 0 ? 0 : y > this.height - 1 ? this.height - 1 : y
        return cy * this.width + cx
    }

    isBorder(x: number, y: number): boolean {
        return x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1
    }

    /** Indices of the eight surrounding cells, clamped, so edge cells see themselves. */
    neighbors(x: number, y: number): number[] {
        const neighbors: number[] = []
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx !== 0 || dy !== 0) neighbors.push(this.index(x + dx, y + dy))
            }
        }
        return neighbors
    }

    /** The four edge-sharing neighbours of (x, y), excluding anything on or past the border. */
    orthogonalInteriorNeighbors(x: number, y: number): [number, number][] {
        const neighbors: [number, number][] = []
        for (const [dx, dy] of [
            [-1, 0],
            [0, -1],
            [1, 0],
            [0, 1],
        ]) {
            const nx = x + dx
            const ny = y + dy
            if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1) {
                neighbors.push([nx, ny])
            }
        }
        return neighbors
    }

    /** Euclidean distance between two cells after rescaling the grid to the unit square. */
    distance(x1: number, y1: number, x2: number, y2: number): number {
        // Each coordinate is scaled before subtracting: doing it the other way round shifts the
        // result by an ulp, which is enough to flip ties in the city placement search.
        const dx = x1 / (this.width - 1) - x2 / (this.width - 1)
        const dy = y1 / (this.height - 1) - y2 / (this.height - 1)
        return Math.sqrt(dx * dx + dy * dy)
    }
}
