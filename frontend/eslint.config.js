import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'public/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
);
