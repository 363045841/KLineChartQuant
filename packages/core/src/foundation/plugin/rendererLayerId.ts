/** 统一生成 renderer plugin 对应的 Scene Layer ID。 */
export function makePluginLayerId(name: string): string {
  return `plugin:${name}`
}
