import { describe, it, expect } from 'vitest'
import { calcHMAData } from '../calculators'
import {
    empty,
    singleBar,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'
import { HMA_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertFiniteOrUndefined,
} from './_propertyAssertions'

describe('calcHMAData — Hull Moving Average', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcHMAData(empty, 9)).toEqual([])
        })

        it('single bar with period 9 returns [undefined]', () => {
            expect(calcHMAData(singleBar, 9)).toEqual([undefined])
        })

        it('period = 0 returns all undefined', () => {
            const zero = calcHMAData(pureUptrend, 0)
            for (const v of zero) expect(v).toBeUndefined()
        })

        it('period = 1 returns close[t] (WMA of WMA of single value is itself)', () => {
            const out = calcHMAData(pureUptrend, 1)
            for (let i = 0; i < out.length; i++) {
                expect(out[i]).toBeCloseTo(pureUptrend[i]!.close, 9)
            }
        })
    })

    describe('golden values', () => {
        it('constantPrice → HMA(9) = 100 after warm-up', () => {
            assertSeriesClose(calcHMAData(constantPrice, 9), HMA_GOLDEN.constantPrice!.series)
        })
    })

    describe('mathematical properties', () => {
        it('all values finite (or undefined in warm-up)', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
                assertFiniteOrUndefined(calcHMAData(fx, 9), 'HMA series')
            }
        })

        it('HMA(9) on pureUptrend tracks linear motion with very low lag', () => {
            const out = calcHMAData(pureUptrend, 9)
            const tail = out.slice(11).filter((v): v is number => v !== undefined)
            for (let i = 1; i < tail.length; i++) {
                expect(tail[i]!).toBeGreaterThan(tail[i - 1]!)
            }
        })

        it('extensional consistency', () => {
            const full = calcHMAData(pureUptrend, 9)
            for (let n = 12; n < pureUptrend.length; n++) {
                const partial = calcHMAData(pureUptrend.slice(0, n), 9)
                for (let i = 0; i < n; i++) {
                    if (full[i] !== undefined && partial[i] !== undefined) {
                        expect(partial[i]).toBeCloseTo(full[i]!, 9)
                    }
                }
            }
        })
    })
})
