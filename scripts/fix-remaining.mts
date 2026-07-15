#!/usr/bin/env tsx
/**
 * Fix remaining issues from the core restructure:
 * 1. Move pixelAlign.ts → foundation/utils/ and update imports
 * 2. Move fonts.ts → foundation/tokens/ and update imports
 * 3. Fix src/index.ts barrel exports to point to new locations
 */
import { Project } from 'ts-morph'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CORE_SRC = 'packages/core/src'

const FILE_MOVES = [
  { from: 'engine/draw/pixelAlign.ts', to: 'foundation/utils/pixelAlign.ts' },
  { from: 'engine/theme/fonts.ts', to: 'foundation/tokens/fonts.ts' },
]

// Build mapping of old → new paths
const mapping = new Map<string, string>()
for (const m of FILE_MOVES) mapping.set(m.from, m.to)

// Step 1: Copy files
console.log('📂 Copying files…')
for (const { from, to } of FILE_MOVES) {
  const absFrom = path.join(ROOT, CORE_SRC, from)
  const absTo = path.join(ROOT, CORE_SRC, to)
  fs.mkdirSync(path.dirname(absTo), { recursive: true })
  fs.copyFileSync(absFrom, absTo)
  console.log(`   ${from} → ${to}`)
}

// Step 2: Fix imports using ts-morph
console.log('\n✏️  Rewriting imports…')
const project = new Project({
  tsConfigFilePath: path.join(ROOT, 'packages/core/tsconfig.json'),
})

function srcRel(abs: string): string {
  return path.relative(path.join(ROOT, CORE_SRC), abs).replace(/\\/g, '/')
}

for (const sf of project.getSourceFiles()) {
  const rel = srcRel(sf.getFilePath())
  const sfDir = path.dirname(sf.getFilePath())

  // Helper to update a module specifier
  const updateSpec = (currentSpec: string): string | null => {
    if (!currentSpec.startsWith('.')) return null
    // Try to resolve: current specifier relative to file location
    const resolvedPaths = [
      path.resolve(sfDir, currentSpec),
      path.resolve(sfDir, currentSpec) + '.ts',
      path.resolve(sfDir, currentSpec) + '/index.ts',
    ]
    for (const rp of resolvedPaths) {
      if (fs.existsSync(rp)) {
        const resolvedRel = srcRel(rp)
        const newRel = mapping.get(resolvedRel)
        if (newRel) {
          const newAbs = path.join(ROOT, CORE_SRC, newRel)
          let newSpec = path.relative(sfDir, newAbs).replace(/\\/g, '/')
          if (!newSpec.startsWith('.')) newSpec = './' + newSpec
          for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts']) {
            if (newSpec.endsWith(ext)) {
              newSpec = newSpec.slice(0, -ext.length)
              break
            }
          }
          return newSpec
        }
      }
    }
    return null
  }

  let fileChanged = false

  for (const decl of sf.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue()
    if (!spec) continue
    const newSpec = updateSpec(spec)
    if (newSpec) {
      decl.setModuleSpecifier(newSpec)
      fileChanged = true
    }
  }

  for (const decl of sf.getExportDeclarations()) {
    const spec = decl.getModuleSpecifierValue()
    if (!spec) continue
    const newSpec = updateSpec(spec)
    if (newSpec) {
      decl.setModuleSpecifier(newSpec)
      fileChanged = true
    }
  }

  if (fileChanged) console.log(`   fixed: ${rel}`)
}

await project.save()
console.log('   Imports saved')

// Step 3: Fix src/index.ts barrel exports
console.log('\n📝 Fixing src/index.ts barrel exports…')
const indexPath = path.join(ROOT, CORE_SRC, 'index.ts')
let indexContent = fs.readFileSync(indexPath, 'utf-8')

// Map old export paths to new
const EXPORT_MAP: Array<[RegExp, string]> = [
  [/export \* from '\.\/reactivity'/g, "export * from './foundation/reactivity'"],
  [/export \* from '\.\/mcp'/g, "export * from './features/mcp'"],
  [/export \* from '\.\/tokens'/g, "export * from './foundation/tokens'"],
  [/from '\.\/utils\//g, "from './foundation/utils/"],
  [/from '\.\/config\//g, "from './foundation/config/"],
  [/export \* from '\.\/input'/g, "export * from './features/input'"],
  [/export \* from '\.\/scheduler'/g, "export * from './rendering/scheduler'"],
  [/export type \* from '\.\/render'/g, "export type * from './rendering/render'"],
  [/export \* from '\.\/renderer-tier'/g, "export * from './rendering/renderer-tier'"],
  [/export \* from '\.\/scene'/g, "export * from './rendering/scene'"],
  [/export \* from '\.\/alerts'/g, "export * from './features/alerts'"],
  [/export \* from '\.\/replay'/g, "export * from './features/replay'"],
  [/export \* from '\.\/chartTypes'/g, "export * from './features/chartTypes'"],
  [/export \* from '\.\/indicators'/g, "export * from './features/indicators'"],
]

let changed = false
for (const [pattern, replacement] of EXPORT_MAP) {
  if (pattern.test(indexContent)) {
    indexContent = indexContent.replace(pattern, replacement)
    changed = true
    console.log(`   ${pattern.source} → ${replacement}`)
  }
}

if (changed) {
  fs.writeFileSync(indexPath, indexContent)
  console.log('   index.ts updated')
} else {
  console.log('   No changes needed in index.ts')
}

// Step 4: Delete old files
console.log('\n🗑️  Deleting old files…')
for (const { from } of FILE_MOVES) {
  const absFrom = path.join(ROOT, CORE_SRC, from)
  if (fs.existsSync(absFrom)) {
    fs.rmSync(absFrom)
    console.log(`   removed: ${from}`)
  }
}

// Clean up empty old dirs
const oldDirs = new Set([
  'engine/draw',
  'engine/draw/__tests__',
  'engine/theme',
])
for (const dirRel of [...oldDirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
  const absDir = path.join(ROOT, CORE_SRC, dirRel)
  if (fs.existsSync(absDir)) {
    try {
      fs.rmdirSync(absDir)
      console.log(`   removed empty dir: ${dirRel}`)
    } catch (e) {
      // not empty
    }
  }
}

console.log('\n✅ Remaining fixes complete!')
