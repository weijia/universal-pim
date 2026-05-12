<template>
  <div>
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h1 style="font-size: 28px; font-weight: 700;">设置</h1>
      <nav style="display: flex; gap: 16px;">
        <router-link to="/" class="nav-link">通讯录</router-link>
        <router-link to="/messages" class="nav-link">消息</router-link>
        <router-link to="/settings" class="nav-link">设置</router-link>
      </nav>
    </header>

    <div class="settings-container">
      <!-- 数据管理 -->
      <div class="settings-section">
        <h2 class="settings-title">数据管理</h2>
        
        <div class="setting-item">
          <div class="setting-info">
            <h3>导出数据</h3>
            <p>将所有联系人和消息导出为JSON文件</p>
          </div>
          <button class="btn btn-secondary" @click="exportData">导出</button>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <h3>导入数据</h3>
            <p>从JSON文件导入数据</p>
          </div>
          <label class="btn btn-secondary" style="cursor: pointer;">
            导入
            <input type="file" accept=".json" @change="importData" style="display: none;" />
          </label>
        </div>
      </div>

      <!-- WebDAV 同步 -->
      <div class="settings-section">
        <h2 class="settings-title">WebDAV 同步</h2>
        
        <div class="sync-status">
          <span 
            class="status-dot" 
            :class="{
              success: syncStatus === 'synced',
              warning: syncStatus === 'syncing',
              error: syncStatus === 'error'
            }"
          ></span>
          <span>{{ syncStatusText }}</span>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <h3>WebDAV 配置</h3>
            <p>配置远程WebDAV服务器用于数据同步</p>
          </div>
          <button class="btn btn-primary" @click="showWebDAVModal = true">
            {{ hasWebDAVConfig ? '修改配置' : '配置' }}
          </button>
        </div>

        <div v-if="hasWebDAVConfig" class="setting-item">
          <div class="setting-info">
            <h3>测试连接</h3>
            <p>验证WebDAV服务器连接是否正常</p>
          </div>
          <button class="btn btn-secondary" @click="testConnection" :disabled="testing">
            {{ testing ? '测试中...' : '测试' }}
          </button>
        </div>

        <div v-if="hasWebDAVConfig" class="setting-item">
          <div class="setting-info">
            <h3>手动同步</h3>
            <p>立即将数据同步到WebDAV服务器</p>
          </div>
          <button class="btn btn-primary" @click="syncNow" :disabled="syncService.isSyncing">
            {{ syncService.isSyncing ? '同步中...' : '同步' }}
          </button>
        </div>

        <div v-if="hasWebDAVConfig" class="setting-item">
          <div class="setting-info">
            <h3>从WebDAV恢复</h3>
            <p>从服务器下载并恢复数据</p>
          </div>
          <button class="btn btn-secondary" @click="restoreFromServer" :disabled="restoring">
            {{ restoring ? '恢复中...' : '恢复' }}
          </button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="settings-section">
        <h2 class="settings-title">关于</h2>
        <div class="about-info">
          <p><strong>Universal PIM</strong></p>
          <p>版本: 1.0.0</p>
          <p>一个通用的联系人与消息管理工具</p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--text-secondary);">
            数据存储在本地浏览器中，使用PouchDB管理。<br />
            支持WebDAV远程同步备份。
          </p>
        </div>
      </div>
    </div>

    <!-- WebDAV 配置模态框 -->
    <div v-if="showWebDAVModal" class="modal-overlay" @click.self="showWebDAVModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">WebDAV 同步配置</h2>
          <button class="modal-close" @click="showWebDAVModal = false">&times;</button>
        </div>

        <div class="webdav-help">
          <p>配置WebDAV服务器以启用远程数据同步功能。</p>
          <p>配置名以 <code>webdav</code> 开头。</p>
        </div>
        
        <form @submit.prevent="saveWebDAVConfig">
          <div class="form-group">
            <label>启用 WebDAV 同步</label>
            <label class="toggle">
              <input type="checkbox" v-model="webdavForm.enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          
          <div class="form-group">
            <label>WebDAV URL</label>
            <input 
              v-model="webdavForm.url" 
              type="url" 
              placeholder="https://your-server.com/dav/"
            />
          </div>
          
          <div class="form-group">
            <label>用户名</label>
            <input 
              v-model="webdavForm.username" 
              type="text" 
              placeholder="username"
            />
          </div>
          
          <div class="form-group">
            <label>密码</label>
            <input 
              v-model="webdavForm.password" 
              type="password" 
              placeholder="••••••••"
            />
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showWebDAVModal = false">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { syncService } from '../services/syncService'
import { db } from '../services/db'

