/** 产品声明与许可证收口：内部包声明改为包内相对引用，CSS 提供唯一公开入口。 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const productRoot = fileURLToPath(new URL('..', import.meta.url))
const packagesRoot = path.resolve(productRoot, '..')
const dist = path.join(productRoot, 'dist')
const packages = readdirSync(packagesRoot).flatMap((directory) => {
  const file = path.join(packagesRoot, directory, 'package.json')
  if (!existsSync(file)) return []
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  return manifest.private && manifest.name.startsWith('@363045841yyt/klinechart') &&
    ['agent-runtime', 'core', 'plot-contracts', 'script', 'script-chart', 'script-editor', 'script-server'].includes(directory)
    ? [{ directory, manifest }]
    : []
})

/** 枚举文件，所有调用者使用同一套跨平台路径处理。 */
function filesAt(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? filesAt(full) : [full]
  })
}

/** 将 exports 的类型入口解析成内部声明文件，通配入口与精确入口使用相同规则。 */
function declarationTarget(manifest, subpath) {
  const key = subpath ? `.${subpath}` : '.'
  let entry = manifest.exports[key]
  if (!entry) {
    const wildcard = Object.keys(manifest.exports).find((candidate) => candidate.includes('*') && key.startsWith(candidate.split('*')[0]))
    if (wildcard) {
      const value = manifest.exports[wildcard]
      const target = typeof value === 'string' ? value : value.types
      return target.replace('*', key.slice(wildcard.indexOf('*')))
    }
  }
  if (typeof entry === 'string') return entry.replace(/\.js$/, '.d.ts')
  if (entry?.types) return entry.types
  if (entry?.import?.types) return entry.import.types
  throw new Error(`Missing declaration export: ${manifest.name}${subpath}`)
}

for (const { directory } of packages) {
  const source = path.join(packagesRoot, directory, 'dist')
  if (!existsSync(source)) continue
  for (const file of filesAt(source).filter((item) => item.endsWith('.d.ts'))) {
    const target = path.join(dist, 'internal', directory, path.relative(source, file))
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(file, target)
  }
}

for (const file of filesAt(dist).filter((item) => item.endsWith('.d.ts'))) {
  let rewritten = readFileSync(file, 'utf8')
  const edits = []
  /** 只改真正的模块引用，避免改动内置脚本源码等字符串常量。 */
  function visit(node) {
    const parent = node.parent
    if (ts.isStringLiteral(node) && parent && (
      ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) ||
      (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))
    )) {
      const specifier = node.text
      let replacement = specifier.endsWith('.vue') ? `${specifier}.js` : specifier
      const pkg = packages.find(({ manifest }) => specifier === manifest.name || specifier.startsWith(`${manifest.name}/`))
      if (pkg) {
        const subpath = specifier.slice(pkg.manifest.name.length)
        const target = declarationTarget(pkg.manifest, subpath).replace(/^\.\/dist\//, '')
        let relative = path.relative(path.dirname(file), path.join(dist, 'internal', pkg.directory, target)).split(path.sep).join('/')
        if (!relative.startsWith('.')) relative = `./${relative}`
        replacement = relative.replace(/\.d\.ts$/, '.js')
      }
      if (replacement !== specifier) edits.push({ start: node.getStart() + 1, end: node.end - 1, replacement })
    }
    ts.forEachChild(node, visit)
  }
  // parent 链只用于识别语法位置，不依赖类型检查或宿主文件系统。
  const withParents = ts.createSourceFile(file, rewritten, ts.ScriptTarget.Latest, true)
  ts.forEachChild(withParents, visit)
  for (const edit of edits.reverse()) rewritten = rewritten.slice(0, edit.start) + edit.replacement + rewritten.slice(edit.end)
  writeFileSync(file, rewritten)
}

