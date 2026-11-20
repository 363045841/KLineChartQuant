/**
 * 从脚本编辑器契约生成按主题拆分的 API 参考。
 *
 * 与 hover 共用同一份 JSDoc：文档不维护第二份 API 清单，注释改了重新生成即可。
 * 输出按「作者写脚本时查什么」分章：运行环境、绘图、绘图对象、技术分析、枚举。
 */
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import ts from 'typescript'
import { collectEditorResources } from './generate-editor-resources.mjs'
import { generateScriptEnums } from './generate-script-enums.mjs'
import { writeGeneratedFile } from './lib/generated-file.mjs'

const outputDirectory = fileURLToPath(new URL('../../../docs/script/api/', import.meta.url))
const legacyOutputFile = fileURLToPath(new URL('../../../docs/script/api.md', import.meta.url))

/** 写法指南的相对路径；分片只负责查签名，规则与示例都在指南里。 */
const GUIDE_LINK = '../../../packages/script/docs/indicator.md'

/** 章节清单：文件、标题与一句话用途，索引页按同一顺序链接。 */
const CHAPTERS = [
  {
    file: 'runtime.md',
    title: '运行环境',
    summary: '行情序列、时间与时段、输入参数、跨周期取数与声明入口',
  },
  { file: 'plot.md', title: '绘图', summary: '把逐 bar 数值输出成折线、柱形或标记' },
  { file: 'drawing.md', title: '绘图对象', summary: '跨 bar 保留的线段、矩形、标签与坐标' },
  { file: 'ta.md', title: '技术分析', summary: '内置 ta 库的计算原语' },
  { file: 'enums.md', title: '枚举', summary: '颜色、线型、尺寸、周期与数据源的取值表' },
]

/** 数据类全局：以表格列出，避免把每根序列各写一节。 */
const DATA_GLOBALS = new Set([
  'open',
  'high',
  'low',
  'close',
  'volume',
  'time',
  'timeTradingDay',
  'barIndex',
])

/** 章节内的分组标题与顺序；组内先表格后小节。 */
const GROUPS = {
  runtime: ['行情与上下文', '时间与时段', '输入参数', '跨周期取数', '声明与工具'],
  plot: ['绘图方法', '填充与参考线', '值类型'],
  drawing: ['线段', '矩形', '标签', '坐标', '值类型'],
  ta: ['函数'],
  enums: ['取值'],
}

/** 值类型：只收录作者会直接读取或传递的类型，内部模型不再出现在文档里。 */
const VALUE_TYPES = {
  runtime: ['Series'],
  plot: ['PlotRef', 'HLineRef'],
  drawing: [
    'LineRef',
    'BoxRef',
    'LabelRef',
    'ChartPoint',
    'LineOptions',
    'LabelOptions',
    'BoxOptions',
  ],
}

/** 分组导语：表格本身无法表达的平台约定，固定写在这里，不随符号变化。 */
const GROUP_NOTES = {
  'runtime.md|行情与上下文':
    '序列按偏移取值：`close[0]` 当前根、`close[1]` 上一根；历史不足返回 `NaN`。' +
    '在数值运算、比较与数值参数位置可以省略 `[0]`。',
}

/** 将 TypeScript 文档分段还原为 Markdown，保留 JSDoc 中的链接。 */
function display(parts) {
  return ts.displayPartsToString(parts)
}

/** 建立只包含脚本可达声明的虚拟 TS 环境。 */
function createTypeProgram({ files, libraries, entry }) {
  const environment = createVirtualTypeScriptEnvironment(
    createSystem(new Map(Object.entries({ ...files, ...libraries }))),
    [entry],
    ts,
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
  )
  const program = environment.languageService.getProgram()
  if (!program) throw new Error('无法创建 Script API 类型程序')
  return {
    program,
    checker: program.getTypeChecker(),
    printer: ts.createPrinter({ removeComments: true }),
    format: ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  }
}

