/**
 * HTTP 只读接口：健康、规则与触发记录。
 *
 * 先只读；写入与实时推送后续接入，不改变现有路由形状。
 */
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { Alert, AlertFire } from '@363045841yyt/klinechart-core/node'

/** 接口依赖：由组合根提供当前快照。 */
export interface HttpHandlers {
  health(): unknown
  alerts(): readonly Alert[]
  fires(): readonly AlertFire[]
}

/** 统一写回 JSON；编码失败直接抛出，由调用方转成 500。 */
function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

/**
 * 启动只读 HTTP 服务。
 *
 * @param handlers - 三份只读快照
 * @returns 未监听的 Server，由调用方 listen/close
 */
export function createHttpServer(handlers: HttpHandlers): Server {
  return createServer((request, response) => {
    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'method-not-allowed' })
      return
    }
    try {
      switch (request.url) {
        case '/health':
          writeJson(response, 200, handlers.health())
          return
        case '/alerts':
          writeJson(response, 200, handlers.alerts())
          return
        case '/fires':
          writeJson(response, 200, handlers.fires())
          return
        default:
          writeJson(response, 404, { error: 'not-found' })
      }
    } catch (error) {
      writeJson(response, 500, {
        error: 'internal',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
