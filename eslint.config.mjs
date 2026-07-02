import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginImportX from 'eslint-plugin-import-x'
import pluginUnicorn from 'eslint-plugin-unicorn'
import pluginVitest from '@vitest/eslint-plugin'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'dist-demo/',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.*',
      'examples/',
      '**/preview/',
      'packages/desktop-electron/out/',
    ],
  },



  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { unicorn: pluginUnicorn },
    rules: {
      // ✅ 纯信息类规则 — 不自动修复，只报告
      'unicorn/better-regex': 'warn',
      'unicorn/expiring-todo-comments': 'warn',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-unnecessary-polyfills': 'warn',

      // ✅ 安全的格式化规则 — 只改空白
      'unicorn/empty-brace-spaces': 'warn',
      'unicorn/template-indent': ['warn', { indent: 2 }],

      // ✅ 可安全自动修复但无风险的规则
      'unicorn/prefer-modern-dom-apis': 'warn',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'unicorn/prefer-spread': 'warn',
      'unicorn/prefer-string-starts-ends-with': 'warn',
      'unicorn/prefer-string-trim-start-end': 'warn',
      'unicorn/prefer-type-literal-last': 'warn',

      // ❌ 禁用所有改变代码逻辑的危险规则
      'unicorn/catch-error-name': 'off',
      'unicorn/consistent-destructuring': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/error-message': 'off',
      'unicorn/escape-case': 'off',
      'unicorn/explicit-length-check': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/new-for-builtins': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-push-push': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-for-loop': 'off',
      'unicorn/no-instanceof-array': 'off',
      'unicorn/no-lonely-if': 'off',
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/no-new-array': 'off',
      'unicorn/no-new-buffer': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-object-as-default-parameter': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/no-typeof-undefined': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/no-zero-fractions': 'off',
      'unicorn/number-literal-case': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/prefer-add-event-listener': 'off',
      'unicorn/prefer-add-event-listener-options': 'off',
      'unicorn/prefer-array-flat': 'off',
      'unicorn/prefer-array-some': 'off',
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-await': 'off',
      'unicorn/prefer-boolean-return': 'off',
      'unicorn/prefer-code-point': 'off',
      'unicorn/prefer-date-now': 'off',
      'unicorn/prefer-dom-node-append': 'off',
      'unicorn/prefer-dom-node-dataset': 'off',
      'unicorn/prefer-dom-node-remove': 'off',
      'unicorn/prefer-dom-node-text-content': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/prefer-includes': 'off',
      'unicorn/prefer-includes-over-repeated-comparisons': 'off',
      'unicorn/prefer-keyboard-event-key': 'off',
      'unicorn/prefer-logical-operator-over-ternary': 'off',
      'unicorn/prefer-modern-math-apis': 'off',
      'unicorn/prefer-native-coercion-functions': 'off',
      'unicorn/prefer-negative-index': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-number-properties': 'off',
      'unicorn/prefer-object-define-properties': 'off',
      'unicorn/prefer-object-from-entries': 'off',
      'unicorn/prefer-prototype-methods': 'off',
      'unicorn/prefer-query-selector': 'off',
      'unicorn/prefer-reflect-apply': 'off',
      'unicorn/prefer-regexp-test': 'off',
      'unicorn/prefer-set-has': 'off',
      'unicorn/prefer-string-replace-all': 'off',
      'unicorn/prefer-string-slice': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-unicode-code-point-escapes': 'off',
      'unicorn/require-array-join-separator': 'off',
      'unicorn/require-number-to-fixed-digits-argument': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/throw-new-error': 'off',
      'unicorn/relative-url-style': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/no-non-function-verb-prefix': 'off',
      'unicorn/no-top-level-side-effects': 'off',
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
      'unicorn/prefer-export-from': 'off',
      'unicorn/numeric-separators-style': 'off',
    },
  },

  {
    plugins: { 'import-x': pluginImportX },
    rules: {
      'import-x/no-unresolved': 'off',
      'import-x/order': [
        'warn',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },

  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  {
    files: ['packages/react/**/*.{ts,tsx}'],
    ...pluginReact.configs.flat.recommended,
    ...pluginReactHooks.configs.flat.recommended,
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**'],
    ...pluginVitest.configs.recommended,
    rules: {
      'vitest/no-conditional-expect': 'off',
    },
  },

  {
    rules: {
      'no-undef': 'off',
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': 'off',
    },
  },

  // ✅ Prettier 必须在所有规则之后 — 关闭与 Prettier 冲突的格式规则
  eslintConfigPrettier,
)
