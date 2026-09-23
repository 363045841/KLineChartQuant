// 本文件验证绘图标签键的合法性判定与标签归一化。
import { describe, expect, it } from 'vitest'
import type { DrawingLabel, DrawingLabels } from '../../types.js'
import {
  drawingLabelIndexKey,
  isDrawingLabelIndexKey,
  normalizeDrawingLabels,
} from '../impl/drawingLabels'

/** 形状完整的标签；各用例只声明差异。 */
const LABEL: DrawingLabel = { text: '低位', position: 'center' }

/** 归一化的空文档模型，供丢弃类用例共用。 */
const EMPTY_LABELS: DrawingLabels = { line: {}, area: {} }

/** 归一化断言，避免每个用例重复调用。 */
function expectNormalized(input: unknown, expected: DrawingLabels): void {
  expect(normalizeDrawingLabels(input)).toEqual(expected)
}

/** 合法的键：规范非负整数字符串。 */
const VALID_KEYS = ['0', '1', '12', '100']

/** 非法的键：非序号、带符号、小数、前导零、含空白等。 */
const INVALID_KEYS = ['position', 'text', 'start', 'foo', '', '01', '007', '-1', '1.5', ' 1', '1 2']

const INDEX_KEY_CASES = [
  [0, '0'],
  [12, '12'],
] as const

/** 会被丢弃的输入：只声明差异，断言统一走 expectNormalized。 */
const DISCARD_CASES = [
  {
    name: 'the flat shape that used to crash normalization',
    input: { line: { position: 'end', text: 'x' }, area: {} },
  },
  {
    name: 'non-index keys and malformed values',
    input: {
      line: { start: LABEL, '01': LABEL, '-1': LABEL, 0: 'oops', 1: { text: 1 } },
      area: {},
    },
  },
  { name: 'a missing model', input: undefined },
  { name: 'non-object groups', input: { line: 'nope', area: null } },
  { name: 'a non-object root', input: 'nope' },
]

describe('isDrawingLabelIndexKey', () => {
  it.each(VALID_KEYS)('accepts canonical index %j', (key) => {
    expect(isDrawingLabelIndexKey(key)).toBe(true)
  })

  it.each(INVALID_KEYS)('rejects non-index %j', (key) => {
    expect(isDrawingLabelIndexKey(key)).toBe(false)
  })
})

describe('drawingLabelIndexKey', () => {
  it.each(INDEX_KEY_CASES)('maps index %i to canonical key %s', (index, key) => {
    expect(drawingLabelIndexKey(index)).toBe(key)
    expect(isDrawingLabelIndexKey(drawingLabelIndexKey(index))).toBe(true)
  })
})

describe('normalizeDrawingLabels', () => {
  it('keeps index-keyed labels and normalizes newlines to a literal control code', () => {
    expectNormalized(
      {
        line: { 0: { text: 'a\nb', position: 'center' }, 2: { text: 'c\r\nd', position: 'end' } },
        area: { 0: LABEL },
      },
      {
        line: {
          0: { text: 'a\\nb', position: 'center' },
          2: { text: 'c\\nd', position: 'end' },
        },
        area: { 0: LABEL },
      },
    )
  })

  it.each(DISCARD_CASES)('drops $name', ({ input }) => {
    expectNormalized(input, EMPTY_LABELS)
  })
})
