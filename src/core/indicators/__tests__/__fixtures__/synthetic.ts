import type { KLineData } from '@/types/price'

const T0 = 1_700_000_000_000
const MINUTE = 60_000

function bar(i: number, open: number, high: number, low: number, close: number, volume = 1000): KLineData {
    return { timestamp: T0 + i * MINUTE, open, high, low, close, volume }
}

export const empty: KLineData[] = []

export const singleBar: KLineData[] = [bar(0, 100, 101, 99, 100)]

export const shortSequence: KLineData[] = [
    bar(0, 100, 101, 99, 100),
    bar(1, 100, 102, 99, 101),
    bar(2, 101, 103, 100, 102),
]

export const constantPrice: KLineData[] = Array.from({ length: 30 }, (_, i) =>
    bar(i, 100, 100, 100, 100),
)

export const pureUptrend: KLineData[] = Array.from({ length: 30 }, (_, i) =>
    bar(i, 100 + i, 101 + i, 99 + i, 100 + i),
)

export const pureDowntrend: KLineData[] = Array.from({ length: 30 }, (_, i) =>
    bar(i, 200 - i, 201 - i, 199 - i, 200 - i),
)

export const sideways: KLineData[] = Array.from({ length: 30 }, (_, i) => {
    const phase = (i % 4) - 1.5
    const close = 100 + phase
    return bar(i, 100, 100 + Math.abs(phase) + 0.5, 100 - Math.abs(phase) - 0.5, close)
})

export const spikeAtBar19: KLineData[] = (() => {
    const out: KLineData[] = []
    for (let i = 0; i < 19; i++) out.push(bar(i, 100, 101, 99, 100))
    out.push(bar(19, 100, 110, 95, 105))
    for (let i = 20; i < 25; i++) out.push(bar(i, 105, 106, 104, 105))
    return out
})()

export const gapUp: KLineData[] = (() => {
    const out: KLineData[] = []
    for (let i = 0; i < 10; i++) out.push(bar(i, 100, 101, 99, 100))
    for (let i = 10; i < 20; i++) out.push(bar(i, 110, 111, 109, 110))
    return out
})()

export const FIXTURES = {
    empty,
    singleBar,
    shortSequence,
    constantPrice,
    pureUptrend,
    pureDowntrend,
    sideways,
    spikeAtBar19,
    gapUp,
} as const

export type FixtureName = keyof typeof FIXTURES
