import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base relativa: funciona em qualquer nome de repositório no GitHub Pages.
// outDir "docs": no GitHub, Settings > Pages > Deploy from branch > main /docs
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
