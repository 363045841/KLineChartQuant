/** 从现有契约生成编辑器类型资源，发布消费者不需要扫描 workspace 源码。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'

const packageRoot = new URL('../', import.meta.url)
const scriptPrefix = '/node_modules/@363045841yyt/klinechart-script/'
const plotPrefix = '/node_modules/@363045841yyt/klinechart-plot-contracts/'
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
for (const file of ['quickjs/types.ts', 'editor/types.ts']) {
  files[scriptPrefix + file] = await readFile(new URL(`src/${file}`, packageRoot), 'utf8')
}
const entry = `${scriptPrefix}editor/globals.d.ts`
files[entry] = await readFile(new URL('src/editor/globals.d.ts.txt', packageRoot), 'utf8')
await collect(new URL('../plot-contracts/src/', packageRoot), plotPrefix)
await writeFile(
  new URL('src/editor/resources.ts', packageRoot),
  `/** 自动生成的脚本类型资源；修改契约后运行 Script build，禁止手工编辑。 */\n` +
    `// biome-ignore-all format: 类型资源由生成器统一序列化\n` +
    `export const scriptEditorTypeEntry = ${JSON.stringify(entry)}\n` +
    `export const scriptEditorTypeFiles: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)}\n`,
)
