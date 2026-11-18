/** 指标参数校验的契约测试：键、类型、范围、选项与完整性都只由声明表决定。 */
import { describe, expect, it } from 'vitest'
import type { IndicatorParamDef } from '@/controllers/types'
import { parseIndicatorParams } from '../parseIndicatorParams'

/** 覆盖四种参数类型的最小声明表。 */
const DEFS: ReadonlyArray<IndicatorParamDef> = [
  { key: 'period', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
  { key: 'multiplier', label: '倍数', type: 'number', default: 2, step: 0.1 },
  { key: 'enabled', label: '启用', type: 'boolean', default: true },
  {
    key: 'mode',
    label: '模式',
    type: 'select',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
]

/** 把校验结果压成可断言的形状，避免逐条匹配 issue 对象。 */
function summarize(
  input: Readonly<Record<string, unknown>>,
  requireComplete = false,
): { params: Readonly<Record<string, unknown>> } | { issues: string[] } {
  const result = parseIndicatorParams(DEFS, input, { requireComplete })
  return result.ok
    ? { params: result.params }
    : { issues: result.issues.map((issue) => `${issue.key}:${issue.reason}`) }
}

describe('parseIndicatorParams', () => {
  it.each([
    { name: '接受合法参数', input: { period: 10, enabled: false }, expected: { params: { period: 10, enabled: false } } },
    { name: '数字字符串转成数字', input: { period: '10' }, expected: { params: { period: 10 } } },
    { name: 'null 视为未提供', input: { period: null, multiplier: 3 }, expected: { params: { multiplier: 3 } } },
    { name: '拒绝未知键', input: { nope: 1 }, expected: { issues: ['nope:unknown'] } },
    { name: '拒绝非数字', input: { period: 'abc' }, expected: { issues: ['period:type'] } },
    { name: '拒绝超出下限', input: { period: 0 }, expected: { issues: ['period:range'] } },
    { name: '拒绝超出上限', input: { period: 501 }, expected: { issues: ['period:range'] } },
    { name: '拒绝错误布尔类型', input: { enabled: 'true' }, expected: { issues: ['enabled:type'] } },
    { name: '拒绝未声明的选项值', input: { mode: 'c' }, expected: { issues: ['mode:option'] } },
    { name: '一次返回全部问题', input: { period: 0, enabled: 'x' }, expected: { issues: ['period:range', 'enabled:type'] } },
  ])('$name', ({ input, expected }) => {
    expect(summarize(input)).toEqual(expected)
  })

  it.each([
    {
      name: '完整参数集通过',
      input: { period: 10, multiplier: 2, enabled: true, mode: 'a' },
      expected: { params: { period: 10, multiplier: 2, enabled: true, mode: 'a' } },
    },
    {
      name: '缺键按声明顺序报告',
      input: { period: 10, enabled: true },
      expected: { issues: ['multiplier:missing', 'mode:missing'] },
    },
    {
      name: 'null 在完整模式下算缺失',
      input: { period: 10, multiplier: null, enabled: true, mode: 'a' },
      expected: { issues: ['multiplier:missing'] },
    },
    {
      name: '空对象报告全部缺失',
      input: {},
      expected: { issues: ['period:missing', 'multiplier:missing', 'enabled:missing', 'mode:missing'] },
    },
  ])('$name', ({ input, expected }) => {
    expect(summarize(input, true)).toEqual(expected)
  })
})
