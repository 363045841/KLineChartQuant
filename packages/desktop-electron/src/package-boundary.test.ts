/** 宿主只能经包名（exports）导入其他工作区包，不得用相对路径进入它们的源码（ADR 0008）。 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIRS = ['src', 'electron']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.vue'])
// 覆盖 import / export from、动态 import() 与 side-effect import。
const RELATIVE_SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSources(path)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

describe('desktop package boundary', () => {
  it('keeps every relative import inside packages/desktop-electron', () => {
    const escapes: string[] = []
    for (const dir of SOURCE_DIRS) {
      for (const file of listSources(join(packageRoot, dir))) {
        for (const [, specifier] of readFileSync(file, 'utf8').matchAll(RELATIVE_SPECIFIER)) {
          const target = relative(packageRoot, resolve(dirname(file), specifier ?? ''))
          if (target.startsWith('..'))
            escapes.push(`${relative(packageRoot, file)} -> ${specifier}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })
})
