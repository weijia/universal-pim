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
        
        <div class="sync-status" :class="{ error: syncError }">
          <span 
            class="status-dot" 
            :class="{
              success: syncStatus === 'synced',
              warning: syncStatus === 'syncing',
              error: syncError
            }"
          ></span>
          <span>{{ syncError || syncStatusText }}</span>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <h3>WebDAV 配置</h3>
            <p>配置远程WebDAV服务器用于数据同步</p>
          </div>
          <button class="btn btn-primary" @click="openWebDAVModal">
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
            <p>使用 universal-sync-v2 增量同步数据</p>
          </div>
          <button class="btn btn-primary" @click="syncNow" :disabled="syncService.isSyncing">
            {{ syncService.isSyncing ? '同步中...' : '同步' }}
          </button>
        </div>
      </div>

      <!-- Gitee 数据备份 -->
      <div class="settings-section">
        <h2 class="settings-title">Gitee 数据备份</h2>
        
        <div class="setting-item">
          <div class="setting-info">
            <h3>Gitee 配置</h3>
            <p>配置 Gitee Token 以将数据提交到 Gitee 仓库</p>
          </div>
          <button class="btn btn-primary" @click="openGiteeModal">
            {{ hasGiteeConfig ? '修改配置' : '配置' }}
          </button>
        </div>

        <div v-if="hasGiteeConfig" class="setting-item">
          <div class="setting-info">
            <h3>提交数据到 Gitee</h3>
            <p>将当前数据导出并提交到 Gitee 仓库</p>
          </div>
          <button class="btn btn-secondary" @click="pushToGitee" :disabled="giteePushing">
            {{ giteePushing ? '提交中...' : '提交' }}
          </button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="settings-section">
        <h2 class="settings-title">关于</h2>
        <div class="about-info">
          <p><strong><a href="https://github.com/weijia/universal-pim" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;">Universal PIM</a></strong></p>
          <p class="version-info">
            <span class="version-tag">{{ versionInfo.tag }}</span>
            <span class="version-hash">{{ versionInfo.hash }}</span>
            <span class="build-time">{{ versionInfo.buildTime }}</span>
          </p>
          <p>一个通用的联系人与消息管理工具</p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--text-secondary);">
            数据存储在本地浏览器中，使用PouchDB管理。<br />
            使用 universal-sync-v2 + zen-fs-webdav 进行增量同步。
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

          <div class="form-group">
            <label>同步路径</label>
            <input 
              v-model="webdavForm.syncPath" 
              type="text" 
              placeholder="/app_data/universal-pim"
            />
            <small style="color: var(--text-secondary);">WebDAV 上的同步目录路径</small>
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

    <!-- Gitee 配置模态框 -->
    <div v-if="showGiteeModal" class="modal-overlay" @click.self="showGiteeModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Gitee 配置</h2>
          <button class="modal-close" @click="showGiteeModal = false">&times;</button>
        </div>

        <div class="webdav-help">
          <p>配置 Gitee 个人访问令牌以将数据提交到指定仓库。</p>
          <p>在 Gitee <a href="https://gitee.com/profile/personal_access_tokens" target="_blank">个人设置</a> 中创建 Token。</p>
        </div>
        
        <form @submit.prevent="saveGiteeConfig">
          <div class="form-group">
            <label>Gitee Token</label>
            <input 
              v-model="giteeForm.token" 
              type="password" 
              placeholder="输入您的 Gitee 个人访问令牌"
            />
            <small style="color: var(--text-secondary);">需要 projects 权限</small>
          </div>
          
          <div class="form-group">
            <label>仓库地址</label>
            <input 
              v-model="giteeForm.repo" 
              type="text" 
              placeholder="weijia/my-data"
            />
            <small style="color: var(--text-secondary);">格式：用户名/仓库名</small>
          </div>
          
          <div class="form-group">
            <label>文件路径</label>
            <input 
              v-model="giteeForm.filePath" 
              type="text" 
              placeholder="data/universal-pim.json"
            />
            <small style="color: var(--text-secondary);">仓库中的文件路径</small>
          </div>

          <div class="form-group">
            <label>分支</label>
            <input 
              v-model="giteeForm.branch" 
              type="text" 
              placeholder="master"
            />
            <small style="color: var(--text-secondary);">默认为 master</small>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showGiteeModal = false">
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

// 版本信息 - 构建时会自动替换
const versionInfo = {
  tag: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.0',
  hash: typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'unknown',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toLocaleString('zh-CN')
}

const showWebDAVModal = ref(false)
const showGiteeModal = ref(false)
const testing = ref(false)
const syncing = ref(false)
const saving = ref(false)
const giteePushing = ref(false)
const lastSyncTime = ref(null)
const syncError = ref(null)
const webdavConfig = ref({ url: '', username: '', password: '', enabled: false, syncPath: '/app_data/universal-pim' })

const giteeConfig = ref({ token: '', repo: '', filePath: 'data/universal-pim.json', branch: 'master' })

