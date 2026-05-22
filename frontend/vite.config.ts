import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))

// pdf.js needs runtime assets to decode JPEG2000/JBIG2 images, custom CJK fonts,
// standard fonts and embedded ICC profiles. Without them, pages with such images
// render blank. Serve the assets under /pdfjs/ in dev and copy them into the
// build output so they are available in production.
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
const PDFJS_MIME: Record<string, string> = {
  wasm: 'application/wasm',
  bcmap: 'application/octet-stream',
  pfb: 'application/octet-stream',
  ttf: 'font/ttf',
  otf: 'font/otf',
  icc: 'application/vnd.iccprofile',
  js: 'application/javascript',
}

function pdfjsAssetsPlugin(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const url = (req.url ?? '/').split('?')[0].split('#')[0]
        const target = resolve(pdfjsRoot, '.' + url)
        if (!target.startsWith(pdfjsRoot) || !existsSync(target)) {
          next()
          return
        }
        try {
          const data = readFileSync(target)
          const ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase()
          res.setHeader('Content-Type', PDFJS_MIME[ext] ?? 'application/octet-stream')
          res.end(data)
        } catch {
          next()
        }
      })
    },
    closeBundle() {
      const outDir = join(process.cwd(), 'dist', 'pdfjs')
      mkdirSync(outDir, { recursive: true })
      for (const name of PDFJS_ASSET_DIRS) {
        const src = join(pdfjsRoot, name)
        if (!existsSync(src)) continue
        cpSync(src, join(outDir, name), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), pdfjsAssetsPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
