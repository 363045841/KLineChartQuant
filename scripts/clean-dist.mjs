// 清理包构建产物目录：tsc 不会清空 outDir，陈旧文件会被一并发布。
import { rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
