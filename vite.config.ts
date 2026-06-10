import { defineConfig } from 'vite'

// GitHub Pages serves from /<repo>/, dev serves from /.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
})
