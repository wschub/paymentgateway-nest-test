import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const specFiles = [
  'src/**/*.spec.ts',
  'src/**/*.spec.tsx',
  'src/__tests__/**/*',
  'src/__mocks__/**/*',
]

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Call fetch only inside src/shared/api/http.ts; everywhere else use the httpRequest wrapper.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MetaProperty[meta.name="import"][property.name="meta"]',
          message: 'Use import.meta only inside src/config.ts.',
        },
      ],
    },
  },
  {
    files: ['src/config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/shared/api/http.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: specFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.jest },
    },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },
])
