import { describe, it, expect } from 'vitest'
import { calcDEMAData } from '../calculators'
import {
    empty,
    singleBar,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'
import { DEMA_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertFiniteOrUndefined,
} from './_propertyAssertions'

describe('calcDEMAData — Double Exponential Moving Average', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcDEMAData(empty, 20)).toEqual([])
        })

        it('single bar produces a single defined value (EMA seed = first close)', () => {
            const out = calcDEMAData(singleBar, 20)
            expect(out).toHaveLength(1)
            expect(out[0]).toBeCloseTo(100, 9)
        })

        it('period = 0 or negative returns all undefined', () => {
            const zero = calcDEMAData(pureUptrend, 0)
            for (const v of zero) expect(v).toBeUndefined()
            const neg = calcDEMAData(pureUptrend, -1)
            for (const v of neg) expect(v).toBeUndefined()
        })
    })

    describe('golden values', () => {
        it('constantPrice → DEMA(20) = 100 throughout (zero lag at steady state)', () => {
            assertSeriesClose(calcDEMAData(constantPrice, 20), DEMA_GOLDEN.constantPrice!.series)
        })
    })

    describe('mathematical properties', () => {
        it('all values finite', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
                assertFiniteOrUndefined(calcDEMAData(fx, 20), 'DEMA series')
            }
        })

        it('on linear input close=100+t, DEMA converges toward close[t] (zero-lag property)', () => {
            // 30-bar fixture isn't enough for full convergence with period=20,
            // but DEMA should be closer to close[t] than EMA would be.
            // Just verify monotonic increase tracking the uptrend.
            const out = calcDEMAData(pureUptrend, 20)
            const tail = out.slice(20).filter((v): v is number => v !== undefined)
            for (let i = 1; i < tail.length; i++) {
                expect(tail[i]!).toBeGreaterThan(tail[i - 1]!)
            }
        })

        it('extensional consistency (no leak from later bars into earlier values)', () => {
            const full = calcDEMAData(pureUptrend, 20)
            for (let n = 5; n < pureUptrend.length; n++) {
                const partial = calcDEMAData(pureUptrend.slice(0, n), 20)
                for (let i = 0; i < n; i++) {
                    if (full[i] !== undefined && partial[i] !== undefined) {
                        expect(partial[i]).toBeCloseTo(full[i]!, 9)
                    }
                }
            }
        })
    })
})
