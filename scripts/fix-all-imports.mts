#!/usr/bin/env tsx
/**
 * Fix ALL import/export specifiers using ts-morph's AST.
 * Handles: import declarations, export declarations, and import() type expressions.
 */
import { Project, SyntaxKind } from 'ts-morph'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CORE_SRC = path.join(ROOT, 'packages/core/src')

// ── Build old→new mapping ──────────────────────────────────────────────────

const MOVE_RULES: Array<{ type: 'dir' | 'file'; from: string; to: string }> = [
  { type: 'dir', from: 'reactivity', to: 'foundation/reactivity' },
  { type: 'dir', from: 'types', to: 'foundation/types' },
  { type: 'dir', from: 'tokens', to: 'foundation/tokens' },
  { type: 'dir', from: 'config', to: 'foundation/config' },
  { type: 'dir', from: 'plugin', to: 'foundation/plugin' },
  { type: 'dir', from: 'utils', to: 'foundation/utils' },
  { type: 'dir', from: 'state', to: 'engine/state' },
  { type: 'dir', from: 'render', to: 'rendering/render' },
  { type: 'dir', from: 'renderer-tier', to: 'rendering/renderer-tier' },
  { type: 'dir', from: 'scheduler', to: 'rendering/scheduler' },
  { type: 'dir', from: 'scene', to: 'rendering/scene' },
  { type: 'dir', from: 'data-fetchers', to: 'data' },
  { type: 'dir', from: 'alerts', to: 'features/alerts' },
  { type: 'dir', from: 'chartTypes', to: 'features/chartTypes' },
  { type: 'dir', from: 'indicators', to: 'features/indicators' },
  { type: 'dir', from: 'replay', to: 'features/replay' },
  { type: 'dir', from: 'input', to: 'features/input' },
  { type: 'dir', from: 'semantic', to: 'features/semantic' },
  { type: 'dir', from: 'mcp', to: 'features/mcp' },
  { type: 'file', from: 'engine/draw/pixelAlign.ts', to: 'foundation/utils/pixelAlign.ts' },
  { type: 'file', from: 'engine/theme/fonts.ts', to: 'foundation/tokens/fonts.ts' },
]

// Build both old→new and new→old mappings from the CURRENT filesystem
const oldToNew = new Map<string, string>()
const allOldPaths = new Set<string>()

function buildMapping() {
  const destToSource = new Map<string, string>()
  for (const r of MOVE_RULES) {
    if (r.type === 'dir') destToSource.set(r.to, r.from)
  }
  const fileDest = new Map<string, string>()
  for (const r of MOVE_RULES) {
    if (r.type === 'file') fileDest.set(r.to, r.from)
  }

  function walk(dirRel: string) {
    const absDir = path.join(CORE_SRC, dirRel)
    if (!fs.existsSync(absDir)) return
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(childRel)
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        // Check file-level rules first
        const fileRule = fileDest.get(childRel)
        if (fileRule) {
          oldToNew.set(fileRule, childRel)
          allOldPaths.add(fileRule)
          allOldPaths.add(childRel)
          continue
        }
        // Check directory-level rules
        // For files in 'features/alerts/index.ts', find the matching rule
        let found = false
        for (const [dest, source] of destToSource) {
          if (childRel.startsWith(dest + '/')) {
            const oldPath = source + childRel.slice(dest.length)
            oldToNew.set(oldPath, childRel)
            allOldPaths.add(oldPath)
            allOldPaths.add(childRel)
            found = true
            break
          }
          // Exact match for the directory's index file
          if (childRel === dest) {
            const oldPath = source
            oldToNew.set(oldPath, childRel)
            allOldPaths.add(oldPath)
            allOldPaths.add(childRel)
            found = true
            break
          }
        }
        if (!found) {
          // File stayed — old path = new path
          oldToNew.set(childRel, childRel)
          allOldPaths.add(childRel)
        }
      }
    }
  }
  walk('')
}

