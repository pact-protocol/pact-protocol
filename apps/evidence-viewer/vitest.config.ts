import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      'node_modules',
      'dist',
      // Depend on ../integrity and ../transcriptSignatures which are not yet in repo
      'src/lib/__tests__/integrity.test.ts',
      'src/lib/__tests__/transcriptSignatures.test.ts',
    ],
    globals: true,
  },
});
