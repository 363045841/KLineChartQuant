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

/** 静态求值失败的哨兵；只在生成器内部流转。 */
const UNRESOLVED = Symbol('unresolved')

/** 剥离不影响取值的类型断言与括号。 */
function unwrapExpression(node) {
  let current = node
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/** 返回标识符或属性访问所指声明的初始值表达式；导入别名逐级解开。 */
function declarationInitializer(checker, node) {
  const symbol = resolveSymbol(checker, checker.getSymbolAtLocation(node))
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  if (!declaration) return undefined
  if (ts.isVariableDeclaration(declaration)) return declaration.initializer
  if (ts.isPropertyAssignment(declaration) || ts.isEnumMember(declaration)) {
    return declaration.initializer
  }
  if (ts.isShorthandPropertyAssignment(declaration)) {
    return declarationInitializer(checker, declaration.name)
  }
  return undefined
}

/** 把表达式解析为对象字面量；Object.freeze 包装与常量引用都会被展开。 */
function resolveObjectLiteral(checker, node, depth = 0) {
  if (!node || depth > 16) return undefined
  const expression = unwrapExpression(node)
  if (ts.isObjectLiteralExpression(expression)) return expression
  if (
    ts.isCallExpression(expression) &&
    expression.expression.getText() === 'Object.freeze' &&
    expression.arguments.length === 1
  ) {
    return resolveObjectLiteral(checker, expression.arguments[0], depth + 1)
  }
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    return resolveObjectLiteral(checker, declarationInitializer(checker, expression), depth + 1)
  }
  return undefined
}

/** 在对象字面量中按运行时语义查找属性（后写覆盖先写，展开源递归查找）。 */
function findPropertyExpression(checker, node, name, depth = 0) {
  const object = resolveObjectLiteral(checker, node, depth)
  if (!object) return undefined
  for (const property of [...object.properties].reverse()) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      return property.initializer
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name
    }
    if (ts.isSpreadAssignment(property)) {
      const nested = findPropertyExpression(checker, property.expression, name, depth + 1)
      if (nested) return nested
    }
  }
  return undefined
}

/** 字面量属性名；计算属性名不参与静态目录。 */
function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

/**
 * 编译期常量求值：只接受字面量、对象/数组字面量、常量引用与枚举成员，
 * 遇到函数、调用或运行时值返回 UNRESOLVED，从不执行源码。
 */
function evaluateStatic(checker, node, depth = 0) {
  if (!node || depth > 32) return UNRESOLVED
  const expression = unwrapExpression(node)
  if (ts.isStringLiteralLike(expression)) return expression.text
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.MinusToken ||
      expression.operator === ts.SyntaxKind.PlusToken)
  ) {
    const operand = evaluateStatic(checker, expression.operand, depth + 1)
    if (typeof operand !== 'number') return UNRESOLVED
    return expression.operator === ts.SyntaxKind.MinusToken ? -operand : operand
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const items = []
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = evaluateStatic(checker, element.expression, depth + 1)
        if (!Array.isArray(spread)) return UNRESOLVED
        items.push(...spread)
        continue
      }
      const value = evaluateStatic(checker, element, depth + 1)
      if (value === UNRESOLVED) return UNRESOLVED
      items.push(value)
    }
    return items
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const result = {}
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = evaluateStatic(checker, property.expression, depth + 1)
        if (spread === UNRESOLVED || typeof spread !== 'object' || Array.isArray(spread)) {
          return UNRESOLVED
        }
        Object.assign(result, spread)
        continue
      }
      const name =
        ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
          ? propertyName(property.name)
          : undefined
      if (name === undefined) return UNRESOLVED
      const value = evaluateStatic(
        checker,
        ts.isPropertyAssignment(property) ? property.initializer : property.name,
        depth + 1,
      )
      if (value === UNRESOLVED) return UNRESOLVED
      result[name] = value
    }
    return result
  }
  if (
    ts.isCallExpression(expression) &&
    expression.expression.getText() === 'Object.freeze' &&
    expression.arguments.length === 1
  ) {
    return evaluateStatic(checker, expression.arguments[0], depth + 1)
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const direct = declarationInitializer(checker, expression)
    if (direct) return evaluateStatic(checker, direct, depth + 1)
    const owner = findPropertyExpression(checker, expression.expression, expression.name.text)
    return owner ? evaluateStatic(checker, owner, depth + 1) : UNRESOLVED
  }
  if (ts.isIdentifier(expression)) {
    if (expression.text === 'undefined') return undefined
    const initializer = declarationInitializer(checker, expression)
    return initializer ? evaluateStatic(checker, initializer, depth + 1) : UNRESOLVED
  }
  return UNRESOLVED
}

/** 选择器、别名解析与 Agent 工具结构所需的静态目录字段。 */
const DESCRIPTOR_FIELDS = [
  ['aliases'],
  ['displayName'],
  ['category'],
  ['indicatorType'],
  ['indicatorTypeLabel'],
  ['defaultPaneId'],
  ['dataViews'],
  ['allowMainPane'],
  ['defaultParams', 'runtime', 'defaultParams'],
  ['defaultOptions', 'presentation', 'defaultOptions'],
]

/** 提取一个定义的静态目录；声明了却无法静态求值的字段直接阻止构建。 */
function extractDescriptor(checker, config, identity, fail) {
  const descriptor = { name: identity.name, kind: identity.kind }
  for (const [field, ...path] of DESCRIPTOR_FIELDS) {
    const segments = path.length > 0 ? path : [field]
    let expression = config
    for (const segment of segments) {
      expression = expression && findPropertyExpression(checker, expression, segment)
    }
    if (!expression) continue
    const value = evaluateStatic(checker, expression)
    if (value === UNRESOLVED) {
      fail(`@Indicator.${segments.join('.')} 必须是编译期常量，才能进入按需加载目录`)
    }
    if (value !== undefined) descriptor[field] = value
  }
  return descriptor
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
          const descriptor = extractDescriptor(checker, configArgument, { name, kind }, fail)
          definitions.push({ filename, exportName: exported.getName(), kind, name, descriptor })
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
    "import type {\n  IndicatorDefinitionClass,\n  IndicatorDescriptor,\n} from '../indicatorDefinitionRegistry.js'\n\n" +
    '/** 内置定义的静态目录与按需加载入口；目录字段在编译期提取，读取目录不会加载实现。 */\n' +
    'export const BUILTIN_INDICATOR_MANIFEST: ReadonlyArray<{\n' +
    '  readonly descriptor: IndicatorDescriptor\n' +
    '  readonly load: () => Promise<IndicatorDefinitionClass>\n' +
    '}> = [\n' +
    definitions
      .map(
        (definition) =>
          '  {\n' +
          `    descriptor: ${JSON.stringify(definition.descriptor)},\n` +
          `    load: () => import('${modulePath(outputDirectory, definition.filename)}').then((module) => module.${definition.exportName}),\n` +
          '  },\n',
      )
      .join('') +
    ']\n'
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