const declarations = new Set()
const externalTypes = new Set()
/** 只保留公开声明实际引用的闭包，避免把内部测试和 VM 源码字符串带给用户。 */
function retainDeclaration(file) {
  if (declarations.has(file)) return
  if (!existsSync(file)) throw new Error(`Missing product declaration: ${file}`)
  declarations.add(file)
  const syntax = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
  const dependencies = ts.preProcessFile(syntax.text, true, true).importedFiles
  for (const dependency of dependencies) {
    const specifier = dependency.fileName
    if (!specifier.startsWith('.')) {
      externalTypes.add(specifier)
      continue
    }
    if (specifier.endsWith('.css')) continue
    const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.d.ts'))
    const candidates = [target, `${target}.d.ts`, path.join(target, 'index.d.ts')]
    const resolved = candidates.find((candidate) => existsSync(candidate) && candidate.endsWith('.d.ts'))
    if (!resolved) throw new Error(`Unresolved product type: ${file} -> ${specifier}`)
    retainDeclaration(resolved)
  }
}
retainDeclaration(path.join(dist, 'index.d.ts'))
retainDeclaration(path.join(dist, 'agent.d.ts'))
for (const file of filesAt(dist)) {
  if ((file.endsWith('.d.ts') && !declarations.has(file)) || file.endsWith('.d.ts.map')) rmSync(file)
}
console.log(`Public declaration dependencies: ${[...externalTypes].sort().join(', ')}`)
const manifest = JSON.parse(readFileSync(path.join(productRoot, 'package.json'), 'utf8'))
for (const specifier of externalTypes) {
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
  if (!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]) throw new Error(`Undeclared public type dependency: ${name}`)
}

// 库模式默认内联字体。改为真实资源文件，使浏览器按所用字形与字重下载。
for (const file of filesAt(dist).filter((item) => item.endsWith('.css') && path.dirname(item) === dist)) {
  const css = readFileSync(file, 'utf8').replace(/data:(font\/(?:woff2?|ttf|otf));base64,([A-Za-z0-9+/=]+)/g, (_match, mime, encoded) => {
    const bytes = Buffer.from(encoded, 'base64')
    const extension = mime.slice(mime.indexOf('/') + 1)
    const name = `assets/fonts/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`
    const target = path.join(dist, name)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    return `./${name}`
  })
  writeFileSync(file, css)
}
const styles = filesAt(dist).filter((file) => file.endsWith('.css') && path.dirname(file) === dist && !['index.css', 'workbench.css'].includes(path.basename(file)))
const entryStyle = path.join(dist, 'index.css')
if (existsSync(entryStyle) && !readFileSync(entryStyle, 'utf8').startsWith('/* product stylesheet */')) {
  cpSync(entryStyle, path.join(dist, 'workbench.css'))
}
const imports = [path.join(dist, 'workbench.css'), ...styles]
writeFileSync(entryStyle, '/* product stylesheet */\n' + imports.map((file) => `@import "./${path.relative(dist, file).split(path.sep).join('/')}";`).join('\n') + '\n')

const notices = ['# KLineChart Vue product notices', '', 'This complete product includes AGPL-3.0-or-later script modules. Individual Apache-2.0 modules retain their original licenses.', '']
for (const { directory, manifest } of packages) {
  notices.push(`## ${manifest.name}`, `License: ${manifest.license}`, '')
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) {
    const source = path.join(packagesRoot, directory, name)
    if (!existsSync(source)) continue
    const target = path.join(dist, 'licenses', directory, name)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target)
  }
  if (manifest.license === 'Apache-2.0' && !existsSync(path.join(packagesRoot, directory, 'LICENSE'))) {
    const target = path.join(dist, 'licenses', directory, 'LICENSE')
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(path.resolve(packagesRoot, '../LICENSE'), target)
  }
}
mkdirSync(path.join(dist, 'licenses/fonts'), { recursive: true })
cpSync(path.join(productRoot, 'src/assets/fonts/HarmonyOS-Sans-LICENSE.txt'), path.join(dist, 'licenses/fonts/HarmonyOS-Sans-LICENSE.txt'))
cpSync(path.join(packagesRoot, 'script', 'LICENSE'), path.join(productRoot, 'LICENSE'))
writeFileSync(path.join(productRoot, 'THIRD-PARTY-NOTICES.md'), notices.join('\n'))
