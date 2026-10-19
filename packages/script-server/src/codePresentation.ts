/** 主编辑器与所有代码提示共用的语法配色，主题只在此处配置。 */
import { syntaxHighlighting } from '@codemirror/language'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

export const scriptSyntaxHighlighting = syntaxHighlighting(oneDarkHighlightStyle)
