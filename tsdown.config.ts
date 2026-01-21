import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node18',
  platform: 'node',
  external: ['fs-extra', 'simple-git', 'oxlint', 'oxfmt'],
  dts: true,
  sourcemap: true,
  clean: true,
});
