/** 从现有契约生成编辑器类型资源，发布消费者不需要扫描 workspace 源码。 */
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeGeneratedFile } from './lib/generated-file.mjs'

const packageRoot = new URL('../', import.meta.url)
const scriptPrefix = '/node_modules/@363045841yyt/klinechart-script/'
const plotPrefix = '/node_modules/@363045841yyt/klinechart-plot-contracts/'
const outputFile = fileURLToPath(new URL('src/editor/resources.ts', packageRoot))

/**
 * 收集编辑器与 Markdown 文档共用的契约源码、标准库与全局入口，不写入生成物。
 * @returns files、libraries 为虚拟文件内容，entry 为全局声明路径
 */
export async function collectEditorResources() {
  const files = {}
  const libraries = {}
  const require = createRequire(import.meta.url)
  const libraryDirectory = path.dirname(require.resolve('typescript'))

  /** 仅嵌入 ES2022 及其引用的标准库，执行器与编辑器均无需文件系统或 CDN。 */
  async function collectLibrary(name) {
    const key = `/${name}`
    if (key in libraries) return
    const source = await readFile(path.join(libraryDirectory, name), 'utf8')
    libraries[key] = source
    for (const match of source.matchAll(/<reference lib="([^"]+)"/g)) {
      await collectLibrary(`lib.${match[1]}.d.ts`)
    }
  }
  await collectLibrary('lib.es2022.d.ts')

  /** 收集一层契约源码，文件身份与包内相对导入保持一致。 */
  async function collect(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      files[prefix + entry.name] = await readFile(new URL(entry.name, directory), 'utf8')
    }
  }

  for (const directory of ['contracts', 'Library', 'series', 'request']) {
    await collect(new URL(`src/${directory}/`, packageRoot), `${scriptPrefix}${directory}/`)
  }
  for (const file of ['quickjs/types.ts', 'editor/types.ts', 'quickjs/runtime/plotKind.ts']) {
    files[scriptPrefix + file] = await readFile(new URL(`src/${file}`, packageRoot), 'utf8')
  }
  const entry = `${scriptPrefix}editor/globals.d.ts`
  files[entry] = await readFile(new URL('src/editor/globals.d.ts.txt', packageRoot), 'utf8')
  await collect(new URL('../plot-contracts/src/', packageRoot), plotPrefix)

  return { files, libraries, entry }
}

/** 从同一份源码快照写出编辑器契约与标准库；check 模式只校验。 */
export async function generateEditorResources({ check = false } = {}) {
  const { files, libraries, entry } = await collectEditorResources()
  const librariesChanged = writeGeneratedFile(
    fileURLToPath(new URL('src/language/standardLibraries.ts', packageRoot)),
    `/** 自动生成的 ES2022 标准库，供编译器和编辑器共用；禁止手工编辑。 */\n` +
      `// biome-ignore-all format: 标准库由生成器统一序列化\n` +
      `export const scriptStandardLibraryFiles: Readonly<Record<string, string>> = ${JSON.stringify(libraries, null, 2)}\n`,
    { check },
  )
  return {
    changed:
      writeGeneratedFile(
        outputFile,
        `/** 自动生成的脚本类型资源；修改契约后运行 Script build，禁止手工编辑。 */\n` +
          `// biome-ignore-all format: 类型资源由生成器统一序列化\n` +
          `export const scriptEditorTypeEntry = ${JSON.stringify(entry)}\n` +
          `export const scriptEditorTypeFiles: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)}\n`,
        { check },
      ) || librariesChanged,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateEditorResources({ check: process.argv.includes('--check') })
}
