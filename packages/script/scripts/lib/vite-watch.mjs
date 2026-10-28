/** 开发期 Vite 插件的监听与错误回传约定：多个生成插件共用同一套重载语义。 */

/** watcher 需要响应的事件；新增、修改与删除都会改变生成物。 */
const WATCH_EVENTS = ['add', 'change', 'unlink']

/**
 * 登记文件监听，并在服务器关闭时解除，避免测试环境重复注册。
 * @param server Vite 开发服务器
 * @param handler 文件变更处理函数
 */
export function watchFiles(server, handler) {
  for (const event of WATCH_EVENTS) server.watcher.on(event, handler)
  server.httpServer?.once('close', () => {
    for (const event of WATCH_EVENTS) server.watcher.off(event, handler)
  })
}

/**
 * 重新生成成功且确有写入时整页重载；失败时写日志并推给浏览器。
 * @param server Vite 开发服务器
 * @param regenerate 返回是否需要重载的生成函数
 */
export async function reloadAfter(server, regenerate) {
  try {
    if (await regenerate()) server.ws.send({ type: 'full-reload' })
  } catch (error) {
    server.config.logger.error(String(error))
    server.ws.send({ type: 'error', err: { message: String(error), stack: '' } })
  }
}
