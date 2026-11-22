/** 指标输入校验的契约测试：键、类型、范围与选项都只由声明表决定。 */
import { describe, expect, it } from 'vitest'
import type { IndicatorInputDef } from '@/controllers/types'
import { parseIndicatorInputs } from '../parseIndicatorInputs'

/** 覆盖四类输入声明的最小表。 */
const DEFS: ReadonlyArray<IndicatorInputDef> = [
  { key: 'period', label: '周期', type: 'number', default: 20, min: 1, max: 500 },
  { key: 'multiplier', label: '倍数', type: 'number', default: 2, step: 0.1 },
  { key: 'enabled', label: '启用', type: 'boolean', default: true },
  { key: 'label', label: '名称', type: 'string', default: 'MA' },
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
): { inputs: Readonly<Record<string, unknown>> } | { issues: string[] } {
  const result = parseIndicatorInputs(DEFS, input, { requireComplete })
  return result.ok
    ? { inputs: result.inputs }
    : { issues: result.issues.map((issue) => `${issue.key}:${issue.reason}`) }
}

describe('parseIndicatorInputs', () => {
  it.each([
    {
      name: '接受合法输入',
      input: { period: 10, enabled: false, label: 'EMA' },
      expected: { inputs: { period: 10, enabled: false, label: 'EMA' } },
    },
    { name: '数字字符串转成数字', input: { period: '10' }, expected: { inputs: { period: 10 } } },
    {
      name: 'null 视为未提供',
      input: { period: null, multiplier: 3 },
      expected: { inputs: { multiplier: 3 } },
    },
    { name: '拒绝未知键', input: { nope: 1 }, expected: { issues: ['nope:unknown'] } },
    { name: '拒绝非数字', input: { period: 'abc' }, expected: { issues: ['period:type'] } },
    { name: '拒绝超出下限', input: { period: 0 }, expected: { issues: ['period:range'] } },
    { name: '拒绝超出上限', input: { period: 501 }, expected: { issues: ['period:range'] } },
    {
      name: '拒绝错误布尔类型',
      input: { enabled: 'true' },
      expected: { issues: ['enabled:type'] },
    },
    { name: '拒绝非字符串', input: { label: 1 }, expected: { issues: ['label:type'] } },
    { name: '拒绝未声明的选项值', input: { mode: 'c' }, expected: { issues: ['mode:option'] } },
    {
      name: '一次返回全部问题',
      input: { period: 0, enabled: 'x' },
      expected: { issues: ['period:range', 'enabled:type'] },
    },
  ])('$name', ({ input, expected }) => {
    expect(summarize(input)).toEqual(expected)
  })

  it.each([
    {
      name: '完整输入集通过',
      input: { period: 10, multiplier: 2, enabled: true, label: 'MA', mode: 'a' },
      expected: {
        inputs: { period: 10, multiplier: 2, enabled: true, label: 'MA', mode: 'a' },
      },
    },
    {
      name: '缺键按声明顺序报告',
      input: { period: 10, enabled: true, label: 'MA' },
      expected: { issues: ['multiplier:missing', 'mode:missing'] },
    },
    {
      name: 'null 在完整模式下算缺失',
      input: { period: 10, multiplier: null, enabled: true, label: 'MA', mode: 'a' },
      expected: { issues: ['multiplier:missing'] },
    },
    {
      name: '空对象报告全部缺失',
      input: {},
      expected: {
        issues: [
          'period:missing',
          'multiplier:missing',
          'enabled:missing',
          'label:missing',
          'mode:missing',
        ],
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(summarize(input, true)).toEqual(expected)
  })
})
