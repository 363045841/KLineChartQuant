import { describe, it, expect } from 'vitest'
import { calcWMAData } from '../calculators'
import {
    empty,
    singleBar,
    shortSequence,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'
import { WMA_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertFiniteOrUndefined,
    assertWarmupThenDefined,
} from './_propertyAssertions'

describe('calcWMAData — Linear-weighted moving average', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcWMAData(empty, 9)).toEqual([])
        })

        it('single bar with period 9 returns [undefined]', () => {
            expect(calcWMAData(singleBar, 9)).toEqual([undefined])
        })

        it('shorter than period returns all undefined', () => {
            const out = calcWMAData(shortSequence, 9)
            expect(out).toHaveLength(shortSequence.length)
            for (const v of out) expect(v).toBeUndefined()
        })

        it('period = 0 or negative returns all undefined', () => {
            const zero = calcWMAData(pureUptrend, 0)
            for (const v of zero) expect(v).toBeUndefined()
            const neg = calcWMAData(pureUptrend, -3)
            for (const v of neg) expect(v).toBeUndefined()
        })

        it('period = 1 reproduces close[t] exactly', () => {
            const out = calcWMAData(pureUptrend, 1)
            for (let i = 0; i < out.length; i++) {
                expect(out[i]).toBeCloseTo(pureUptrend[i]!.close, 12)
            }
        })
    })

    describe('golden values', () => {
        it('constantPrice → WMA(9) equals 100 after warm-up', () => {
            assertSeriesClose(calcWMAData(constantPrice, 9), WMA_GOLDEN.constantPrice!.series)
        })

        it('pureUptrend → WMA(9) matches closed-form derivation', () => {
            assertSeriesClose(calcWMAData(pureUptrend, 9), WMA_GOLDEN.pureUptrend!.series)
        })
    })

    describe('mathematical properties', () => {
        it('warm-up region exactly [0, period-1)', () => {
            assertWarmupThenDefined(calcWMAData(pureUptrend, 9), 8, 'WMA(9) pureUptrend')
        })

        it('all values finite (or undefined in warm-up)', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
                assertFiniteOrUndefined(calcWMAData(fx, 9), 'WMA series')
            }
        })

        it('downtrend WMA mirrors uptrend WMA around the center value', () => {
            // pureUptrend close = 100+i, pureDowntrend close = 200-i
            // sum of corresponding closes = 300 for all i → WMA up + WMA down = 300
            const up = calcWMAData(pureUptrend, 9)
            const dn = calcWMAData(pureDowntrend, 9)
            for (let i = 0; i < up.length; i++) {
                if (up[i] === undefined) {
                    expect(dn[i]).toBeUndefined()
                } else {
                    expect(up[i]! + dn[i]!).toBeCloseTo(300, 9)
                }
            }
        })

        it('WMA lag on linear input equals (period-1)/3', () => {
            // For close = 100+t, WMA(period)(t) = (100+t) - (period-1)/3 at steady state
            const period = 9
            const out = calcWMAData(pureUptrend, period)
            const lag = (period - 1) / 3
            for (let t = period - 1; t < out.length; t++) {
                const expected = 100 + t - lag
                expect(out[t]!).toBeCloseTo(expected, 9)
            }
        })
    })

    describe('extensional consistency', () => {
        it('extending data preserves earlier WMA values', () => {
            for (let n = 9; n < pureUptrend.length; n++) {
                const prefix = calcWMAData(pureUptrend.slice(0, n), 9)
                const extended = calcWMAData(pureUptrend.slice(0, n + 1), 9)
                for (let i = 0; i < prefix.length; i++) {
                    if (prefix[i] === undefined) {
                        expect(extended[i]).toBeUndefined()
                    } else {
                        expect(extended[i]).toBeCloseTo(prefix[i]!, 12)
                    }
                }
            }
        })
    })
})
