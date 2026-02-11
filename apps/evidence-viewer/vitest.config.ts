import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/components/**', 'jsdom']],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'src/lib/__tests__/transcriptSignatures.test.ts'],
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
