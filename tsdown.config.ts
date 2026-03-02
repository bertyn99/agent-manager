import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: 'esm',
  outExtensions() {
    return { js: '.js' };
  },
  target: 'node20',
  platform: 'node',
  external: ['fs-extra', 'giget', 'oxlint', 'oxfmt'],
  dts: false,
  sourcemap: true,
  clean: false,
});
