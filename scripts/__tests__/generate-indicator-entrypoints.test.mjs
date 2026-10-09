/** 验证注解自动发现、文件增删、失败诊断和真实生产构建的目录完整性。 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build, createServer } from 'vite'
import babel from 'vite-plugin-babel'
import {
  CORE_SOURCE_ROOT,
  discoverIndicatorDefinitions,
  generateIndicatorEntrypoints,
} from '../generate-indicator-entrypoints.mjs'
import { indicatorEntrypointsPlugin } from '../indicator-entrypoints-plugin.mjs'

/** 创建仅用于语法扫描的临时源码目录，不执行夹具中的业务代码。 */
function createSourceFixture(context) {
  const root = mkdtempSync(path.join(tmpdir(), 'kmap-indicator-scan-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const registry = path.join(root, 'engine/indicators/indicatorDefinitionRegistry.ts')
  mkdirSync(path.dirname(registry), { recursive: true })
  writeFileSync(
    registry,
    'export function Indicator(config: { name: string; kind: string }) { return (value: unknown) => value }\n',
  )
  /** 写入带命名导出的注解声明，路径可位于任意生产源码目录。 */
  function writeDefinition(
    basename,
    { name = basename, kind = 'indicator', exportClass = true } = {},
  ) {
    const filename = path.join(root, `${basename}.ts`)
    writeFileSync(
      filename,
      `import { Indicator as Define } from './engine/indicators/indicatorDefinitionRegistry.js'\n@Define({ name: '${name}', kind: '${kind}' })\n${exportClass ? 'export ' : ''}class Definition {}\n`,
    )
    return filename
  }
  return { root, writeDefinition }
}

test('automatically discovers aliases and additions, and removes deleted definitions', (context) => {
  const { root, writeDefinition } = createSourceFixture(context)
  writeDefinition('first', { kind: 'system' })
  const first = generateIndicatorEntrypoints(root)
  assert.equal(first.definitions.length, 1)
  assert.equal(first.changed, true)
  assert.equal(generateIndicatorEntrypoints(root).changed, false)
  const added = writeDefinition('second')
  assert.throws(() => generateIndicatorEntrypoints(root, { check: true }), /已过期/)
  const second = generateIndicatorEntrypoints(root)
  assert.equal(second.definitions.length, 2)
  const lazyEntry = path.join(root, 'engine/indicators/generated/builtinIndicators.ts')
  assert.match(readFileSync(lazyEntry, 'utf8'), /second\.js/)
  rmSync(added)
  assert.equal(generateIndicatorEntrypoints(root).definitions.length, 1)
  assert.doesNotMatch(readFileSync(lazyEntry, 'utf8'), /second\.js/)
})

test('ignores comments, test definitions and unrelated decorators with the same name', (context) => {
  const { root, writeDefinition } = createSourceFixture(context)
  writeDefinition('production')
  writeDefinition('ignored.test')
  writeFileSync(
    path.join(root, 'unrelated.ts'),
    `function Indicator(value: unknown) { return (target: unknown) => target }\n// @Indicator({ name: 'comment', kind: 'system' })\n@Indicator({ name: 'foreign', kind: 'system' })\nexport class Foreign {}\n`,
  )
  assert.deepEqual(
    discoverIndicatorDefinitions(root).map((definition) => definition.name),
    ['production'],
  )
})

test('resolves namespace imports, barrel exports and compile-time kind constants', (context) => {
  const { root } = createSourceFixture(context)
  writeFileSync(
    path.join(root, 'barrel.ts'),
    "export { Indicator } from './engine/indicators/indicatorDefinitionRegistry.js'\n",
  )
  writeFileSync(
    path.join(root, 'definition.ts'),
    `import * as annotations from './barrel.js'\nconst kind = 'system' as const\n@annotations.Indicator({ name: 'namespace', kind })\nclass Definition {}\nexport { Definition as ExportedDefinition }\n`,
  )
  const [definition] = discoverIndicatorDefinitions(root)
  assert.equal(definition.exportName, 'ExportedDefinition')
  assert.equal(definition.kind, 'system')
})

test('fails on duplicate names and definitions that cannot be assembled', (context) => {
  const { root, writeDefinition } = createSourceFixture(context)
  writeDefinition('first', { name: 'same-name' })
  const duplicate = writeDefinition('second', { name: 'SAME_NAME' })
  assert.throws(() => generateIndicatorEntrypoints(root), /重复/)
  rmSync(duplicate)
  const privateClass = writeDefinition('privateClass', { exportClass: false })
  assert.throws(() => generateIndicatorEntrypoints(root), /必须导出/)
  rmSync(privateClass)
  writeDefinition('invalidKind', { kind: 'unknown' })
  assert.throws(() => generateIndicatorEntrypoints(root), /kind 必须/)
})

/** 等待真实 Vite 文件事件，超时直接失败，不依赖固定延迟。 */
function waitForFileEvent(watcher, event, filename) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.off(event, listener)
      reject(new Error(`未收到 ${event} 事件：${filename}`))
    }, 10_000)
    /** 只响应本用例修改的文件，忽略生成输出触发的事件。 */
    function listener(changed) {
      if (path.resolve(changed) !== path.resolve(filename)) return
      clearTimeout(timeout)
      watcher.off(event, listener)
      resolve()
    }
    watcher.on(event, listener)
  })
}

