const js = require('@eslint/js')
const globals = require('globals')
const { globalIgnores } = require('eslint/config')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')

module.exports = [
  globalIgnores(['lib', 'node_modules', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'eslint.config.cjs', 'jest.setup.ts']),

  // JS files: use @eslint/js recommended rules
  {
    files: ['**/*.js'],
    ignores: ['lib/**'],
    languageOptions: Object.assign({}, js.configs.recommended.languageOptions, {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.node,
    }),
    rules: js.configs.recommended.rules,
  },

  // TS files: use @typescript-eslint plugin recommended rules
  {
    files: ['**/*.ts'],
    ignores: ['lib/**', 'jest.setup.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.node,
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    // start from recommended rules, then relax some rules that are noisy for this codebase
    rules: Object.assign({}, tsPlugin.configs.recommended.rules, {
      // many existing files use `any` in tests and in a couple of helper areas
      '@typescript-eslint/no-explicit-any': 'off',
      // allow ts-ignore/comment pragmas in tests/helpers
      '@typescript-eslint/ban-ts-comment': 'off',
      // codebase uses require in places (tests/mocks); allow it
      '@typescript-eslint/no-require-imports': 'off',
      // make unused vars a warning and allow underscore-prefixed ignored vars
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
    }),
  },

  // Relax rules for test files / __tests__ to avoid blocking test code patterns
  {
    files: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
    ignores: ['lib/**'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: Object.assign({}, globals.node),
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // jest.setup.ts - no type checking needed
  {
    files: ['jest.setup.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
]
