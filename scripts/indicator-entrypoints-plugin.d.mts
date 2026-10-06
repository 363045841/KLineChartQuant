/** Vite/Vitest 自动发现插件的配置契约。 */
import type { Plugin } from 'vite'

/** 在构建与开发文件变更时自动生成内置定义入口。 */
export declare function indicatorEntrypointsPlugin(sourceRoot?: string): Plugin
