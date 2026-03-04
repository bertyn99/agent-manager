import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node20',
  platform: 'node',
  external: ['fs-extra', 'giget', 'oxlint', 'oxfmt'],
  dts: true,
  sourcemap: true,
  clean: true,
});
