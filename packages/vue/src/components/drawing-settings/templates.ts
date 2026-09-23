import { createIndexedDbPersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'

type DrawingKind = DrawingObject['kind']

export type DrawingTemplate = {
  name: string
  style: Partial<Pick<DrawingStyle, 'fill' | 'stroke'>>
}

const colorPattern = /^#[0-9a-fA-F]{6}$/

const codec: PersistenceCodec<DrawingTemplate[]> = {
  decode(value) {
    if (!Array.isArray(value)) return null
    return value.filter((item): item is DrawingTemplate => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      if (typeof record.name !== 'string' || !record.name.trim()) return false
      if (!record.style || typeof record.style !== 'object') return false
      const style = record.style as Record<string, unknown>
      return (
        (style.fill === undefined || (typeof style.fill === 'string' && colorPattern.test(style.fill))) &&
        (style.stroke === undefined || (typeof style.stroke === 'string' && colorPattern.test(style.stroke))) &&
        (style.fill !== undefined || style.stroke !== undefined)
      )
    })
  },
  encode(value) {
    // IndexedDB cannot clone Vue proxies. Copy only the persisted fields into plain records.
    return value.map((template) => ({
      name: template.name,
      style: {
        ...(template.style.fill !== undefined ? { fill: template.style.fill } : {}),
        ...(template.style.stroke !== undefined ? { stroke: template.style.stroke } : {}),
      },
    }))
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