const webdavForm = ref({
  enabled: false,
  url: '',
  username: '',
  password: '',
  syncPath: '/app_data/universal-pim'
})

const giteeForm = ref({
  token: '',
  repo: '',
  filePath: 'data/universal-pim.json',
  branch: 'master'
})

const hasWebDAVConfig = computed(() =>
  webdavConfig.value.url && webdavConfig.value.url.trim() !== ''
)

const hasGiteeConfig = computed(() =>
  giteeConfig.value.token && giteeConfig.value.token.trim() !== '' &&
  giteeConfig.value.repo && giteeConfig.value.repo.trim() !== ''
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
  
  // 加载 Gitee 配置
  const giteeToken = await db.getSetting('gitee_token', '')
  const giteeRepo = await db.getSetting('gitee_repo', '')
  const giteeFilePath = await db.getSetting('gitee_file_path', 'data/universal-pim.json')
  const giteeBranch = await db.getSetting('gitee_branch', 'master')
  giteeConfig.value = { token: giteeToken, repo: giteeRepo, filePath: giteeFilePath, branch: giteeBranch }
  
  // 监听同步状态变化
  syncService.addListener((status) => {
    if (status.lastSyncTime) {
      lastSyncTime.value = status.lastSyncTime
    }
    if (status.lastError) {
      syncError.value = status.lastError
    } else {
      syncError.value = null
    }
  })
  
  // 从设置中获取上次同步时间
  const stored = await db.getSetting('lastSyncTime')
  if (stored) lastSyncTime.value = stored
})

function openWebDAVModal() {
  // 将已保存的配置复制到表单
  webdavForm.value = {
    enabled: webdavConfig.value.enabled || false,
    url: webdavConfig.value.url || '',
    username: webdavConfig.value.username || '',
    password: webdavConfig.value.password || '',
    syncPath: webdavConfig.value.syncPath || '/app_data/universal-pim'
  }
  showWebDAVModal.value = true
}

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

function openGiteeModal() {
  giteeForm.value = {
    token: giteeConfig.value.token || '',
    repo: giteeConfig.value.repo || '',
    filePath: giteeConfig.value.filePath || 'data/universal-pim.json',
    branch: giteeConfig.value.branch || 'master'
  }
  showGiteeModal.value = true
}

async function saveGiteeConfig() {
  saving.value = true
  try {
    await db.setSetting('gitee_token', giteeForm.value.token)
    await db.setSetting('gitee_repo', giteeForm.value.repo)
    await db.setSetting('gitee_file_path', giteeForm.value.filePath)
    await db.setSetting('gitee_branch', giteeForm.value.branch)
    giteeConfig.value = { ...giteeForm.value }
    showGiteeModal.value = false
  } finally {
    saving.value = false
  }
}

async function pushToGitee() {
  giteePushing.value = true
  try {
    // 导出数据
    const data = await db.exportData()
    const content = JSON.stringify(data, null, 2)
    
    // 调用 Gitee API
    const [owner, repo] = giteeConfig.value.repo.split('/')
    const filePath = giteeConfig.value.filePath
    const branch = giteeConfig.value.branch || 'master'
    
    // 先获取文件是否存在（获取 sha）
    let sha = null
    try {
      const getResponse = await fetch(
        `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `token ${giteeConfig.value.token}`
          }
        }
      )
      if (getResponse.ok) {
        const existingFile = await getResponse.json()
        sha = existingFile.sha
      }
    } catch (e) {
      // 文件不存在，忽略
    }
    
    // 创建或更新文件
    const body = {
      access_token: giteeConfig.value.token,
      content: btoa(unescape(encodeURIComponent(content))), // Base64 编码
      message: `更新 Universal-PIM 数据 - ${new Date().toLocaleString('zh-CN')}`,
      branch: branch
    }
    
    if (sha) {
      body.sha = sha
    }
    
    const method = sha ? 'PUT' : 'POST'
    const response = await fetch(
      `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    )
    
    if (response.ok) {
      alert('数据已成功提交到 Gitee！')
    } else {
      const error = await response.json()
      alert(`提交失败: ${error.message || JSON.stringify(error)}`)
    }
  } catch (e) {
    alert(`提交失败: ${e.message}`)
  } finally {
    giteePushing.value = false
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
  syncError.value = null
  try {
    const success = await syncService.sync()
    if (success) {
      await db.setSetting('lastSyncTime', new Date().toISOString())
      lastSyncTime.value = new Date().toISOString()
      alert('同步成功！')
    } else {
      const errorMsg = syncService.getLastError()
      syncError.value = errorMsg || '同步失败，请检查WebDAV配置和浏览器控制台日志'
      alert(syncError.value)
    }
  } finally {
    syncing.value = false
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

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.version-tag {
  display: inline-block;
  padding: 4px 12px;
  background: var(--primary);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.version-hash {
  display: inline-block;
  padding: 4px 8px;
  background: #f0f0f0;
  color: #666;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

.build-time {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: monospace;
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
