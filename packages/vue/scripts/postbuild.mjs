// vue 包发布产物后处理：修正声明文件里的 .vue specifier，并生成 CJS 声明副本。
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'

/**
 * 递归重写声明文件中的 .vue 模块 specifier。
 * TypeScript 不认识 .vue 扩展名，会把 './X.vue' 当成未知后缀去查找 X.d.vue.ts；
 * 产物实际是 X.vue.d.ts，只有写成 './X.vue.js' 才能被解析。
 * @param dir 待处理的目录
 */
function rewriteVueSpecifiers(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      rewriteVueSpecifiers(path)
      continue
    }
    if (!entry.name.endsWith('.d.ts')) continue
    const source = readFileSync(path, 'utf8')
    const rewritten = source.replace(/(['"])(\.{1,2}\/[^'"]*\.vue)\1/g, '$1$2.js$1')
    if (rewritten !== source) writeFileSync(path, rewritten)
  }
}

// 为 exports.require 条件提供 CJS 声明副本，内容与 ESM 声明一致。
function copyCjsDeclaration() {
  const esm = join(DIST, 'index.d.ts')
  if (existsSync(esm)) copyFileSync(esm, join(DIST, 'index.d.cts'))
}

rewriteVueSpecifiers(DIST)
copyCjsDeclaration()
