import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globals: true,
    root: './',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    globalSetup: ['./test/setup/global-setup.ts'],
    setupFiles: ['./test/setup/setup.ts'],
  },
  plugins: [swc.vite()],
});
