import { createDocumentStore, createMemoryDocumentStore, type DocumentStore } from '../../../foundation/persistence/index.js'
import type { AlertService } from '../types.js'
import { ALERT_DOCUMENT_VERSION, type AlertFiresDocument, type AlertRulesDocument, decodeFires, decodeRules } from './alertCodec.js'

const activeServices = new Set<AlertService>()

function store<T>(name: 'rules' | 'fires', decode: (value: unknown) => T): DocumentStore<T> {
  if (typeof indexedDB === 'undefined') return createMemoryDocumentStore<T>(null)
  return createDocumentStore({
    databaseName: `@363045841yyt/klinechart-alert-${name}`,
    version: ALERT_DOCUMENT_VERSION,
    storeName: name,
    key: name,
    codec: { decode, encode: (value) => value },
  })
}

export function createAlertStores(): {
  rules: DocumentStore<AlertRulesDocument>
  fires: DocumentStore<AlertFiresDocument>
} {
  return { rules: store('rules', decodeRules), fires: store('fires', decodeFires) }
}

export function trackAlertService(service: AlertService): () => void {
  activeServices.add(service)
  return () => activeServices.delete(service)
}

/** 检查已恢复和已持久化的规则，包括停用规则。 */
export async function hasAlertScriptReference(definitionId: string): Promise<boolean> {
  if (activeServices.size > 0) {
    return [...activeServices].some((service) =>
      service.alerts.peek().some((alert) => alert.script.definitionId === definitionId),
    )
  }
  const rules = store('rules', decodeRules)
  try {
    return (await rules.read())?.alerts.some((alert) => alert.script.definitionId === definitionId) ?? false
  } finally {
    await rules.dispose()
  }
}
