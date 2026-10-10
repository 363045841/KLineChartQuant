/**
 * UI 交互门禁（交互审计 P0-5）。Biome 负责通用 lint/format；ESLint 只承担 Biome
 * 还不覆盖的 Vue 模板规则。
 *
 * 已有违规记录在 eslint-suppressions.json（ESLint bulk suppressions），
 * CI 只在新增违规时失败；修复后运行 `pnpm lint:ui:prune` 收紧基线。
 */
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

/** 原生 HTML 元素：小写、无连字符（排除 PascalCase 组件与自定义元素）。 */
const NATIVE_ELEMENT = '/^[a-z][a-z0-9]*$/'
const TITLE_MESSAGE =
  'Native title tooltips fail on touch and keyboard: use aria-label + <BaseTooltip>'

export default [
  {
    files: ['packages/vue/src/**/*.{ts,vue}'],
    ignores: ['**/*.test.ts', '**/__tests__/**', '**/*.d.ts'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: { vue },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // 阻塞主线程、无法样式化与本地化：用 useToast().showUndo 或行内确认。
      'no-alert': 'error',
      'no-restricted-properties': [
        'error',
        ...['confirm', 'alert', 'prompt'].map((property) => ({
          object: 'window',
          property,
          message: 'Use useToast().showUndo(...) or an in-place confirm instead of a browser dialog',
        })),
      ],
      'vue/no-restricted-static-attribute': [
        'error',
        { key: 'title', element: NATIVE_ELEMENT, message: TITLE_MESSAGE },
      ],
      'vue/no-restricted-v-bind': [
        'error',
        { argument: 'title', element: NATIVE_ELEMENT, message: TITLE_MESSAGE },
      ],
      'vue/no-restricted-html-elements': [
        'error',
        { element: ['textarea'], message: 'Use <BaseTextarea> (auto-grow, no drag handle)' },
      ],
      'vue/html-button-has-type': 'error',
    },
  },
  {
    // 原语本身可以使用被限制的原生元素。
    files: ['packages/vue/src/components/common/BaseTextarea.vue'],
    rules: { 'vue/no-restricted-html-elements': 'off' },
  },
]
