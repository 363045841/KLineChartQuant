/** 开发预览不内嵌 TypeScript 依赖映射，避免巨大的 base64 字符串在每个 VM 重复驻留。 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'

/** 只接管已优化 TypeScript 模块；项目源码与其它依赖仍使用 Vite 的正常调试映射。 */
export function compilerDependencyPlugin(repoRoot: string): Plugin {
  const allowedRoot = normalizePath(path.resolve(repoRoot)) + '/'
  return {
    name: 'klinechart:compiler-dependency-source',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0]
        if (request.method !== 'GET' || !url?.startsWith('/@fs/')) return next()
        let file: string
        try {
          file = normalizePath(path.resolve(decodeURIComponent(url.slice('/@fs/'.length))))
        } catch {
          return next()
        }
        if (
          !file.startsWith(allowedRoot) ||
          !file.endsWith('/node_modules/.vite/deps/typescript.js')
        )
          return next()
        void readFile(file, 'utf8').then((source) => {
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/javascript')
          response.setHeader('Cache-Control', 'no-cache')
          // 只删除独占一行的映射注释；编译器内部的模板字符串也包含同样文本。
          response.end(source.replace(/^[\t ]*\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n|$)/gm, ''))
        }, next)
      })
    },
  }
}
