/**
 * UI 样式门禁（ADR 0004 + 交互审计 P0-5）。
 *
 * 只检查 packages/vue/src。已有违规记录在 stylelint-suppressions.json，
 * CI 只在新增违规时失败；修复后运行 `pnpm lint:ui:prune` 收紧基线。
 */
export default {
  plugins: ['./scripts/lint/stylelint-plugin-klc.mjs'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    // 文本域：拖拽手柄是过时交互，用 BaseTextarea（field-sizing: content）。
    'declaration-property-value-disallowed-list': [
      {
        resize: ['/^(both|vertical|horizontal|block|inline)$/'],
        transition: ['/\\ball\\b/'],
      },
      {
        message: (property) =>
          property === 'resize'
            ? 'Textarea resize handle: use BaseTextarea (field-sizing: content, resize: none)'
            : 'Avoid "transition: all": list the animated properties (transform, opacity)',
      },
    ],
    // 原始颜色 / 刻度外长度 / z-index：var(--token, 回退值) 中的回退值不计入。
    'klc/no-raw-color': true,
    'klc/no-raw-length': true,
    'klc/no-raw-z-index': true,
  },
}