/** 语义锚点：由名字直接推导，Agent 可以稳定引用。 */
function anchorOf(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/** 把类型技巧还原成可读签名；`(string & {})` 只是编辑器提示用的写法。 */
function readable(text) {
  return text
    .replace(/ \| \(string & \{\}\)/g, ' | string')
    .replace(/\(string & \{\}\)/g, 'string')
    .replace(/\bScriptSeries\b/g, 'Series')
}

/** 单行化文档：Markdown 表格单元格里不能出现换行。 */
function oneLine(text) {
  return text.replace(/\s*\n+\s*/g, ' ').trim()
}

/** 取符号正文与参数标签；`@summary` 与标题重复，不再输出。 */
function documentation(checker, symbol) {
  const body = display(symbol.getDocumentationComment(checker))
  const blocks = body ? [body] : []
  const tags = symbol.getJsDocTags(checker)
  const returns = tags.find((tag) => tag.name === 'returns')
  if (returns) blocks.push(`**返回** ${oneLine(display(returns.text ?? []))}`)
  const params = tags.filter((tag) => tag.name === 'param')
  if (params.length > 0) {
    blocks.push(
      params
        .map((tag) => {
          const text = display(tag.text ?? [])
          const space = text.indexOf(' ')
          const name = space === -1 ? text : text.slice(0, space)
          const docs = space === -1 ? '' : text.slice(space + 1)
          return `- \`${name}\`${docs ? ` ${docs}` : ''}`
        })
        .join('\n'),
    )
  }
  return blocks.join('\n\n')
}

/** 表格用的简短短语：正文为空时回落到 `@summary`，这是成员唯一的说明来源。 */
function summaryText(checker, symbol) {
  const body = oneLine(display(symbol.getDocumentationComment(checker)))
  if (body) return body
  const summary = symbol.getJsDocTags(checker).find((tag) => tag.name === 'summary')
  return summary ? oneLine(display(summary.text ?? [])) : ''
}

/** 有成员且不可调用的类型按命名空间展开；纯数据与语言内置类型留在表格里。 */
function isNamespaceType(type, files) {
  if (type.getCallSignatures().length > 0) return false
  if (type.getNumberIndexType()) return false
  // boolean / string 这类原始类型在检查器里也能列出 wrapper 成员，必须按标志挡掉。
  if (type.flags & (ts.TypeFlags.BooleanLike | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))
    return false
  if (type.getProperties().length === 0) return false
  // 成员全部来自标准库的类型不是脚本契约，展开只会得到 valueOf / toString 之类噪声。
  const symbol = type.aliasSymbol ?? type.symbol
  const declaration = symbol?.declarations?.[0]
  return !declaration || declaration.getSourceFile().fileName in files
}

/** 按章节收集表格行、导语与小节，保证同一名字只出现一次。 */
function createDocBuilder({ checker, format }) {
  const chapters = new Map(CHAPTERS.map((chapter) => [chapter.file, new Map()]))
  const documented = new Set()

  /** 取或创建章节内的分组容器；章节键统一为文件名。 */
  function bucket(file, group) {
    const key = file.endsWith('.md') ? file : `${file}.md`
    const groups = chapters.get(key)
    if (!groups) throw new Error(`未知章节：${key}`)
    if (!groups.has(group)) groups.set(group, { rows: [], notes: [], sections: [] })
    return groups.get(group)
  }

  /** 追加一条表格行。 */
  function row(file, group, cells) {
    bucket(file, group).rows.push(cells)
  }

  /** 追加段落说明；命名空间自身的一句话介绍放在成员之前。 */
  function note(file, group, text) {
    if (text) bucket(file, group).notes.push(text)
  }

  /** 追加一个小节；同名符号只保留第一次，overload 合并进同一签名块。 */
  function section(file, group, name, signature, symbol, extra = '') {
    if (documented.has(name)) return
    documented.add(name)
    bucket(file, group).sections.push({ name, signature, symbol, extra })
  }

  /**
   * 渲染对象参数的可选项表。
   *
   * 直接读声明上的参数节点：函数类型的参数符号没有可用的声明位置，
   * 只有 `checker.getTypeAtLocation(参数节点)` 能拿到真正的选项类型。
   * 只展开可选参数与 `*Options` 类型；必填的 Series、数量已在签名里。
   */
  function optionFields(symbol) {
    const fields = new Map()
    for (const declaration of symbol.declarations ?? []) {
      if (!ts.isFunctionLike(declaration)) continue
      for (const paramNode of declaration.parameters) {
        const declared = checker.getTypeAtLocation(paramNode)
        // 可选参数的类型是 `X | undefined`，联合上的属性是交集，必须先摘掉空值。
        const type =
          declared.isUnion() === true
            ? (declared.types.find(
                (item) => (item.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0,
              ) ?? declared)
            : declared
        if (type.getNumberIndexType()) continue
        // 原始类型也会列出 wrapper 成员，必须按标志挡掉，否则会得到 toString 之类的表格。
        if (
          type.flags &
          (ts.TypeFlags.BooleanLike | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike)
        )
          continue
        const typeName = type.aliasSymbol?.getName() ?? type.symbol?.getName() ?? ''
        const optional = Boolean(paramNode.questionToken || paramNode.initializer)
        if (!optional && !typeName.endsWith('Options')) continue
        const properties = type.getProperties()
        if (properties.length === 0 || properties.length > 40) continue
        for (const property of properties) {
          if (fields.has(property.getName())) continue
          const node = property.valueDeclaration ?? property.declarations?.[0]
          if (!node) continue
          const memberType = checker.getTypeAtLocation(node)
          const optionalMark = property.flags & ts.SymbolFlags.Optional ? '?' : ''
          fields.set(property.getName(), {
            name: `${property.getName()}${optionalMark}`,
            type: readable(checker.typeToString(memberType, node, format)).replace(
              / \| undefined$/,
              '',
            ),
            doc: oneLine(display(property.getDocumentationComment(checker))),
          })
        }
      }
    }
    if (fields.size === 0) return ''
    const rows = [...fields.values()].map(
      (field) => `| \`${field.name}\` | ${cellType(field.type)} | ${cellDoc(field.doc)} |`,
    )
    return ['| 选项 | 类型 | 说明 |', '| --- | --- | --- |', ...rows].join('\n')
  }

  return { chapters, row, note, section, optionFields }
}

/** 表格单元格里的类型：用行内代码，避免竖线与下划线被 Markdown 误解析。 */
function cellType(text) {
  return text ? `\`${text.replace(/\|/g, '\\|')}\`` : '—'
}

/** 表格单元格里的说明：转义竖线，空说明用破折号。 */
function cellDoc(text) {
  return text ? text.replace(/\|/g, '\\|') : '—'
}

/** 解析签名：调用签名优先，其次输出类型文本。 */
function describeSymbol(checker, format, symbol, name, declaration) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
  const signatures = type.getCallSignatures()
  const signature = signatures.length
    ? signatures
        .map((item) => readable(`${name}${checker.signatureToString(item, declaration, format)}`))
        .join('\n')
    : readable(`${name}: ${checker.typeToString(type, declaration, format)}`)
  return { signature, signatures, type }
}

/** 章节归属：按名字决定，避免同一符号在两页重复。 */
function chapterOf(name) {
  if (name === 'fill' || name === 'hline' || name === 'plot' || name.startsWith('plot.'))
    return 'plot'
  if (name.startsWith('ta.')) return 'ta'
  if (/^(line|box|label|chart)\./.test(name)) return 'drawing'
  return 'runtime'
}

/** 章节内分组：运行环境按语义域，绘图对象按对象种类。 */
function groupOf(name) {
  if (DATA_GLOBALS.has(name)) return '行情与上下文'
  if (name === 'timeframe' || name.startsWith('timeframe.')) return '时间与时段'
  if (name === 'session' || name.startsWith('session.')) return '时间与时段'
  if (name === 'barstate' || name.startsWith('barstate.')) return '时间与时段'
  if (name === 'syminfo' || name.startsWith('syminfo.')) return '时间与时段'
  if (name === 'input' || name.startsWith('input.')) return '输入参数'
  if (name === 'request' || name.startsWith('request.')) return '跨周期取数'
  if (name === 'fill' || name === 'hline') return '填充与参考线'
  if (name === 'plot' || name.startsWith('plot.')) return '绘图方法'
  if (name.startsWith('line.')) return '线段'
  if (name.startsWith('box.')) return '矩形'
  if (name.startsWith('label.')) return '标签'
  if (name.startsWith('chart.')) return '坐标'
  if (name.startsWith('ta.')) return '函数'
  return '声明与工具'
}

/** 遍历命名空间：可调用成员写成小节，其余成员进入字段表。 */
function renderNamespace(context, symbol, name, file, group, ancestors) {
  const { checker, format } = context
  const { section, row, note, optionFields } = context.builder
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
  if (!declaration) return
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
  if (ancestors.has(type)) return
  const next = new Set([...ancestors, type])

  const own = display(symbol.getDocumentationComment(checker)).trim()
  if (own) note(file, group, `**${name}** ${own}`)

  for (const member of type.getProperties()) {
    const memberName = `${name}.${member.getName()}`
    const memberDeclaration = member.valueDeclaration ?? member.declarations?.[0]
    if (!memberDeclaration) continue
    // 成员按自己的名字归属章节：`ta.*`、`plot.*`、`line.*` 各自成章，不跟随命名空间。
    const memberChapter = chapterOf(memberName)
    const memberGroup = groupOf(memberName)
    const memberType = checker.getTypeAtLocation(memberDeclaration)
    const callSignatures = memberType.getCallSignatures()
    if (callSignatures.length > 0) {
      const { signature } = describeSymbol(checker, format, member, memberName, memberDeclaration)
      section(memberChapter, memberGroup, memberName, signature, member, optionFields(member))
      continue
    }
    if (isNamespaceType(memberType, context.files)) {
      renderNamespace(context, member, memberName, memberChapter, memberGroup, next)
      continue
    }
    row(memberChapter, memberGroup, [
      `\`${memberName}\``,
      cellType(readable(checker.typeToString(memberType, memberDeclaration, format))),
      cellDoc(summaryText(checker, member)),
    ])
  }
}

/** 枚举：一个枚举一节，成员压成取值表。 */
function renderEnum(context, declaration, file) {
  const { checker } = context
  const { section } = context.builder
  const name = declaration.name.text
  const symbol = checker.getSymbolAtLocation(declaration.name)
  if (!symbol) return
  const rows = []
  for (const member of declaration.members) {
    const memberSymbol = checker.getSymbolAtLocation(member.name)
    rows.push(
      `| \`${name}.${member.name.text}\` | ${cellType(JSON.stringify(checker.getConstantValue(member)))} | ` +
        `${cellDoc(memberSymbol ? summaryText(checker, memberSymbol) : '')} |`,
    )
  }
  const table = ['| 成员 | 值 | 说明 |', '| --- | --- | --- |', ...rows].join('\n')
  section(file, '取值', name, `enum ${name}`, symbol, table)
}

/** 入口的值类型只是导入桥接，解析到真正声明它的契约文件。 */
function resolveValueDeclaration(checker, declaration) {
  if (!ts.isTypeAliasDeclaration(declaration) || !ts.isTypeReferenceNode(declaration.type)) {
    return declaration
  }
  let symbol = checker.getSymbolAtLocation(declaration.type.typeName)
  if (!symbol) return declaration
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  const target = symbol.declarations?.find(
    (node) => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
  )
  return target && target !== declaration ? target : declaration
}

/** 值类型：打印声明并压掉空行，注释直接来自契约。 */
function renderValueType(context, declaration, file, group) {
  const { checker, printer } = context
  const { section } = context.builder
  const resolved = resolveValueDeclaration(checker, declaration)
  const symbol = checker.getSymbolAtLocation(resolved.name)
  if (!symbol) return
  const code = printer.printNode(ts.EmitHint.Unspecified, resolved, resolved.getSourceFile())
  const signature = code
    .replace(/^export /gm, '')
    .replace(/\(string & \{\}\)/g, 'string')
    .replace(/\n{2,}/g, '\n')
    .trimEnd()
  section(file, group, resolved.name.text, signature, symbol)
}

/** 用显式锚点渲染单节；锚点由名字推导，标题保留可读名字。 */
function renderSections(sections, checker) {
  // 同一组选项会在多个绘图方法上重复出现，第二次起只给指向首个方法的链接。
  const seenTables = new Map()
  return sections
    .map((item) => {
      const blocks = [
        `<a id="${anchorOf(item.name)}"></a>`,
        `### ${item.name}`,
        ['```ts', item.signature, '```'].join('\n'),
      ]
      const docs = documentation(checker, item.symbol)
      if (docs) blocks.push(docs)
      if (item.extra) {
        if (item.extra.startsWith('| 选项')) {
          const first = seenTables.get(item.extra)
          if (first) blocks.push(`选项与 [${first}](#${anchorOf(first)}) 相同。`)
          else {
            seenTables.set(item.extra, item.name)
            blocks.push(item.extra)
          }
        } else {
          blocks.push(item.extra)
        }
      }
      return blocks.join('\n\n')
    })
    .join('\n\n')
}

/** 渲染章节文件：固定表头 + 分组标题 + 表格与小节。 */
function renderChapter(chapter, groups, context) {
  const key = chapter.file.slice(0, -3)
  const blocks = [
    '<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->',
    `# Script API · ${chapter.title}`,
    '> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，' +
      `\`pnpm docs:script:check\` 校验同步。写法与规则见[指标脚本](${GUIDE_LINK})。`,
  ]
  for (const group of GROUPS[key] ?? []) {
    const bucket = groups.get(group)
    if (!bucket) continue
    const empty = bucket.rows.length === 0 && bucket.sections.length === 0
    if (empty && bucket.notes.length === 0) continue
    blocks.push(`## ${group}`)
    const groupNote = GROUP_NOTES[`${chapter.file}|${group}`]
    if (groupNote) blocks.push(groupNote)
    if (bucket.notes.length > 0) blocks.push([...new Set(bucket.notes)].join('\n\n'))
    if (bucket.rows.length > 0) {
      const header =
        key === 'enums'
          ? ['| 成员 | 值 | 说明 |', '| --- | --- | --- |']
          : ['| 名称 | 类型 | 说明 |', '| --- | --- | --- |']
      blocks.push([...header, ...bucket.rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n'))
    }
    if (bucket.sections.length > 0) {
      blocks.push(renderSections(bucket.sections, context.checker))
    }
  }
  return `${blocks.join('\n\n')}\n`
}

/** 索引页：分片链接、读法与常量约定。 */
function renderIndex() {
  return [
    '<!-- 此文件由 pnpm docs:script:generate 生成，请勿手工编辑。 -->',
    '# Script API',
    `本目录按主题拆分。写脚本先读[指标脚本](${GUIDE_LINK})（骨架、规则、错误与示例），`,
    '查具体签名与取值再翻下面各页。',
    '## 分片',
    ...CHAPTERS.map((chapter) => `- [${chapter.title}](./${chapter.file})：${chapter.summary}`),
    '## 约定',
    '- 签名里的 `?` 表示可省略；`|` 表示联合类型，按其中一种传。',
    '- 标注 `Series` 的位置既接受序列（`close`、`ta.sma(...)`），也接受数值；数值运算会自动取当前值。',
    '- 返回 `Series` 的结果可继续索引：`[0]` 当前值、`[1]` 上一根；历史不足为 `NaN`。',
    '- 句柄（`PlotRef`、`LineRef` 等）只在一次运行内有效，不能跨运行保存。',
    '- 所有脚本必须在 `defineIndicator` 中声明 `scriptVersion: 2`，旧写法注册时直接拒绝。',
  ].join('\n\n')
}

/** 生成全部章节文件；返回文件名到内容的映射。 */
export function renderScriptApi({ files, libraries, entry }) {
  const { program, checker, printer, format } = createTypeProgram({ files, libraries, entry })
  const builder = createDocBuilder({ checker, format })
  const context = { checker, printer, format, builder, files }

  const globals = program.getSourceFile(entry)
  if (!globals) throw new Error('缺少 Script 全局声明')

  // 枚举来自生成的全局声明文件：一个枚举一张表，成员不再各自成节。
  const enumNames = new Set()
  const enumDeclarations = []
  for (const file of program.getSourceFiles()) {
    if (!file.fileName.endsWith('/quickjs/runtime/plotKind.ts')) continue
    for (const statement of file.statements) {
      if (!ts.isEnumDeclaration(statement)) continue
      enumNames.add(statement.name.text)
      enumDeclarations.push(statement)
    }
  }
  for (const declaration of enumDeclarations) renderEnum(context, declaration, 'enums.md')

  // 全局声明里的类型别名与接口：按白名单收进对应章节的值类型。
  const valueTypes = new Map()
  const declarationsByName = new Map()
  const globalStatements = []
  for (const statement of globals.statements) {
    if (!ts.isModuleDeclaration(statement) || !statement.body || !ts.isModuleBlock(statement.body))
      continue
    globalStatements.push(...statement.body.statements)
  }
  for (const statement of globalStatements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      valueTypes.set(statement.name.text, statement)
    }
  }
  // 选项与快照类型没有入口别名，需要从契约文件里按名字找。
  for (const file of program.getSourceFiles()) {
    if (!(file.fileName in files)) continue
    for (const statement of file.statements) {
      if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue
      if (!declarationsByName.has(statement.name.text))
        declarationsByName.set(statement.name.text, statement)
    }
  }

  for (const statement of globalStatements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const name = declaration.name.text
        if (enumNames.has(name)) continue
        const symbol = checker.getSymbolAtLocation(declaration.name)
        if (!symbol) continue
        const file = chapterOf(name)
        const group = groupOf(name)
        const type = checker.getTypeAtLocation(declaration)
        // `typeof Position` 这类注入枚举也走取值表，不按命名空间展开成员。
        const enumSymbol = type.symbol
        if (enumSymbol && (enumSymbol.flags & ts.SymbolFlags.Enum) !== 0) {
          const enumDeclaration = enumSymbol.declarations?.find((node) =>
            ts.isEnumDeclaration(node),
          )
          if (enumDeclaration) renderEnum(context, enumDeclaration, 'enums.md')
          continue
        }
        const callSignatures = type.getCallSignatures()
        if (callSignatures.length > 0) {
          const { signature } = describeSymbol(checker, format, symbol, name, declaration)
          builder.section(file, group, name, signature, symbol, builder.optionFields(symbol))
          continue
        }
        if (isNamespaceType(type, files) && !DATA_GLOBALS.has(name)) {
          renderNamespace(context, symbol, name, file, group, new Set())
          continue
        }
        builder.row(file, group, [
          `\`${name}\``,
          cellType(readable(checker.typeToString(type, declaration, format))),
          cellDoc(summaryText(checker, symbol)),
        ])
      }
      continue
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text
      const symbol = checker.getSymbolAtLocation(statement.name)
      if (!symbol) continue
      const { signature } = describeSymbol(checker, format, symbol, name, statement)
      builder.section(
        chapterOf(name),
        groupOf(name),
        name,
        signature,
        symbol,
        builder.optionFields(symbol),
      )
    }
  }

  // 值类型跟随所属章节，顺序即白名单顺序。
  for (const [file, names] of Object.entries(VALUE_TYPES)) {
    for (const name of names) {
      const declaration = valueTypes.get(name) ?? declarationsByName.get(name)
      if (declaration) renderValueType(context, declaration, `${file}.md`, '值类型')
    }
  }

  const output = new Map()
  output.set('index.md', renderIndex())
  for (const chapter of CHAPTERS) {
    output.set(chapter.file, renderChapter(chapter, builder.chapters.get(chapter.file), context))
  }
  return output
}

/** 生成全部分片并删除旧单文件；check 模式只校验。 */
export async function generateScriptApiDocs({ check = false } = {}) {
  await generateScriptEnums({ check })
  const resources = await collectEditorResources()
  const files = renderScriptApi(resources)
  let changed = false
  for (const [file, content] of files) {
    if (writeGeneratedFile(path.join(outputDirectory, file), content, { check })) changed = true
  }
  // 旧的单文件参考已拆分，残留会让读者拿到过期内容。
  if (existsSync(legacyOutputFile)) {
    if (check) throw new Error(`生成物已过期：${legacyOutputFile}，请运行生成器更新`)
    rmSync(legacyOutputFile)
    changed = true
  }
  return { changed }
}

/** 只在直接执行时运行；被测试导入时不写盘。 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateScriptApiDocs({ check: process.argv.includes('--check') })
}
