import { createIndexedDbPersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'

import { drawingColorFields, type DrawingColorField } from './config.js'

type DrawingKind = DrawingObject['kind']

export type DrawingTemplate = {
  name: string
  style: Partial<Pick<DrawingStyle, DrawingColorField>>
}

const colorPattern = /^#[0-9a-fA-F]{6}$/
const colorKeys = Object.keys(drawingColorFields) as DrawingColorField[]

const codec: PersistenceCodec<DrawingTemplate[]> = {
  decode(value) {
    if (!Array.isArray(value)) return null
    return value.filter((item): item is DrawingTemplate => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      if (typeof record.name !== 'string' || !record.name.trim()) return false
      if (!record.style || typeof record.style !== 'object') return false
      const style = record.style as Record<string, unknown>
      return Object.keys(style).length > 0 && Object.entries(style).every(
        ([key, color]) => Object.hasOwn(drawingColorFields, key) &&
          typeof color === 'string' && colorPattern.test(color),
      )
    })
  },
  encode(value) {
    // IndexedDB cannot clone Vue proxies. Copy only the persisted fields into plain records.
    return value.map((template) => {
      const style: DrawingTemplate['style'] = {}
      for (const key of colorKeys) {
        const color = template.style[key]
        if (color !== undefined) style[key] = color
      }
      return { name: template.name, style }
    })
  },
}

function persistence(kind: DrawingKind) {
  return createIndexedDbPersistence({
    databaseName: '@363045841yyt/klinechart-drawing-templates',
    storeName: 'templates',
    key: kind,
    codec,
    flushOnPageHide: false,
  })
}

export async function loadDrawingTemplates(kind: DrawingKind): Promise<DrawingTemplate[]> {
  return (await persistence(kind).load()) ?? []
}

export async function saveDrawingTemplates(kind: DrawingKind, templates: DrawingTemplate[]): Promise<boolean> {
  return persistence(kind).save(templates)
}
