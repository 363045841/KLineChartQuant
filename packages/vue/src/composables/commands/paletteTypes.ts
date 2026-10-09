/** 命令面板中命令之外的检索来源（如品种）。 */
export interface PaletteItem {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly run: () => void
}

/** items 按查询返回已排序结果；空查询可返回推荐项。 */
export interface PaletteSource {
  readonly id: string
  readonly label: string
  readonly items: (query: string) => ReadonlyArray<PaletteItem>
}
