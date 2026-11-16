#!/usr/bin/env node
/**
 * 技能同步：把仓库 `.opencode/skills` 下的技能复制到个人技能目录 `~/.dsh/skills`。
 *
 * 用法：
 *   node scripts/sync-skill.mjs                 同步全部技能
 *   node scripts/sync-skill.mjs option-structure 只同步指定技能
 *   node scripts/sync-skill.mjs --check         只比对，不写；有差异时退出码 1
 *
 * 语义是「镜像」：个人目录里多出来的文件会被删掉，避免两份内容悄悄漂移。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'

/** 仓库内的技能源目录。 */
const SOURCE_ROOT = resolve(import.meta.dirname, '..', '.opencode', 'skills')

/** 个人技能目录。 */
const TARGET_ROOT = join(homedir(), '.dsh', 'skills')

/**
 * 列出目录下的全部文件（相对路径，按字典序）。
 *
 * @param root 目录
 * @returns 相对路径列表
 */
function listFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(relative(root, absolute))
    }
  }
  walk(root)
  return files.sort()
}

/**
 * 比对源目录与目标目录的文件差异。
 *
 * @param name 技能名
 * @returns 差异描述列表（空数组表示一致）
 */
function diffSkill(name) {
  const source = join(SOURCE_ROOT, name)
  const target = join(TARGET_ROOT, name)
  if (!existsSync(target)) return [`${name}: 个人目录里没有这个技能`]
  const sourceFiles = listFiles(source)
  const targetFiles = listFiles(target)
  const problems = []
  for (const file of sourceFiles) {
    const targetPath = join(target, file)
    if (!existsSync(targetPath)) {
      problems.push(`${name}/${file}: 缺失`)
      continue
    }
    if (!readFileSync(join(source, file)).equals(readFileSync(targetPath))) {
      problems.push(`${name}/${file}: 内容不同`)
    }
  }
  for (const file of targetFiles) {
    if (!sourceFiles.includes(file)) problems.push(`${name}/${file}: 个人目录里多出这个文件`)
  }
  return problems
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const requested = args.filter((arg) => arg !== '--check')
const available = readdirSync(SOURCE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && statSync(join(SOURCE_ROOT, entry.name)).isDirectory())
  .map((entry) => entry.name)
  .sort()

const names = requested.length === 0 ? available : requested
const unknown = names.filter((name) => !available.includes(name))
if (unknown.length > 0) {
  console.error(`未知技能：${unknown.join(', ')}；可用：${available.join(', ')}`)
  process.exit(2)
}

if (checkOnly) {
  const problems = names.flatMap((name) => diffSkill(name))
  if (problems.length === 0) {
    console.log(`技能一致：${names.join(', ')}`)
    process.exit(0)
  }
  console.error(`技能与仓库不一致（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('修复：node scripts/sync-skill.mjs')
  process.exit(1)
}

for (const name of names) {
  const target = join(TARGET_ROOT, name)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(join(SOURCE_ROOT, name), target, { recursive: true })
  console.log(`已同步 ${name} → ${target}`)
}
