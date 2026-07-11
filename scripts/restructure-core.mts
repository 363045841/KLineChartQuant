#!/usr/bin/env tsx
/**
 * Restructure packages/core/src — 24 flat groups → 8 logical layers.
 *
 * Usage:  tsx scripts/restructure-core.mts
 *
 * Phases:
 *   1. Build file mapping from move rules
 *   2. Use ts-morph to rewrite all import paths in OLD files → point to NEW locations
 *   3. Copy files to NEW locations
 *   4. Delete OLD files
 *   5. Update src/index.ts barrel export
 */

import { Project } from 'ts-morph'
import fs from 'node:fs'
import path from 'node:path'

// ── Config ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, '..')
const CORE_SRC = 'packages/core/src'

interface DirRule {
  type: 'dir'
  /** Directory relative to CORE_SRC, e.g. "reactivity" */
  from: string
  /** New directory relative to CORE_SRC, e.g. "foundation/reactivity" */
  to: string
}
interface FileRule {
  type: 'file'
  /** Specific file relative to CORE_SRC, e.g. "engine/draw/pixelAlign.ts" */
  from: string
  /** New path relative to CORE_SRC */
  to: string
}

type MoveRule = DirRule | FileRule

const MOVE_RULES: MoveRule[] = [
  // ── Foundation (zero / low dependency primitives) ──
  { type: 'dir', from: 'reactivity', to: 'foundation/reactivity' },
  { type: 'dir', from: 'types', to: 'foundation/types' },
  { type: 'dir', from: 'tokens', to: 'foundation/tokens' },
  { type: 'dir', from: 'config', to: 'foundation/config' },
  { type: 'dir', from: 'plugin', to: 'foundation/plugin' },
  { type: 'dir', from: 'utils', to: 'foundation/utils' },

  // ── Engine (absorb state) ──
  { type: 'dir', from: 'state', to: 'engine/state' },

  // ── Rendering pipeline ──
  { type: 'dir', from: 'render', to: 'rendering/render' },
  { type: 'dir', from: 'renderer-tier', to: 'rendering/renderer-tier' },
  { type: 'dir', from: 'scheduler', to: 'rendering/scheduler' },
  { type: 'dir', from: 'scene', to: 'rendering/scene' },

  // ── Data ──
  { type: 'dir', from: 'data-fetchers', to: 'data' },

  // ── Business features ──
  { type: 'dir', from: 'alerts', to: 'features/alerts' },
  { type: 'dir', from: 'chartTypes', to: 'features/chartTypes' },
  { type: 'dir', from: 'indicators', to: 'features/indicators' },
  { type: 'dir', from: 'replay', to: 'features/replay' },
  { type: 'dir', from: 'input', to: 'features/input' },
  { type: 'dir', from: 'semantic', to: 'features/semantic' },
  { type: 'dir', from: 'mcp', to: 'features/mcp' },

  // ── File-level moves (extract from engine into foundation) ──
  {
    type: 'file',
    from: 'engine/draw/pixelAlign.ts',
    to: 'foundation/utils/pixelAlign.ts',
  },
  {
    type: 'file',
    from: 'engine/theme/fonts.ts',
    to: 'foundation/tokens/fonts.ts',
  },
]

// Directories that are NOT moved (stay in place)
const STAY_DIRS = new Set([
  'engine',
  'components',
  'controllers',
  'scale',
  '__tests__',
  '__bench__',
])

// Directories that are moved as a whole (for quick lookup)
const DIR_MOVE_FROM = new Map<string, string>()
for (const r of MOVE_RULES) {
  if (r.type === 'dir') DIR_MOVE_FROM.set(r.from, r.to)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

function srcRel(absPath: string): string {
  return normalize(path.relative(path.join(ROOT, CORE_SRC), absPath))
}

/** Collect all files recursively, returning paths relative to CORE_SRC */
function collectAllFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        files.push(srcRel(full))
      }
    }
  }
  walk(path.join(ROOT, CORE_SRC))
  return files
}

