import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// MCP Apps are served as one HTML document, so all JS and CSS is inlined into dist/index.html.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
