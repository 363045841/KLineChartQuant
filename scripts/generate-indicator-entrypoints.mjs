/** 扫描 @Indicator 的 TypeScript 符号，生成生产和开发共用的内置定义装配入口。 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const CORE_SOURCE_ROOT = fileURLToPath(new URL('../packages/core/src', import.meta.url))
const GENERATED_DIRECTORY = 'engine/indicators/generated'

/** 收集生产源码；测试和生成文件不参与内置定义发现。 */
function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return ['__tests__', '__fixtures__', 'generated', 'node_modules'].includes(entry.name)
          ? []
          : collectSourceFiles(filename)
      }
      return /\.tsx?$/.test(entry.name) && !/\.(?:d|test|spec)\.tsx?$/.test(entry.name)
        ? [filename]
        : []
    })
    .sort()
}

/** 解开导入或再导出别名，按实际声明识别注解，避免同名函数误匹配。 */
function resolveSymbol(checker, symbol) {
  return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

/** 读取元数据属性的编译期字符串值；不执行源码中的任何业务代码。 */
function literalProperty(checker, config, name) {
  if (ts.isObjectLiteralExpression(config)) {
    const assignment = config.properties.find(
      (property) => ts.isPropertyAssignment(property) && property.name.getText() === name,
    )
    if (assignment && ts.isStringLiteralLike(assignment.initializer))
      return assignment.initializer.text
  }
  const property = checker.getTypeAtLocation(config).getProperty(name)
  if (!property) return undefined
  const type = checker.getTypeOfSymbolAtLocation(property, config)
  return type.isStringLiteral() ? type.value : undefined
}

/** 从生产源码发现导出的定义类；无法确定身份或导出的声明直接阻止构建。 */
export function discoverIndicatorDefinitions(sourceRoot = CORE_SOURCE_ROOT) {
  const files = collectSourceFiles(sourceRoot)
  const configFile = ts.findConfigFile(sourceRoot, ts.sys.fileExists, 'tsconfig.build.json')
  const config = configFile ? ts.readConfigFile(configFile, ts.sys.readFile) : { config: {} }
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    configFile ? path.dirname(configFile) : sourceRoot,
  )
  const program = ts.createProgram(files, { ...parsed.options, noEmit: true })
  const checker = program.getTypeChecker()
  const registryFile = path.resolve(sourceRoot, 'engine/indicators/indicatorDefinitionRegistry.ts')
  const definitions = []
  const names = new Set()

  for (const filename of files) {
    const source = program.getSourceFile(filename)
    if (!source) throw new Error(`无法读取生产源码：${filename}`)
    const moduleSymbol = checker.getSymbolAtLocation(source)
    const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []

    /** 遍历类声明，按注解实际符号发现定义。 */
    function visit(node) {
      if (ts.isClassDeclaration(node)) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const call = decorator.expression
          if (!ts.isCallExpression(call)) continue
          const symbol = resolveSymbol(checker, checker.getSymbolAtLocation(call.expression))
          const isIndicator =
            symbol?.getName() === 'Indicator' &&
            symbol.declarations?.some(
              (declaration) => path.resolve(declaration.getSourceFile().fileName) === registryFile,
            )
          if (!isIndicator) continue
          const fail = (message) => {
            throw new Error(`${filename}: ${message}`)
          }
          if (!node.name) fail('@Indicator 定义必须是具名导出类')
          const classSymbol = checker.getSymbolAtLocation(node.name)
          const exported = exports.find((item) => resolveSymbol(checker, item) === classSymbol)
          if (!exported) fail(`@Indicator 类 ${node.name.text} 必须导出，才能生成装配入口`)
          const configArgument = call.arguments[0]
          if (!configArgument) fail('@Indicator 必须声明配置')
          const kind = literalProperty(checker, configArgument, 'kind')
          const name = literalProperty(checker, configArgument, 'name')
          if (!['system', 'indicator'].includes(kind))
            fail('@Indicator.kind 必须是编译期确定的 system 或 indicator')
          if (!name) fail('@Indicator.name 必须是非空编译期字符串')
          const normalized = name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
          if (!normalized || names.has(normalized)) fail(`@Indicator.name 为空或重复：${name}`)
          names.add(normalized)
          definitions.push({ filename, exportName: exported.getName(), kind, name })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  if (definitions.length === 0) throw new Error('未发现任何 @Indicator 定义，拒绝生成空装配入口')
  return definitions
}

/** 生成稳定的 ESM 相对路径，保持 Windows 与 Linux 的构建输出一致。 */
function modulePath(outputDirectory, filename) {
  const relative = path
    .relative(outputDirectory, filename)
    .split(path.sep)
    .join('/')
    .replace(/\.tsx?$/, '.js')
  return relative.startsWith('.') ? relative : `./${relative}`
}

/** 从扫描结果生成强引用入口；只有内容变化时写入，避免无意义的 HMR。 */
export function generateIndicatorEntrypoints(
  sourceRoot = CORE_SOURCE_ROOT,
  { check = false } = {},
) {
  const definitions = discoverIndicatorDefinitions(sourceRoot)
  const outputDirectory = path.join(sourceRoot, GENERATED_DIRECTORY)
  const header = '/** 自动扫描 @Indicator 生成；请修改定义类，不要手动编辑。 */\n'
  const indicatorSource =
    header +
    "import type { IndicatorDefinitionClass } from '../indicatorDefinitionRegistry.js'\n\n" +
    '/** 加载所有注解定义，kind 仅用于元数据分类；引用类导出以保留生产构建依赖。 */\n' +
    'export function loadBuiltinDefinitionClasses(): Promise<IndicatorDefinitionClass[]> {\n' +
    '  return Promise.all([\n' +
    definitions
      .map(
        (definition) =>
          `    import('${modulePath(outputDirectory, definition.filename)}').then((module) => module.${definition.exportName}),\n`,
      )
      .join('') +
    '  ])\n}\n'
  let changed = false
  for (const [basename, content] of [['builtinIndicators.ts', indicatorSource]]) {
    const filename = path.join(outputDirectory, basename)
    const previous = existsSync(filename) ? readFileSync(filename, 'utf8') : undefined
    if (previous === content) continue
    if (check) throw new Error(`自动装配入口已过期：${filename}；运行 pnpm indicators:generate`)
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(filename, content, 'utf8')
    changed = true
  }
  return { definitions, changed }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { definitions } = generateIndicatorEntrypoints(CORE_SOURCE_ROOT, {
    check: process.argv.includes('--check'),
  })
  process.stdout.write(`已自动发现 ${definitions.length} 个 @Indicator 定义\n`)
}
