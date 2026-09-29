/**
 * 模板字段映射用例：可保存字段解析、抓取与应用。
 */

import { describe, expect, it } from 'vitest'

import { createDrawingObject } from '../../__tests__/helpers/drawingTestKit.js'
import {
  captureDrawingTemplate,
  captureTemplateStyle,
  drawingTemplateLabel,
  resolveTemplateLabel,
  resolveTemplateStyle,
  subsetTemplateStyle,
  templateStyleFields,
} from '../impl/templateMapping.js'

describe('templateMapping', () => {
  it('可保存字段取 Core 可编辑字段与模板字段的交集', () => {
    expect(templateStyleFields(['stroke', 'fill', 'strokeWidth'])).toEqual([
      'stroke',
      'fill',
      'strokeWidth',
    ])
    // fillOpacity / fontSize 等非模板字段被过滤。
    expect(templateStyleFields(['stroke', 'fillOpacity', 'fontSize'])).toEqual(['stroke'])
  })

  it('抓取时颜色缺失回退到线条色', () => {
    const drawing = createDrawingObject({ id: 'a', style: { stroke: '#123456', strokeWidth: 2 } })
    expect(captureDrawingTemplate('命名', drawing, ['stroke', 'fill', 'strokeWidth'])).toEqual({
      name: '命名',
      style: { stroke: '#123456', fill: '#123456', strokeWidth: 2 },
    })
    expect(captureTemplateStyle(drawing, ['fill'])).toEqual({ fill: '#123456' })
  })

  it('只取允许写入的字段，缺失字段跳过', () => {
    const template = { name: 't', style: { stroke: '#111111', strokeWidth: 4 } }
    expect(subsetTemplateStyle(template, ['stroke', 'strokeWidth'])).toEqual({
      stroke: '#111111',
      strokeWidth: 4,
    })
    expect(subsetTemplateStyle(template, ['fill', 'strokeStyle'])).toEqual({})
  })

  it('文本目标由图元已存在的标签决定，不依赖 UI 配置', () => {
    const areaLabeled = createDrawingObject({
      id: 'rectangle',
      kind: 'rectangle',
      labels: { line: {}, area: { '0': { text: '区域', position: 'end' } } },
    })
    expect(drawingTemplateLabel(areaLabeled)).toEqual({
      target: 'area',
      label: { text: '区域', position: 'end' },
    })
    expect(drawingTemplateLabel(createDrawingObject({ id: 'empty' }))).toBeNull()
  })

  it('应用模板时同步已有文本的位置，没有文本则不动', () => {
    const template = { name: 't', style: { stroke: '#111111' }, labelPosition: 'end' as const }
    const withText = createDrawingObject({
      id: 'trend',
      labels: { line: { '0': { text: '注记', position: 'start' } }, area: {} },
    })
    expect(resolveTemplateStyle(template, ['stroke'])).toEqual({ stroke: '#111111' })
    expect(resolveTemplateLabel(template, withText)).toEqual({
      target: 'line',
      text: '注记',
      position: 'end',
    })

    const withoutText = createDrawingObject({ id: 'plain' })
    expect(resolveTemplateLabel(template, withoutText)).toBeNull()
  })
})