const showWebDAVModal = ref(false)
const testing = ref(false)
const syncing = ref(false)
const restoring = ref(false)
const saving = ref(false)
const lastSyncTime = ref(null)
const webdavConfig = ref({ url: '', username: '', password: '', enabled: false })

const webdavForm = ref({
  enabled: false,
  url: '',
  username: '',
  password: ''
})

const hasWebDAVConfig = computed(() => 
  webdavConfig.value.url && webdavConfig.value.username
)

const syncStatus = computed(() => {
  if (syncService.isSyncing) return 'syncing'
  if (lastSyncTime.value) return 'synced'
  return 'idle'
})

const syncStatusText = computed(() => {
  if (syncService.isSyncing) return '同步中...'
  if (lastSyncTime.value) {
    return `上次同步: ${new Date(lastSyncTime.value).toLocaleString('zh-CN')}`
  }
  return '未同步'
})

onMounted(async () => {
  webdavConfig.value = await syncService.getWebDAVConfig()
  
  // 监听同步状态变化
  syncService.addListener((status) => {
    if (status.lastSyncTime) {
      lastSyncTime.value = status.lastSyncTime
    }
  })
  
  // 从设置中获取上次同步时间
  const stored = await db.getSetting('lastSyncTime')
  if (stored) lastSyncTime.value = stored
})

async function saveWebDAVConfig() {
  saving.value = true
  try {
    await syncService.saveWebDAVConfig(webdavForm.value)
    webdavConfig.value = { ...webdavForm.value }
    showWebDAVModal.value = false
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    const result = await syncService.testConnection()
    alert(result.success ? '连接成功！' : `连接失败: ${result.message}`)
  } finally {
    testing.value = false
  }
}

async function syncNow() {
  syncing.value = true
  try {
    const success = await syncService.sync()
    if (success) {
      await db.setSetting('lastSyncTime', new Date().toISOString())
      lastSyncTime.value = new Date().toISOString()
      alert('同步成功！')
    } else {
      alert('同步失败，请检查WebDAV配置')
    }
  } finally {
    syncing.value = false
  }
}

async function restoreFromServer() {
  if (!confirm('这将覆盖本地数据，确定要继续吗？')) return
  
  restoring.value = true
  try {
    const result = await syncService.restoreFromWebDAV()
    if (result.success) {
      alert('恢复成功！请刷新页面查看数据。')
      window.location.reload()
    } else {
      alert(`恢复失败: ${result.message}`)
    }
  } finally {
    restoring.value = false
  }
}

async function exportData() {
  try {
    const data = await db.exportData()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `universal-pim-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    
    URL.revokeObjectURL(url)
  } catch (error) {
    alert(`导出失败: ${error.message}`)
  }
}

async function importData(event) {
  const file = event.target.files[0]
  if (!file) return
  
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    if (!confirm('这将合并导入数据到现有数据中，确定要继续吗？')) return
    
    await db.importData(data)
    alert('导入成功！请刷新页面查看数据。')
    window.location.reload()
  } catch (error) {
    alert(`导入失败: ${error.message}`)
  }
  
  event.target.value = ''
}
</script>

<style scoped>
.nav-link {
  text-decoration: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 500;
}

.nav-link:hover,
.nav-link.router-link-active {
  background: var(--border);
  color: var(--text);
}

.settings-container {
  max-width: 700px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
}

.setting-info h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.setting-info p {
  font-size: 13px;
  color: var(--text-secondary);
}

.about-info {
  padding: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.about-info p {
  margin-bottom: 8px;
}

.webdav-help {
  background: #eff6ff;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

.webdav-help code {
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: var(--primary);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(24px);
}
</style>
