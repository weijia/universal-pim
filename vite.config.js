import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'node:fs'

/**
 * 版本信息来自 scripts/generate-version.js 生成的 src/version.json。
 * src/version.json 是构建产物（已 gitignore），所以直接跑 `vite` / `vite build`
 * 会拿不到它 —— 这里提前给出明确提示，而不是等编译到 src/version.js 时莫名报错。
 */
const versionFile = new URL('./src/version.json', import.meta.url)
if (!existsSync(versionFile)) {
  throw new Error(
    '缺少 src/version.json：请用 `npm run dev` / `npm run build`（会先执行 scripts/generate-version.js），或单独执行 `npm run gen:version`'
  )
}

/**
 * 把构建时生成的 src/version.json 一并产出到 dist 根目录，
 * 供页面启动后做"新版本可用"比对（见 src/components/UpdateNotice.vue）。
 */
function versionManifestPlugin() {
  return {
    name: 'pim-version-manifest',
    generateBundle() {
      try {
        const raw = readFileSync(new URL('./src/version.json', import.meta.url), 'utf8')
        this.emitFile({ type: 'asset', fileName: 'version.json', source: raw })
      } catch (e) {
        this.warn(`version.json 读取失败，跳过产出：${e.message}`)
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), versionManifestPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    include: ['pouchdb-browser', 'events']
  },
  resolve: {
    alias: {
      'events': 'events'
    }
  }
})
