import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';


export default tseslint.config(
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: {
      js,
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
    },
    languageOptions: {
      globals: globals.es2020,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.stylistic,
      stylistic.configs.recommended,
    ],
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
);
