/** Node 和 Worker 共用入口守卫，禁止解析图表和浏览器适配器。 */
import { registerHooks } from 'node:module'

const browserEntry = /\/(?:engine\/(?:chart|frame|renderers)\/|foundation\/persistence\/impl\/indexedDb|features\/alerts\/impl\/alertPersistence|scripts\/impl\/scriptPersistence|[^/]+\.worker\.js$)/
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context)
    if (browserEntry.test(resolved.url)) throw new Error(`Browser module in Node: ${resolved.url} from ${context.parentURL}`)
    return resolved
  },
})
