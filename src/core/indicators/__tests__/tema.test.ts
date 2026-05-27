import { describe, it, expect } from 'vitest'
import { calcTEMAData } from '../calculators'
import {
    empty,
    singleBar,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'
import { TEMA_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertFiniteOrUndefined,
} from './_propertyAssertions'

describe('calcTEMAData — Triple Exponential Moving Average', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcTEMAData(empty, 20)).toEqual([])
        })

        it('single bar produces a single defined value', () => {
            const out = calcTEMAData(singleBar, 20)
            expect(out).toHaveLength(1)
            expect(out[0]).toBeCloseTo(100, 9)
        })

        it('period = 0 returns all undefined', () => {
            const zero = calcTEMAData(pureUptrend, 0)
            for (const v of zero) expect(v).toBeUndefined()
        })
    })

    describe('golden values', () => {
        it('constantPrice → TEMA(20) = 100 throughout', () => {
            assertSeriesClose(calcTEMAData(constantPrice, 20), TEMA_GOLDEN.constantPrice!.series)
        })
    })

    describe('mathematical properties', () => {
        it('all values finite', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
                assertFiniteOrUndefined(calcTEMAData(fx, 20), 'TEMA series')
            }
        })

        it('tracks uptrend monotonically once warmed', () => {
            const out = calcTEMAData(pureUptrend, 20)
            const tail = out.slice(20).filter((v): v is number => v !== undefined)
            for (let i = 1; i < tail.length; i++) {
                expect(tail[i]!).toBeGreaterThan(tail[i - 1]!)
            }
        })

        it('extensional consistency', () => {
            const full = calcTEMAData(pureUptrend, 20)
            for (let n = 5; n < pureUptrend.length; n++) {
                const partial = calcTEMAData(pureUptrend.slice(0, n), 20)
                for (let i = 0; i < n; i++) {
                    if (full[i] !== undefined && partial[i] !== undefined) {
                        expect(partial[i]).toBeCloseTo(full[i]!, 9)
                    }
                }
            }
        })
    })
})
