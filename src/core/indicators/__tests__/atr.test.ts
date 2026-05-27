import { describe, it, expect } from 'vitest'
import { calcATRData } from '../calculators'
import {
    empty,
    singleBar,
    shortSequence,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
    gapUp,
} from './__fixtures__/synthetic'
import { ATR_GOLDEN, assertSeriesClose } from './__fixtures__/golden'
import {
    assertNonNegative,
    assertFiniteOrUndefined,
} from './_propertyAssertions'

describe('calcATRData — Wilder ATR(period)', () => {
    describe('edge cases', () => {
        it('empty input returns empty array', () => {
            expect(calcATRData(empty, 14)).toEqual([])
        })

        it('single bar with period 14 returns [undefined]', () => {
            expect(calcATRData(singleBar, 14)).toEqual([undefined])
        })

        it('shorter than period returns all undefined', () => {
            const out = calcATRData(shortSequence, 14)
            expect(out).toHaveLength(shortSequence.length)
            for (const v of out) expect(v).toBeUndefined()
        })

        it('period = 0 or negative returns all undefined', () => {
            expect(calcATRData(pureUptrend, 0)).toEqual(
                Array.from({ length: pureUptrend.length }, () => undefined),
            )
            expect(calcATRData(pureUptrend, -3)).toEqual(
                Array.from({ length: pureUptrend.length }, () => undefined),
            )
        })

        it('period = 1 produces TR series (no smoothing of length-1 average)', () => {
            const out = calcATRData(pureUptrend, 1)
            expect(out).toHaveLength(pureUptrend.length)
            for (let i = 0; i < out.length; i++) {
                expect(out[i]).toBeCloseTo(2, 9)
            }
        })
    })

    describe('golden values vs known fixtures', () => {
        it('constantPrice → ATR(14) is 0 after warm-up', () => {
            const out = calcATRData(constantPrice, 14)
            assertSeriesClose(out, ATR_GOLDEN.constantPrice!.series)
        })

        it('pureUptrend → ATR(14) is 2 after warm-up', () => {
            const out = calcATRData(pureUptrend, 14)
            assertSeriesClose(out, ATR_GOLDEN.pureUptrend!.series)
        })

        it('spikeAtBar19 → matches Wilder smoothing exactly', () => {
            const out = calcATRData(spikeAtBar19, 14)
            assertSeriesClose(out, ATR_GOLDEN.spikeAtBar19!.series)
        })
    })

    describe('mathematical properties (PR 0 baseline)', () => {
        it('ATR ≥ 0 across all fixtures', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19, gapUp]) {
                assertNonNegative(calcATRData(fx, 14), 'ATR series')
            }
        })

        it('ATR yields only finite or undefined values', () => {
            for (const fx of [pureUptrend, pureDowntrend, sideways, spikeAtBar19, gapUp]) {
                assertFiniteOrUndefined(calcATRData(fx, 14), 'ATR series')
            }
        })

        it('warm-up region is exactly [0, period-1)', () => {
            const period = 14
            const out = calcATRData(pureUptrend, period)
            for (let i = 0; i < period - 1; i++) expect(out[i]).toBeUndefined()
            for (let i = period - 1; i < out.length; i++) expect(out[i]).toBeDefined()
        })

        it('symmetry: uptrend and downtrend with identical TR shape yield identical ATR', () => {
            const up = calcATRData(pureUptrend, 14)
            const down = calcATRData(pureDowntrend, 14)
            expect(up.length).toBe(down.length)
            for (let i = 0; i < up.length; i++) {
                if (up[i] === undefined) {
                    expect(down[i]).toBeUndefined()
                } else {
                    expect(down[i]).toBeCloseTo(up[i]!, 9)
                }
            }
        })

        it('ATR responds to volatility spike (post-spike > pre-spike)', () => {
            const out = calcATRData(spikeAtBar19, 14)
            const preSpike = out[18]
            const postSpike = out[19]
            expect(preSpike).toBeDefined()
            expect(postSpike).toBeDefined()
            expect(postSpike!).toBeGreaterThan(preSpike!)
        })

        it('ATR decays back toward baseline after spike absorbs', () => {
            const out = calcATRData(spikeAtBar19, 14)
            expect(out[20]!).toBeLessThan(out[19]!)
            expect(out[21]!).toBeLessThan(out[20]!)
            expect(out[22]!).toBeLessThan(out[21]!)
        })
    })

    describe('extensional consistency (live ≡ historical)', () => {
        it('extending data by one bar preserves all earlier ATR values', () => {
            for (let n = 14; n < pureUptrend.length; n++) {
                const prefix = pureUptrend.slice(0, n)
                const extended = pureUptrend.slice(0, n + 1)
                const prefixATR = calcATRData(prefix, 14)
                const extendedATR = calcATRData(extended, 14)
                for (let i = 0; i < prefix.length; i++) {
                    if (prefixATR[i] === undefined) {
                        expect(extendedATR[i]).toBeUndefined()
                    } else {
                        expect(extendedATR[i]).toBeCloseTo(prefixATR[i]!, 12)
                    }
                }
            }
        })

        it('bar-by-bar feeding matches batch computation on spike fixture', () => {
            const batch = calcATRData(spikeAtBar19, 14)
            for (let n = 1; n <= spikeAtBar19.length; n++) {
                const partial = calcATRData(spikeAtBar19.slice(0, n), 14)
                expect(partial).toHaveLength(n)
                for (let i = 0; i < n; i++) {
                    if (batch[i] === undefined) {
                        expect(partial[i]).toBeUndefined()
                    } else {
                        expect(partial[i]).toBeCloseTo(batch[i]!, 12)
                    }
                }
            }
        })
    })
})
