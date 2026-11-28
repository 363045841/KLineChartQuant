/**
 * 每个用例一份全新的定义注册表；禁止跨用例共享状态。
 *
 * 测试用例自行创建并持有注册表，注入给 Kernel、Chart 或 Controller；
 * 不再存在模块级单例，也不需要任何“清空全局”的钩子。
 */
import { createDefinitionRegistry, type DefinitionRegistry } from '../../registry/index.js'

/** 创建一份空的测试定义注册表。 */
export function createTestDefinitions(): DefinitionRegistry {
  return createDefinitionRegistry()
}
