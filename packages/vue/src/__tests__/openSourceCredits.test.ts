import { describe, expect, it } from 'vitest'

import aiRuntimePkg from '../../../ai-runtime/package.json'
import corePkg from '../../../core/package.json'
import vuePkg from '../../package.json'
import {
  getOpenSourceCredits,
  OPEN_SOURCE_WHITELIST,
  resolveGithubUrl,
} from '../credits/openSourceCredits'

describe('resolveGithubUrl', () => {
  it('normalizes common repository formats', () => {
    expect(resolveGithubUrl({ version: '1', repository: 'ajv-validator/ajv' })).toBe(
      'https://github.com/ajv-validator/ajv',
    )
    expect(
      resolveGithubUrl({
        version: '1',
        repository: { url: 'git+https://github.com/websockets/ws.git' },
      }),
    ).toBe('https://github.com/websockets/ws')
    expect(
      resolveGithubUrl({
        version: '1',
        repository: { url: 'git@github.com:vuejs/core.git' },
      }),
    ).toBe('https://github.com/vuejs/core')
  })

  it('falls back when repository is missing', () => {
    expect(resolveGithubUrl({ version: '1' })).toBe(
      'https://github.com/363045841/KLineChartQuant',
    )
  })
})

describe('getOpenSourceCredits', () => {
  it('follows whitelist order and sections', () => {
    const sections = getOpenSourceCredits()
    expect(sections.map((s) => s.id)).toEqual(['workspace', 'third-party'])

    const flat = sections.flatMap((s) => s.items.map((i) => i.name))
    expect(flat).toEqual(OPEN_SOURCE_WHITELIST.map((e) => e.name))
  })

  it('reads versions from package.json for workspace packages', () => {
    const workspace = getOpenSourceCredits().find((s) => s.id === 'workspace')
    expect(workspace).toBeDefined()
    const byName = Object.fromEntries(workspace!.items.map((i) => [i.name, i]))

    expect(byName['@363045841yyt/klinechart']?.version).toBe(vuePkg.version)
    expect(byName['@363045841yyt/klinechart-core']?.version).toBe(corePkg.version)
    expect(byName['@363045841yyt/klinechart-ai-runtime']?.version).toBe(aiRuntimePkg.version)
    expect(byName['@363045841yyt/klinechart']?.license).toBe(vuePkg.license)
  })

  it('includes github urls for all items', () => {
    const items = getOpenSourceCredits().flatMap((s) => s.items)
    for (const item of items) {
      expect(item.url).toMatch(/^https:\/\/github\.com\//)
    }
  })

  it('reads third-party versions from installed package.json', () => {
    const third = getOpenSourceCredits().find((s) => s.id === 'third-party')
    expect(third).toBeDefined()
    for (const item of third!.items) {
      expect(item.version).toMatch(/^\d+\.\d+/)
      expect(item.license.length).toBeGreaterThan(0)
      expect(item.license).not.toBe('UNKNOWN')
    }
  })
})
