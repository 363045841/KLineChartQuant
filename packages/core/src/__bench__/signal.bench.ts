/**
 * Signal hot path — measures `set()` + notify cost across subscriber counts.
 *
 * Why this matters: every controller in core uses Signal as its reactive
 * primitive. At 60fps with 100 active signals + 100 mounted React subscribers,
 * we want the per-`set` cost to be in nanoseconds, not micros. If this bench
 * regresses, the whole library regresses.
 */

import { describe, test } from 'vitest'

import { createSignal } from '../foundation/reactivity/signal'

describe('signal.set + notify — subscriber scaling', () => {
  test('compares set + notify cost across subscriber counts', async ({ bench }) => {
    const s0 = createSignal(0)

    const s1 = createSignal(0)
    s1.subscribe(() => {})

    const s10 = createSignal(0)
    for (let k = 0; k < 10; k++) s10.subscribe(() => {})

    const s100 = createSignal(0)
    for (let k = 0; k < 100; k++) s100.subscribe(() => {})

    const sNoOp = createSignal(0)

    await bench.compare(
      bench('0 subscribers, 1k sets', () => {
        for (let i = 0; i < 1000; i++) s0.set(i)
      }),
      bench('1 subscriber, 1k sets', () => {
        for (let i = 0; i < 1000; i++) s1.set(i)
      }),
      bench('10 subscribers, 1k sets', () => {
        for (let i = 0; i < 1000; i++) s10.set(i)
      }),
      bench('100 subscribers, 1k sets', () => {
        for (let i = 0; i < 1000; i++) s100.set(i)
      }),
      bench('Object.is short-circuit (1k equal sets)', () => {
        for (let i = 0; i < 1000; i++) sNoOp.set(0)
      }),
    )
  })
})
