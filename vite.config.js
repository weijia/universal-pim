import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 获取 Git 标签和构建时间
const getVersion = () => {
  try {
    const { execSync } = require('child_process')
    const tag = execSync('git describe --tags --always 2>/dev/null || echo "v1.0.0"').toString().trim()
    return tag
  } catch {
    return 'v1.0.0'
  }
}

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
    __APP_VERSION__: JSON.stringify(getVersion()),
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