/** Build old→new path mapping */
function buildMapping(allFiles: string[]): Map<string, string> {
  const mapping = new Map<string, string>()

  for (const file of allFiles) {
    // Check file-level rules FIRST (overrides stay-dir protection)
    let isFileMovedByRule = false
    for (const r of MOVE_RULES) {
      if (r.type === 'file' && r.from === file) {
        mapping.set(file, r.to)
        isFileMovedByRule = true
        break
      }
    }
    if (isFileMovedByRule) continue

    // Skip files that stay in place
    if (file.startsWith('engine/')) continue
    if (STAY_DIRS.has(file.split('/')[0]!)) continue

    // Check if it's in a moved directory
    const topDir = file.split('/')[0]!
    const newTop = DIR_MOVE_FROM.get(topDir)
    if (newTop) {
      const rest = file.slice(topDir.length)
      mapping.set(file, `${newTop}${rest}`)
      continue
    }
  }

  return mapping
}

function isFileMoved(file: string): boolean {
  return MOVE_RULES.some((r) => r.type === 'file' && r.from === file)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Collecting files…')
  const allFiles = collectAllFiles()
  console.log(`   Found ${allFiles.length} files`)

  console.log('📋 Building mapping…')
  const mapping = buildMapping(allFiles)
  console.log(`   ${mapping.size} files will be moved`)

  // Log summary
  const byDest = new Map<string, number>()
  for (const [, dest] of mapping) {
    const group = dest.split('/')[0]!
    byDest.set(group, (byDest.get(group) ?? 0) + 1)
  }
  for (const [group, count] of [...byDest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   → ${group}/: ${count} files`)
  }

  // ── Phase 1: Rewrite imports in OLD files using ts-morph ──

  console.log('\n✏️  Rewriting imports with ts-morph…')
  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'packages/core/tsconfig.json'),
  })

  const oldAbsByRel = new Map<string, string>()
  const newAbsByOldRel = new Map<string, string>()
  for (const sf of project.getSourceFiles()) {
    const rel = srcRel(sf.getFilePath())
    oldAbsByRel.set(rel, sf.getFilePath())
    const newRel = mapping.get(rel)
    if (newRel) newAbsByOldRel.set(rel, path.join(ROOT, CORE_SRC, newRel))
  }

  let importChanges = 0
  let changedFiles = 0

  for (const sf of project.getSourceFiles()) {
    const oldRel = srcRel(sf.getFilePath())
    const newRel = mapping.get(oldRel)
    // Skip files that will stay in place (no mapping entry)
    if (!newRel && oldRel.startsWith('engine/')) {
      // engine files stay, but may import moved files — still need to fix
    }
    if (!newRel && !oldRel.startsWith('engine/')) {
      // Check if this file is under a STAY dir or is a root file
      const topDir = oldRel.split('/')[0]!
      if (STAY_DIRS.has(topDir) || !oldRel.includes('/')) {
        // Root files and stay dirs — still need to fix imports to moved files
      } else {
        // Not moved, not engine, not stay — skip
        continue
      }
    }

    let fileChanged = false

    for (const importDecl of sf.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier || !specifier.startsWith('.')) continue

      const resolved = importDecl.getModuleSpecifierSourceFile()
      if (!resolved) continue

      const resolvedRel = srcRel(resolved.getFilePath())
      const newResolvedRel = mapping.get(resolvedRel)
      if (!newResolvedRel) continue

      const sourceDirRel = newRel ? path.dirname(newRel) : path.dirname(oldRel)
      const sourceAbs2 = path.join(ROOT, CORE_SRC, sourceDirRel)
      const targetAbs2 = path.join(ROOT, CORE_SRC, newResolvedRel)
      let newSpec = normalize(path.relative(sourceAbs2, targetAbs2))
      if (!newSpec.startsWith('.')) newSpec = './' + newSpec
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
        if (newSpec.endsWith(ext)) {
          newSpec = newSpec.slice(0, -ext.length)
          break
        }
      }

      importDecl.setModuleSpecifier(newSpec)
      importChanges++
      fileChanged = true
    }

    // Handle export * from re-exports (ts-morph ExportDeclaration)
    for (const exportDecl of sf.getExportDeclarations()) {
      const specifier = exportDecl.getModuleSpecifierValue()
      if (!specifier || !specifier.startsWith('.')) continue

      // Resolve the export specifier manually (ts-morph can't do it for exports)
      const sourceDir = path.dirname(sf.getFilePath())
      const absTarget = path.resolve(sourceDir, specifier)
      const candidates = [absTarget, `${absTarget}.ts`, `${absTarget}/index.ts`, `${absTarget}.d.ts`]
      let resolvedRel: string | undefined
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          resolvedRel = srcRel(c)
          break
        }
      }
      if (!resolvedRel) continue
      const newResolvedRel = mapping.get(resolvedRel)
      if (!newResolvedRel) continue

      const sourceDirRel = newRel ? path.dirname(newRel) : path.dirname(oldRel)
      const sourceAbs2 = path.join(ROOT, CORE_SRC, sourceDirRel)
      const targetAbs2 = path.join(ROOT, CORE_SRC, newResolvedRel)
      let newSpec = normalize(path.relative(sourceAbs2, targetAbs2))
      if (!newSpec.startsWith('.')) newSpec = './' + newSpec
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts']) {
        if (newSpec.endsWith(ext)) {
          newSpec = newSpec.slice(0, -ext.length)
          break
        }
      }

      exportDecl.setModuleSpecifier(newSpec)
      importChanges++
      fileChanged = true
    }

    if (fileChanged) changedFiles++
  }

  await project.save()
  console.log(`   Updated ${importChanges} imports across ${changedFiles} files`)

  // ── Phase 2: Copy files to new locations ──

  console.log('\n📂 Copying files to new locations…')
  let copied = 0
  for (const [oldRel, newRel] of mapping) {
    const absOld = path.join(ROOT, CORE_SRC, oldRel)
    const absNew = path.join(ROOT, CORE_SRC, newRel)
    if (!fs.existsSync(absOld)) continue // was already deleted by a prior copy? shouldn't happen
    fs.mkdirSync(path.dirname(absNew), { recursive: true })
    fs.copyFileSync(absOld, absNew)
    copied++
  }
  console.log(`   Copied ${copied} files`)

  // ── Phase 3: Delete OLD files ──

  console.log('\n🗑️  Deleting old files…')
  // Collect all old directories to remove, sorted deepest first
  const oldDirs = new Set<string>()
  for (const [oldRel] of mapping) {
    const absOld = path.join(ROOT, CORE_SRC, oldRel)
    if (fs.existsSync(absOld)) fs.rmSync(absOld)
    oldDirs.add(path.dirname(oldRel))
  }

  // Remove empty old directories (deepest first)
  const sortedDirs = [...oldDirs]
    .filter((d) => d !== '.')
    .sort((a, b) => b.split('/').length - a.split('/').length)

  for (const dirRel of sortedDirs) {
    const absDir = path.join(ROOT, CORE_SRC, dirRel)
    if (fs.existsSync(absDir)) {
      try {
        fs.rmdirSync(absDir)
      } catch {
        // not empty — skip
      }
    }
  }
  console.log('   Done')

  // ── Phase 4: Update src/index.ts barrel export ──
  // The ts-morph pass already fixed all imports in index.ts,
  // but we need to apply the same path mapping to its export declarations.
  // Since index.ts was saved in step 1, and the copy in step 2 copied the
  // fixed version, we just need to verify.

  console.log('\n✅ Restructure complete!')
  console.log('\n📊 Final structure:')
  const afterDirs = new Set<string>()
  for (const [, dest] of mapping) {
    afterDirs.add(dest.split('/')[0]!)
  }
  for (const d of [...afterDirs].sort()) console.log(`   ${d}/`)
  for (const d of [...STAY_DIRS].sort()) console.log(`   ${d}/`)
  console.log('   (root) index.ts, errors.ts, errors-help.ts, version.ts')

  console.log('\n⚠️  Next steps:')
  console.log('   1. Check src/index.ts — update barrel export paths as needed')
  console.log('   2. Run: pnpm type-check')
  console.log('   3. Run: pnpm test:packages')
  console.log('   4. Update tsconfig.json include/exclude patterns if needed')
  console.log('   5. Commit the changes')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
