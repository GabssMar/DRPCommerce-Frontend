import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: { globals: globals.browser },
    rules: {
      // Countdown.vue mantém o nome referenciado nas tasks de migração.
      'vue/multi-word-component-names': ['error', { ignores: ['Countdown'] }],
    },
  },
])