// ── Virtual path resolver ──────────────────────────────────────────────────

const EXTENSIONS = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.d.ts']

function resolveOldPath(fileRel: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const absFile = path.join(CORE_SRC, fileRel)
  const absDir = path.dirname(absFile)
  const base = path.resolve(absDir, specifier)
  const baseRel = path.relative(CORE_SRC, base).replace(/\\/g, '/')
  for (const ext of EXTENSIONS) {
    if (allOldPaths.has(baseRel + ext)) return baseRel + ext
  }
  return null
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('📋 Building path mapping…')
  buildMapping()
  const moved = [...oldToNew.entries()].filter(([a, b]) => a !== b)
  console.log(`   ${oldToNew.size} total paths, ${moved.length} moved`)

  // Use ts-morph to find ALL string literal nodes that look like import specifiers
  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'packages/core/tsconfig.json'),
  })

  let totalFixes = 0
  let changedFiles = 0

  // Build reverse mapping: new → old
  const newToOld = new Map<string, string>()
  for (const [oldP, newP] of oldToNew) {
    newToOld.set(newP, oldP)
  }

  for (const sourceFile of project.getSourceFiles()) {
    const fileRel = path.relative(CORE_SRC, sourceFile.getFilePath()).replace(/\\/g, '/')
    if (!fileRel.endsWith('.ts')) continue

    const oldFileRel = newToOld.get(fileRel) ?? fileRel // fallback to current if not mapped

    // Collect all string literals that look like relative module specifiers
    const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral)
      .filter(n => {
        const text = n.getLiteralText()
        return text.startsWith('./') || text.startsWith('../')
      })
    
    if (stringLiterals.length === 0) continue

    let fileChanged = false

    for (const node of stringLiterals) {
      const specifier = node.getLiteralText()
      
      // Step 1: Resolve specifier relative to the OLD file location
      const oldAbsFile = path.join(CORE_SRC, oldFileRel)
      const oldAbsDir = path.dirname(oldAbsFile)
      const oldAbsolute = path.resolve(oldAbsDir, specifier)
      const oldAbsoluteRel = path.relative(CORE_SRC, oldAbsolute).replace(/\\/g, '/')
      
      // Step 2: Try extensions to find the actual old path
      let resolvedOldPath: string | null = null
      for (const ext of EXTENSIONS) {
        const candidate = oldAbsoluteRel + ext
        if (allOldPaths.has(candidate)) {
          resolvedOldPath = candidate
          break
        }
      }
      if (!resolvedOldPath) continue

      // Step 3: Look up the new location of the target
      const newResolved = oldToNew.get(resolvedOldPath)
      if (!newResolved) continue

      // Step 4: Compute new relative path from CURRENT file location
      const thisDir = path.dirname(sourceFile.getFilePath())
      const newAbs = path.join(CORE_SRC, newResolved)
      let newSpec = path.relative(thisDir, newAbs).replace(/\\/g, '/')
      if (!newSpec.startsWith('.')) newSpec = './' + newSpec
      for (const ext of ['.ts', '.tsx', '.d.ts']) {
        if (newSpec.endsWith(ext)) newSpec = newSpec.slice(0, -ext.length)
      }
      if (newSpec.endsWith('/index')) newSpec = newSpec.slice(0, -6)

      // Update the string literal
      if (specifier !== newSpec) {
        node.replaceWithText(`'${newSpec}'`)
        fileChanged = true
        totalFixes++
      }
    }

    if (fileChanged) {
      sourceFile.saveSync()
      changedFiles++
      process.stdout.write('.')
      if (changedFiles % 40 === 0) process.stdout.write(` ${changedFiles}\n`)
    }
  }
  if (changedFiles > 0 && changedFiles % 40 !== 0) process.stdout.write(` ${changedFiles}\n`)

  console.log(`\n✅ Fixed ${totalFixes} imports across ${changedFiles} files`)
}

main()
