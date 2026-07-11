import { describe, it, expect, vi } from 'vitest'

import { createReplayController } from '../createReplayController'
import type { ReplayState } from '../types'

// A 1-minute bar interval so wall-clock math is easy to reason about:
//   1000ms of wall-clock at speed=1 advances 1000/60000 = 0.01666... bars.
//   At speed=60, 1000ms advances 1 full bar.
const ONE_MINUTE_MS = 60_000

function build(initOverride: Partial<Parameters<typeof createReplayController>[0]> = {}) {
  return createReplayController({
    start: 0,
    end: 99,
    pacing: 'bar',
    speed: 1,
    barIntervalMs: ONE_MINUTE_MS,
    ...initOverride,
  })
}

describe('createReplayController', () => {
  it('initialises position at start with mode=paused', () => {
    const ctrl = build()
    const s = ctrl.state.peek()
    expect(s.position).toBe(0)
    expect(s.start).toBe(0)
    expect(s.end).toBe(99)
    expect(s.mode).toBe('paused')
    expect(s.pacing).toBe('bar')
    expect(s.speed).toBe(1)
    ctrl.dispose()
  })

  it('throws on construction when end < start', () => {
    expect(() => build({ start: 10, end: 5 })).toThrow(/end.*start/i)
  })

  it('throws on construction when speed <= 0', () => {
    expect(() => build({ speed: 0 })).toThrow(/speed/i)
    expect(() => build({ speed: -1 })).toThrow(/speed/i)
  })

  it('seekTo within range updates state and notifies subscribers', () => {
    const ctrl = build()
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.seekTo(42)
    expect(ctrl.state.peek().position).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
    unsub()
    ctrl.dispose()
  })

  it('seekTo above end clamps to end', () => {
    const ctrl = build()
    ctrl.seekTo(1_000_000)
    expect(ctrl.state.peek().position).toBe(99)
    ctrl.dispose()
  })

  it('seekTo below start clamps to start', () => {
    const ctrl = build()
    ctrl.seekTo(-50)
    expect(ctrl.state.peek().position).toBe(0)
    ctrl.dispose()
  })

  it('stepForward + stepBackward returns to the same position', () => {
    const ctrl = build()
    ctrl.seekTo(20)
    ctrl.stepForward()
    expect(ctrl.state.peek().position).toBe(21)
    ctrl.stepBackward()
    expect(ctrl.state.peek().position).toBe(20)
    ctrl.dispose()
  })

  it('consecutive stepForward past end clamps to end and auto-pauses if playing', () => {
    const ctrl = build({ end: 3 })
    ctrl.seekTo(2)
    ctrl.play()
    expect(ctrl.state.peek().mode).toBe('playing')
    ctrl.stepForward() // -> 3, hits end while playing => auto-paused
    const s = ctrl.state.peek()
    expect(s.position).toBe(3)
    expect(s.mode).toBe('paused')
    // Further forwards stay clamped.
    ctrl.stepForward()
    expect(ctrl.state.peek().position).toBe(3)
    ctrl.dispose()
  })

  it('play() then pause() toggles mode and emits both transitions', () => {
    const ctrl = build()
    ctrl.seekTo(10)
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.play()
    expect(ctrl.state.peek().mode).toBe('playing')
    ctrl.pause()
    expect(ctrl.state.peek().mode).toBe('paused')
    expect(fn).toHaveBeenCalledTimes(2)
    unsub()
    ctrl.dispose()
  })

  it('toggle() flips between paused and playing', () => {
    const ctrl = build()
    ctrl.seekTo(10)
    expect(ctrl.state.peek().mode).toBe('paused')
    ctrl.toggle()
    expect(ctrl.state.peek().mode).toBe('playing')
    ctrl.toggle()
    expect(ctrl.state.peek().mode).toBe('paused')
    ctrl.dispose()
  })

  it('play() at end stays paused (no observable mode flip)', () => {
    const ctrl = build({ end: 5 })
    ctrl.seekTo(5)
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.play()
    expect(ctrl.state.peek().mode).toBe('paused')
    expect(fn).not.toHaveBeenCalled()
    unsub()
    ctrl.dispose()
  })

  it('tick() in bar mode is a no-op when playing', () => {
    const ctrl = build({ pacing: 'bar' })
    ctrl.play()
    const before = ctrl.state.peek().position
    const changed = ctrl.tick(1000)
    expect(changed).toBe(false)
    expect(ctrl.state.peek().position).toBe(before)
    ctrl.dispose()
  })

  it('tick() in wallclock mode advances proportional to deltaMs * speed', () => {
    const ctrl = build({ pacing: 'wallclock', speed: 1 })
    ctrl.play()
    // 1000ms at speed=1 with 60_000ms/bar → 1/60 of a bar.
    const changed = ctrl.tick(1000)
    expect(changed).toBe(true)
    expect(ctrl.state.peek().position).toBeCloseTo(1 / 60, 10)

    // Bump speed to 60 → 1000ms advances exactly 1 bar.
    ctrl.setSpeed(60)
    const before = ctrl.state.peek().position
    ctrl.tick(1000)
    expect(ctrl.state.peek().position).toBeCloseTo(before + 1, 10)
    ctrl.dispose()
  })

  it('tick() in tick mode advances faster than wallclock at the same speed', () => {
    const wallCtrl = build({ pacing: 'wallclock', speed: 1 })
    const tickCtrl = build({ pacing: 'tick', speed: 1 })
    wallCtrl.play()
    tickCtrl.play()
    wallCtrl.tick(1000)
    tickCtrl.tick(1000)
    const wallAdvance = wallCtrl.state.peek().position
    const tickAdvance = tickCtrl.state.peek().position
    expect(tickAdvance).toBeGreaterThan(wallAdvance)
    // 1000ms / 100ms-per-bar * speed=1 = 10 bars
    expect(tickAdvance).toBeCloseTo(10, 10)
    wallCtrl.dispose()
    tickCtrl.dispose()
  })

  it('reaching end via tick() auto-pauses and clamps to end', () => {
    const ctrl = build({ pacing: 'wallclock', speed: 60, end: 5 })
    ctrl.play()
    // 10 bars worth of advance — far past the end (5).
    ctrl.tick(10_000)
    const s = ctrl.state.peek()
    expect(s.position).toBe(5)
    expect(s.mode).toBe('paused')
    ctrl.dispose()
  })

  it('setPacing mid-play keeps mode=playing and switches tick math', () => {
    const ctrl = build({ pacing: 'wallclock', speed: 1 })
    ctrl.play()
    ctrl.tick(1000)
    const afterWall = ctrl.state.peek().position
    expect(ctrl.state.peek().mode).toBe('playing')

    ctrl.setPacing('bar')
    // Still playing, but bar pacing means tick() no longer advances.
    expect(ctrl.state.peek().mode).toBe('playing')
    const changed = ctrl.tick(1000)
    expect(changed).toBe(false)
    expect(ctrl.state.peek().position).toBe(afterWall)
    ctrl.dispose()
  })

  it('setSpeed(<=0) throws and does not mutate state', () => {
    const ctrl = build()
    const before = ctrl.state.peek()
    expect(() => ctrl.setSpeed(0)).toThrow(/speed/i)
    expect(() => ctrl.setSpeed(-2)).toThrow(/speed/i)
    expect(ctrl.state.peek()).toBe(before) // same object reference
    ctrl.dispose()
  })

  it('setRange clamps current position into the new range', () => {
    const ctrl = build({ end: 100 })
    ctrl.seekTo(80)
    ctrl.setRange(0, 50)
    const s = ctrl.state.peek()
    expect(s.start).toBe(0)
    expect(s.end).toBe(50)
    expect(s.position).toBe(50)
    ctrl.dispose()
  })

  it('setRange throws when end < start and leaves state untouched', () => {
    const ctrl = build()
    const before = ctrl.state.peek()
    expect(() => ctrl.setRange(20, 10)).toThrow(/end.*start/i)
    expect(ctrl.state.peek()).toBe(before)
    ctrl.dispose()
  })

  it('tick() returns true only when position changed', () => {
    const ctrl = build({ pacing: 'wallclock', speed: 60, end: 10 })
    ctrl.play()
    expect(ctrl.tick(1000)).toBe(true) // advanced ~1 bar
    // Seek to the end manually so playback is at the right edge.
    ctrl.seekTo(10)
    // After clamping at end, the controller has auto-paused already, so
    // tick() should refuse to advance (mode != 'playing').
    expect(ctrl.tick(1000)).toBe(false)

    // Negative or zero delta is ignored regardless of mode.
    const fresh = build({ pacing: 'wallclock' })
    fresh.play()
    expect(fresh.tick(0)).toBe(false)
    expect(fresh.tick(-100)).toBe(false)
    ctrl.dispose()
    fresh.dispose()
  })

  it('dispose silences subsequent mutators (no further emissions)', () => {
    const ctrl = build()
    ctrl.seekTo(10)
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.dispose()
    ctrl.seekTo(20)
    ctrl.play()
    ctrl.stepForward()
    ctrl.setPacing('wallclock')
    // Tick after dispose returns false and emits nothing.
    expect(ctrl.tick(1000)).toBe(false)
    expect(fn).not.toHaveBeenCalled()
    // State observably unchanged from pre-dispose.
    expect(ctrl.state.peek().position).toBe(10)
    unsub()
  })

  it('seekBy clamps and notifies on net change', () => {
    const ctrl = build()
    ctrl.seekTo(50)
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.seekBy(10)
    expect(ctrl.state.peek().position).toBe(60)
    ctrl.seekBy(1_000_000)
    expect(ctrl.state.peek().position).toBe(99)
    ctrl.seekBy(-1_000_000)
    expect(ctrl.state.peek().position).toBe(0)
    expect(fn).toHaveBeenCalledTimes(3)
    unsub()
    ctrl.dispose()
  })

  it('state is a single transactional snapshot — one notification per mutation', () => {
    // Verifies the "single signal" design: setRange changes multiple
    // fields but subscribers see one emission.
    const ctrl = build()
    ctrl.seekTo(80)
    const captured: ReplayState[] = []
    const unsub = ctrl.state.subscribe(() => {
      captured.push(ctrl.state.peek())
    })
    ctrl.setRange(10, 50)
    expect(captured).toHaveLength(1)
    const snap = captured[0] as ReplayState
    expect(snap.start).toBe(10)
    expect(snap.end).toBe(50)
    expect(snap.position).toBe(50) // clamped from 80
    unsub()
    ctrl.dispose()
  })

  it('no-op seekTo to current position does not notify', () => {
    const ctrl = build()
    ctrl.seekTo(25)
    const fn = vi.fn()
    const unsub = ctrl.state.subscribe(fn)
    ctrl.seekTo(25)
    expect(fn).not.toHaveBeenCalled()
    unsub()
    ctrl.dispose()
  })
})
