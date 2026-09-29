/**
 * 绘图模板契约层：模板数据形状、可持久化样式字段与 CRUD 依赖接口；实现位于 impl/。
 */

import type { DrawingLabelPosition, DrawingStyle } from '@/foundation/plugin/index.js'

import type { DrawingKind } from '../types.js'

/** 模板持久化的样式字段；文本位置单独存放，不混入样式。 */
export type TemplateStyleKey = 'stroke' | 'fill' | 'strokeWidth' | 'strokeStyle'

/** 模板样式是图元样式的子集，只保存可复用的字段。 */
export type TemplateStyle = Partial<Pick<DrawingStyle, TemplateStyleKey>>

/** 一份可复用的图元模板。 */
export type DrawingTemplate = {
  readonly name: string
  readonly style: TemplateStyle
  readonly labelPosition?: DrawingLabelPosition
}

/** 模板 CRUD 契约：调用方只依赖它，不关心存储介质。 */
export interface DrawingTemplateStore {
  /** 读取某类图元的全部模板。 */
  list(kind: DrawingKind): Promise<DrawingTemplate[]>
  /** 按名称新增或替换模板，返回写入后的完整列表。 */
  upsert(kind: DrawingKind, template: DrawingTemplate): Promise<DrawingTemplate[]>
  /** 按名称删除模板，返回删除后的完整列表。 */
  remove(kind: DrawingKind, name: string): Promise<DrawingTemplate[]>
}
