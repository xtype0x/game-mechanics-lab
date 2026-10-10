import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets + hash navigation support project subpaths on static hosts.
export default defineConfig({ plugins: [react()], base: './', optimizeDeps: { entries: ['index.html'] } });
