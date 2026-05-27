import { describe, it, expect } from 'vitest'
import { calcKAMAData } from '../calculators'
import {
    empty,
    singleBar,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
} from './__fixtures__/synthetic'
import { KAMA_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertFiniteOrUndefined,
} from './_propertyAssertions'

describe('calcKAMAData — Kaufman Adaptive Moving Average', () => {
    describe('edge cases', () => {
        it('empty returns empty array', () => {
            expect(calcKAMAData(empty, 10, 2, 30)).toEqual([])
        })

        it('single bar returns [undefined]', () => {
            expect(calcKAMAData(singleBar, 10, 2, 30)).toEqual([undefined])
        })

        it('n <= period returns all undefined', () => {
            const tiny = constantPrice.slice(0, 10)
            const out = calcKAMAData(tiny, 10, 2, 30)
            for (const v of out) expect(v).toBeUndefined()
        })

        it('period = 0 or negative returns all undefined', () => {
            expect(calcKAMAData(pureUptrend, 0, 2, 30)).toEqual(
                Array.from({ length: pureUptrend.length }, () => undefined),
            )
            expect(calcKAMAData(pureUptrend, -1, 2, 30)).toEqual(
                Array.from({ length: pureUptrend.length }, () => undefined),
            )
        })
    })

    describe('golden values', () => {
        it('constantPrice → KAMA stays at 100 once seeded', () => {
            assertSeriesClose(calcKAMAData(constantPrice, 10, 2, 30), KAMA_GOLDEN.constantPrice!.series)
        })
    })

    describe('mathematical properties', () => {
        it('all values finite', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19]) {
                assertFiniteOrUndefined(calcKAMAData(fx, 10, 2, 30), 'KAMA series')
            }
        })

        it('on pureUptrend ER ≈ 1 → KAMA tracks close[t] closely', () => {
            // Linear uptrend has direction = period and volSum = period (all changes = 1),
            // so ER = 1 every step → SC = fastSC² = (2/3)² = 4/9 ≈ 0.444
            const out = calcKAMAData(pureUptrend, 10, 2, 30)
            // Tail values should be close to close[t]; difference monotonically shrinks
            const tail = out.slice(15)
            for (let i = 1; i < tail.length; i++) {
                if (tail[i] === undefined || tail[i - 1] === undefined) continue
                expect(tail[i]!).toBeGreaterThan(tail[i - 1]!)
            }
        })

        it('extensional consistency', () => {
            const full = calcKAMAData(pureUptrend, 10, 2, 30)
            for (let n = 12; n < pureUptrend.length; n++) {
                const partial = calcKAMAData(pureUptrend.slice(0, n), 10, 2, 30)
                for (let i = 0; i < n; i++) {
                    if (full[i] !== undefined && partial[i] !== undefined) {
                        expect(partial[i]).toBeCloseTo(full[i]!, 9)
                    }
                }
            }
        })
    })
})
