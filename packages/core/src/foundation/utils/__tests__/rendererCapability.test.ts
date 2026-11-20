/**
 * `detectRendererTier` 的契约测试。
 *
 * 覆盖：探测级联（webgpu > webgl2 > canvas2d > none）、reason 叙述、
 * probe 异常降级、生产 probe 在无 DOM 环境下不崩溃。
 */

import { describe, expect, it } from 'vitest'

import { type RendererTierProbes, detectRendererTier } from '../rendererCapability'

const TRUE = (): boolean => true
const FALSE = (): boolean => false
const THROW = (msg: string) => (): boolean => {
  throw new Error(msg)
}

describe('detectRendererTier 级联', () => {
  it.each([
    {
      name: '全部可用时选 webgpu',
      probes: { webgpu: TRUE, webgl2: TRUE, canvas2d: TRUE },
      tier: 'webgpu',
      tried: ['webgpu'],
    },
    {
      name: '无 WebGPU 时降到 webgl2',
      probes: { webgpu: FALSE, webgl2: TRUE, canvas2d: TRUE },
      tier: 'webgl2',
      tried: ['webgpu', 'webgl2'],
    },
    {
      name: '无 GPU 时降到 canvas2d',
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: TRUE },
      tier: 'canvas2d',
      tried: ['webgpu', 'webgl2', 'canvas2d'],
    },
    {
      name: '全不可用时返回 none',
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: FALSE },
      tier: 'none',
      tried: ['webgpu', 'webgl2', 'canvas2d'],
    },
  ] satisfies Array<{
    name: string
    probes: RendererTierProbes
    tier: string
    tried: string[]
  }>)('$name', ({ probes, tier, tried }) => {
    const result = detectRendererTier({ probes })
    expect(result.tier).toBe(tier)
    expect(result.tried).toEqual(tried)
  })
})

describe('detectRendererTier reason 叙述', () => {
  it.each(['webgpu', 'webgl2', 'canvas2d'] as const)('选中 %s 时 reason 点明该层级', (tier) => {
    const probes: RendererTierProbes = { webgpu: FALSE, webgl2: FALSE, canvas2d: FALSE, [tier]: TRUE }
    expect(detectRendererTier({ probes }).reason).toContain(`selected ${tier}`)
  })

  it('none 时 reason 枚举全部尝试层级', () => {
    const result = detectRendererTier({
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: FALSE },
    })
    expect(result.reason).toContain('webgpu')
    expect(result.reason).toContain('webgl2')
    expect(result.reason).toContain('canvas2d')
  })

  it('probe 抛异常折算为不可用并写入 reason', () => {
    const result = detectRendererTier({
      probes: {
        webgpu: THROW('adapter init crashed'),
        webgl2: FALSE,
        canvas2d: FALSE,
      },
    })
    expect(result.tier).toBe('none')
    expect(result.reason).toContain('threw "adapter init crashed"')
  })

  it('probe 抛异常时继续尝试下一层级', () => {
    const result = detectRendererTier({
      probes: { webgpu: THROW('gpu denied'), webgl2: TRUE, canvas2d: TRUE },
    })
    expect(result.tier).toBe('webgl2')
  })
})

describe('detectRendererTier 生产 probe（无 override）', () => {
  it('在 Node 环境返回结构完整的结果而不抛错', () => {
    const result = detectRendererTier()
    expect(typeof result.tier).toBe('string')
    expect(typeof result.reason).toBe('string')
    expect(Array.isArray(result.tried)).toBe(true)
  })
})
