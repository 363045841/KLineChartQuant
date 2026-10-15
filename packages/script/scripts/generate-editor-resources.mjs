/** 从现有契约生成编辑器类型资源，发布消费者不需要扫描 workspace 源码。 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeGeneratedFile } from './lib/generated-file.mjs'

const packageRoot = new URL('../', import.meta.url)
const scriptPrefix = '/node_modules/@363045841yyt/klinechart-script/'
const plotPrefix = '/node_modules/@363045841yyt/klinechart-plot-contracts/'
const outputFile = fileURLToPath(new URL('src/editor/resources.ts', packageRoot))

/**
 * 生成编辑器类型资源；契约变更后由调用方重新执行以刷新编辑器声明。
 * @param options check 为 true 时只校验生成物是否为最新
 * @returns changed 表示本次是否写盘
 */
export async function generateEditorResources({ check = false } = {}) {
  const files = {}

  /** 收集一层契约源码，文件身份与包内相对导入保持一致。 */
  async function collect(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      files[prefix + entry.name] = await readFile(new URL(entry.name, directory), 'utf8')
    }
  }

  for (const directory of ['contracts', 'Library', 'series']) {
    await collect(new URL(`src/${directory}/`, packageRoot), `${scriptPrefix}${directory}/`)
  }
  for (const file of ['quickjs/types.ts', 'editor/types.ts', 'quickjs/runtime/plotKind.ts']) {
    files[scriptPrefix + file] = await readFile(new URL(`src/${file}`, packageRoot), 'utf8')
  }
  const entry = `${scriptPrefix}editor/globals.d.ts`
  files[entry] = await readFile(new URL('src/editor/globals.d.ts.txt', packageRoot), 'utf8')
  await collect(new URL('../plot-contracts/src/', packageRoot), plotPrefix)

  return {
    changed: writeGeneratedFile(
      outputFile,
      `/** 自动生成的脚本类型资源；修改契约后运行 Script build，禁止手工编辑。 */\n` +
        `// biome-ignore-all format: 类型资源由生成器统一序列化\n` +
        `export const scriptEditorTypeEntry = ${JSON.stringify(entry)}\n` +
        `export const scriptEditorTypeFiles: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)}\n`,
      { check },
    ),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateEditorResources({ check: process.argv.includes('--check') })
}
