import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'src/api/generated',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-console': 'error',
      // Lookups like VARIANTS[variant] use TypeScript union keys, never user input; this rule cannot
      // see types and flags every one of them. Untrusted data never indexes objects here.
      'security/detect-object-injection': 'off',
      // Raw HTML is how XSS gets in. Sanitized content (email bodies) goes through one reviewed
      // component that disables this rule with a comment; nowhere else.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Use the sanitized HTML component instead of dangerouslySetInnerHTML.',
        },
      ],
    },
  },
  {
    files: ['*.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