test('the real development watcher discovers additions and removes deleted definitions', async (context) => {
  const { root, writeDefinition } = createSourceFixture(context)
  writeDefinition('first', { kind: 'system' })
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    plugins: [indicatorEntrypointsPlugin(root)],
    server: { middlewareMode: true },
  })
  try {
    const output = path.join(root, 'engine/indicators/generated/builtinIndicators.ts')
    const added = path.join(root, 'newDefinition.ts')
    const addition = waitForFileEvent(server.watcher, 'add', added)
    writeDefinition('newDefinition')
    await addition
    assert.match(readFileSync(output, 'utf8'), /newDefinition\.js/)
    const deletion = waitForFileEvent(server.watcher, 'unlink', added)
    rmSync(added)
    await deletion
    assert.doesNotMatch(readFileSync(output, 'utf8'), /newDefinition\.js/)
  } finally {
    await server.close()
  }
})

for (const target of ['src', 'dist']) {
  test(`production tree-shaking retains every real annotated definition from ${target}`, async (context) => {
    const output = mkdtempSync(path.join(tmpdir(), 'kmap-indicator-bundle-'))
    context.after(() => rmSync(output, { recursive: true, force: true }))
    const expected = discoverIndicatorDefinitions()
      .map((definition) => definition.name)
      .sort()
    const entry = path.join(output, 'entry.mjs')
    const directory = path.resolve(CORE_SOURCE_ROOT, '..', target, 'engine/indicators')
    const extension = target === 'src' ? 'ts' : 'js'
    writeFileSync(
      entry,
      `export { loadBuiltinIndicators } from '${pathToFileURL(path.join(directory, `registerBuiltins.${extension}`)).href}'\n` +
        `export { getRegisteredIndicatorDefinitions } from '${pathToFileURL(path.join(directory, `indicatorDefinitionRegistry.${extension}`)).href}'\n`,
    )
    await build({
      configFile: false,
      logLevel: 'error',
      plugins: [
        indicatorEntrypointsPlugin(),
        babel({
          include: [/\/src\/.*\.tsx?$/],
          exclude: [/node_modules/],
          babelConfig: {
            babelrc: false,
            configFile: false,
            plugins: [
              ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
              ['@babel/plugin-transform-typescript'],
            ],
          },
        }),
      ],
      resolve: { alias: [{ find: /^@\//, replacement: `${CORE_SOURCE_ROOT}/` }] },
      build: {
        target: 'esnext',
        outDir: output,
        minify: true,
        lib: {
          entry,
          formats: ['es'],
          fileName: () => 'definitions.mjs',
        },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    })
    const bundled = await import(pathToFileURL(path.join(output, 'definitions.mjs')).href)
    await bundled.loadBuiltinIndicators()
    const definitions = bundled.getRegisteredIndicatorDefinitions()
    assert.deepEqual(definitions.map((definition) => definition.name).sort(), expected)
    for (const definition of definitions)
      assert.equal(typeof definition.rendererFactory, 'function', definition.name)
    const lastPrice = definitions.find((definition) => definition.name === 'lastPriceLine')
    assert.equal(lastPrice.rendererFactory().id, 'plugin:lastPriceLine')
    const label = definitions.find((definition) => definition.name === 'lastPriceLabelRegistrar')
    assert.equal(label.rendererFactory().id, 'plugin:lastPriceLabelRegistrar')
  })
}
