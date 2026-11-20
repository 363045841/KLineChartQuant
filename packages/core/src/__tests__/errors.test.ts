/**
 * KLineChartError  taxonomy：基类、code、cause 传播、迁移后的 throw 站点。
 *
 * 每个迁移点只声明"触发方式 + 期望错误码"，由同一张表统一校验 instanceof 与 code。
 */

import { describe, expect, it } from 'vitest'

import { computeAnchoredVwap } from '../components/anchoredVwap/impl/computeAnchoredVwap'
import { isKLineChartError, KLineChartError, type KLineChartErrorCode } from '../errors'
import { createPriceScale } from '../scale/impl/createPriceScale'
import { createTimeScale } from '../scale/impl/createTimeScale'

/** 捕获同步 throw 并断言是带指定 code 的 KLineChartError。 */
function expectCode(run: () => unknown, code: KLineChartErrorCode): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(KLineChartError)
  expect(isKLineChartError(caught, code)).toBe(true)
}

describe('KLineChartError 基类', () => {
  it('继承 Error 并固定 name/code/message', () => {
    const e = new KLineChartError('INVALID_PARAM', 'bad input')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(KLineChartError)
    expect(e.name).toBe('KLineChartError')
    expect(e.message).toBe('bad input')
    expect(e.code).toBe('INVALID_PARAM')
  })

  it('保留 ES2022 cause', () => {
    const root = new TypeError('underlying')
    const wrapped = new KLineChartError('INVALID_STATE', 'wrap', { cause: root })
    expect(wrapped.cause).toBe(root)
  })

  it('stack 指向构造器之外', () => {
    const e = new KLineChartError('DISPOSED', 'gone')
    expect(typeof e.stack).toBe('string')
    // V8 only，gated on the captureStackTrace symbol existing.
    if ('captureStackTrace' in Error) {
      expect(e.stack).not.toContain('new KLineChartError')
    }
  })
})

describe('isKLineChartError 类型守卫', () => {
  it('识别实例并拒绝普通 Error / null / undefined', () => {
    expect(isKLineChartError(new KLineChartError('INVALID_PARAM', 'x'))).toBe(true)
    expect(isKLineChartError(new Error('x'))).toBe(false)
    expect(isKLineChartError(null)).toBe(false)
    expect(isKLineChartError(undefined)).toBe(false)
  })

  it('第二个参数按 code 收窄', () => {
    const e = new KLineChartError('SCALE_RANGE_INVALID', 'x')
    expect(isKLineChartError(e, 'SCALE_RANGE_INVALID')).toBe(true)
    expect(isKLineChartError(e, 'SCALE_LOG_REQUIRES_POSITIVE')).toBe(false)
  })
})

describe('迁移后的 throw 站点', () => {
  it.each([
    {
      name: 'PriceScale: visibleMax < visibleMin',
      code: 'SCALE_RANGE_INVALID' as const,
      run: () =>
        createPriceScale({
          initialMode: 'linear',
          initialVisibleMin: 100,
          initialVisibleMax: 50,
          initialHeight: 100,
        }),
    },
    {
      name: 'PriceScale: log 要求正数区间',
      code: 'SCALE_LOG_REQUIRES_POSITIVE' as const,
      run: () =>
        createPriceScale({
          initialMode: 'log',
          initialVisibleMin: -1,
          initialVisibleMax: 10,
          initialHeight: 100,
        }),
    },
    {
      name: 'PriceScale: initialHeight <= 0',
      code: 'SCALE_HEIGHT_INVALID' as const,
      run: () =>
        createPriceScale({
          initialMode: 'linear',
          initialVisibleMin: 0,
          initialVisibleMax: 1,
          initialHeight: 0,
        }),
    },
    {
      name: 'TimeScale: initialBarWidth <= 0',
      code: 'SCALE_BAR_WIDTH_INVALID' as const,
      run: () => createTimeScale({ initialBarWidth: 0 }),
    },
    {
      name: 'TimeScale.setBarWidth: <= 0',
      code: 'SCALE_BAR_WIDTH_INVALID' as const,
      run: () => createTimeScale({ initialBarWidth: 1 }).setBarWidth(-1),
    },
    {
      name: 'anchoredVwap: anchorIndex 越界',
      code: 'AVWAP_ANCHOR_OUT_OF_RANGE' as const,
      run: () =>
        computeAnchoredVwap(
          [
            { high: 1, low: 0.5, close: 0.9, volume: 10 },
            { high: 1.5, low: 1, close: 1.2, volume: 20 },
          ],
          99,
          false,
        ),
    },
  ] satisfies Array<{ name: string; code: KLineChartErrorCode; run: () => unknown }>)(
    '$name → $code',
    ({ run, code }) => expectCode(run, code),
  )

  it('anchoredVwap 空 bars 返回空数组而不抛错', () => {
    expect(computeAnchoredVwap([], 0, false)).toEqual([])
  })
})
