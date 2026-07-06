import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 获取 Git 标签、hash 和构建时间
const getVersionInfo = () => {
  try {
    const { execSync } = require('child_process')
    const tag = execSync('git describe --tags --always 2>/dev/null || echo "v1.0.0"').toString().trim()
    const hash = execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"').toString().trim()
    return { tag, hash }
  } catch {
    return { tag: 'v1.0.0', hash: 'unknown' }
  }
}

const versionInfo = getVersionInfo()
const buildTime = new Date().toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.tag),
    __GIT_HASH__: JSON.stringify(versionInfo.hash),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
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
