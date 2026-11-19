import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router.js'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// 仅开发模式：把存储层暴露到控制台，用于只读探针（生产构建不会包含这段）
if (import.meta.env.DEV) {
  import('./services/storageService').then((mod) => {
    window.__pimStorage = mod
    console.log('[Storage] 探针已挂载，可在控制台执行：await __pimStorage.probeRemote({ type: "Gitee", options: { token, owner, repo, branch } })')
  })
}
