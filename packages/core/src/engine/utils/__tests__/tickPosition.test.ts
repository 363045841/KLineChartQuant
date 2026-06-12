import { describe, expect, it } from 'vitest'
import { calculateValueTickPositions } from '../tickPosition'

describe('calculateValueTickPositions', () => {
    it('anchors percent ticks at 0 and keeps equal percentage steps', () => {
        const ticks = calculateValueTickPositions({
            height: 240,
            paddingTop: 0,
            paddingBottom: 0,
            valueMin: -1.3,
            valueMax: 2.4,
            scaleType: 'percent',
            isMain: true,
        })

        const values = ticks.map((tick) => tick.value)

        const zeroIndex = values.indexOf(0)
        expect(zeroIndex).toBeGreaterThan(0)
        expect(zeroIndex).toBeLessThan(values.length - 1)

        const step = values[zeroIndex - 1]! - values[zeroIndex]!
        expect(step).toBeGreaterThan(0)

        for (let i = 1; i < values.length; i++) {
            expect(values[i - 1]! - values[i]!).toBeCloseTo(step, 10)
        }

        for (const value of values) {
            expect(value / step).toBeCloseTo(Math.round(value / step), 10)
        }
    })

    it('allows ticks to extend beyond the visible range', () => {
        const ticks = calculateValueTickPositions({
            height: 240,
            paddingTop: 10,
            paddingBottom: 10,
            valueMin: -0.5,
            valueMax: 0.5,
            scaleType: 'percent',
            isMain: true,
        })

        const values = ticks.map((tick) => tick.value)
        const ys = ticks.map((tick) => tick.y)

        expect(values).toContain(0)

        const hasOutside = ys.some((y) => y < 10 || y > 230)
        expect(hasOutside).toBe(true)
    })
})
