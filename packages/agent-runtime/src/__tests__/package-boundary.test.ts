import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('package boundary', () => {
  it('keeps the root source entry free of Node, SQLite, and Electron imports', async () => {
    const path = fileURLToPath(new URL('../index.ts', import.meta.url))
    const source = await readFile(path, 'utf8')
    expect(source).not.toMatch(/node:|electron|sqlite/i)
  })
})
