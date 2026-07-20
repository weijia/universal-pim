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

      <!-- 标签管理 -->
      <div class="settings-section">
        <h2 class="settings-title">标签管理</h2>
        
        <div v-if="allTags.length === 0" class="setting-item">
          <div class="setting-info">
            <p>暂无标签，导入联系人时会自动创建标签</p>
          </div>
        </div>

        <div v-else class="tag-list">
          <div v-for="tag in allTags" :key="tag.name" class="tag-item">
            <div class="tag-info">
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-count">{{ tag.count }} 个联系人</span>
            </div>
            <div class="tag-actions">
              <button class="btn btn-secondary btn-sm" @click="openRenameTagModal(tag.name)">重命名</button>
              <button class="btn btn-secondary btn-sm" @click="openMergeTagModal(tag.name)">合并</button>
              <button class="btn btn-danger btn-sm" @click="confirmDeleteTag(tag.name)">删除</button>
            </div>
          </div>
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

      <!-- Gitee 同步 -->
      <div class="settings-section">
        <h2 class="settings-title">Gitee 同步</h2>
        
        <div class="setting-item">
          <div class="setting-info">
            <h3>Gitee 配置</h3>
            <p>配置 Gitee Token 以同步联系人和消息到 Gitee 仓库</p>
          </div>
          <button class="btn btn-primary" @click="openGiteeSyncModal">
            {{ hasGiteeSyncConfig ? '修改配置' : '配置' }}
          </button>
        </div>

        <div v-if="hasGiteeSyncConfig && remoteOverview" class="setting-item">
          <div class="setting-info">
            <h3>远程数据</h3>
            <p>
              联系人：{{ remoteOverview.stats?.contacts || 0 }} 条，
              消息：{{ remoteOverview.stats?.messages || 0 }} 条
              <br />
              最后导出：{{ remoteOverview.lastExportTime ? new Date(remoteOverview.lastExportTime).toLocaleString('zh-CN') : '无' }}
            </p>
          </div>
        </div>

        <div v-if="hasGiteeSyncConfig" class="setting-item">
          <div class="setting-info">
            <h3>导出到 Gitee</h3>
            <p>将联系人和消息导出到 Gitee 仓库（按年/月分文件）</p>
          </div>
          <button class="btn btn-secondary" @click="exportToGitee" :disabled="giteeSyncProgress">
            {{ giteeSyncProgress ? giteeSyncProgress.phase : '导出' }}
          </button>
        </div>

        <div v-if="hasGiteeSyncConfig" class="setting-item">
          <div class="setting-info">
            <h3>从 Gitee 导入</h3>
            <p>从 Gitee 仓库导入联系人和消息</p>
          </div>
          <button class="btn btn-secondary" @click="showGiteeImportModal = true" :disabled="giteeSyncProgress">
            选择导入
          </button>
        </div>

        <!-- 导入进度 -->
        <div v-if="giteeSyncProgress" class="sync-progress">
          <p>{{ giteeSyncProgress.phase }}</p>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${(giteeSyncProgress.current / giteeSyncProgress.total) * 100}%` }"></div>
          </div>
          <p class="progress-text">{{ giteeSyncProgress.current }} / {{ giteeSyncProgress.total }}</p>
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

    <!-- Gitee 同步配置模态框 -->
    <div v-if="showGiteeSyncModal" class="modal-overlay" @click.self="showGiteeSyncModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Gitee 同步配置</h2>
          <button class="modal-close" @click="showGiteeSyncModal = false">&times;</button>
        </div>

        <div class="webdav-help">
          <p>配置 Gitee 个人访问令牌以同步联系人和消息到 Gitee 仓库。</p>
          <p>在 Gitee <a href="https://gitee.com/profile/personal_access_tokens" target="_blank">个人设置</a> 中创建 Token。</p>
        </div>
        
        <form @submit.prevent="saveGiteeSyncConfig">
          <div class="form-group">
            <label>Gitee Token</label>
            <input 
              v-model="giteeSyncForm.token" 
              type="password" 
              placeholder="输入您的 Gitee 个人访问令牌"
            />
            <small style="color: var(--text-secondary);">需要 projects 权限</small>
          </div>
          
          <div class="form-group">
            <label>仓库地址</label>
            <input 
              v-model="giteeSyncForm.repo" 
              type="text" 
              placeholder="weijia/my-data"
            />
            <small style="color: var(--text-secondary);">格式：用户名/仓库名</small>
          </div>
          
          <div class="form-group">
            <label>同步路径</label>
            <input 
              v-model="giteeSyncForm.path" 
              type="text" 
              placeholder="data/universal-pim/"
            />
            <small style="color: var(--text-secondary);">仓库中的目录路径（默认 data/universal-pim/）</small>
          </div>

          <div class="form-group">
            <label>分支</label>
            <input 
              v-model="giteeSyncForm.branch" 
              type="text" 
              placeholder="master"
            />
            <small style="color: var(--text-secondary);">默认为 master</small>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showGiteeSyncModal = false">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Gitee 导入选择模态框 -->
    <div v-if="showGiteeImportModal" class="modal-overlay" @click.self="showGiteeImportModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">从 Gitee 导入</h2>
          <button class="modal-close" @click="showGiteeImportModal = false">&times;</button>
        </div>

        <div v-if="remoteOverview" class="import-info">
          <p>远程数据概览：</p>
          <ul>
            <li>联系人：{{ remoteOverview.stats?.contacts || 0 }} 条</li>
            <li>消息：{{ remoteOverview.stats?.messages || 0 }} 条</li>
            <li>年份：{{ remoteOverview.stats?.years?.join(', ') || '无' }}</li>
          </ul>
        </div>

        <form @submit.prevent="importFromGitee">
          <div class="form-group">
            <label>导入联系人</label>
            <label class="toggle">
              <input type="checkbox" v-model="giteeImportForm.importContacts" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label>选择年份（消息）</label>
            <div class="year-checkboxes">
              <label v-for="year in availableYears" :key="year" class="checkbox-label">
                <input type="checkbox" v-model="giteeImportForm.selectedYears" :value="year" />
                {{ year }}
              </label>
            </div>
            <small style="color: var(--text-secondary);">勾选要导入消息的年份</small>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showGiteeImportModal = false">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="giteeSyncProgress">
              {{ giteeSyncProgress ? '导入中...' : '开始导入' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 重命名标签模态框 -->
    <div v-if="showRenameTagModal" class="modal-overlay" @click.self="showRenameTagModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">重命名标签</h2>
          <button class="modal-close" @click="showRenameTagModal = false">&times;</button>
        </div>

        <form @submit.prevent="renameTag">
          <div class="form-group">
            <label>原标签名</label>
            <input type="text" :value="editingTagName" disabled />
          </div>
          
          <div class="form-group">
            <label>新标签名</label>
            <input v-model="newTagName" type="text" placeholder="输入新的标签名" />
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showRenameTagModal = false">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!newTagName || newTagName === editingTagName">
              确认重命名
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 合并标签模态框 -->
    <div v-if="showMergeTagModal" class="modal-overlay" @click.self="showMergeTagModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">合并标签</h2>
          <button class="modal-close" @click="showMergeTagModal = false">&times;</button>
        </div>

        <div class="merge-info">
          <p>将标签 <strong>{{ mergingTagName }}</strong> 合并到：</p>
        </div>

        <form @submit.prevent="mergeTag">
          <div class="form-group">
            <label>目标标签</label>
            <select v-model="targetTagName" required>
              <option value="">请选择目标标签</option>
              <option v-for="tag in allTags.filter(t => t.name !== mergingTagName)" :key="tag.name" :value="tag.name">
                {{ tag.name }} ({{ tag.count }} 人)
              </option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showMergeTagModal = false">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!targetTagName">
              确认合并
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
import { giteeSyncService } from '../services/giteeSyncService'
import { db } from '../services/db'
import { useContactStore } from '../stores/contactStore'
import { useMessageStore } from '../stores/messageStore'

// 版本信息 - 构建时会自动替换
const versionInfo = {
  tag: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.0',
  hash: typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'unknown',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toLocaleString('zh-CN')
}

const contactStore = useContactStore()
const messageStore = useMessageStore()

const showWebDAVModal = ref(false)
const showGiteeSyncModal = ref(false)
const showGiteeImportModal = ref(false)
const showRenameTagModal = ref(false)
const showMergeTagModal = ref(false)
const testing = ref(false)
const syncing = ref(false)
const saving = ref(false)
const giteePushing = ref(false)
const giteeSyncProgress = ref(null)
const lastSyncTime = ref(null)
const syncError = ref(null)
const remoteOverview = ref(null)
const availableYears = ref([])
const webdavConfig = ref({ url: '', username: '', password: '', enabled: false, syncPath: '/app_data/universal-pim' })

const giteeSyncConfig = ref({ token: '', repo: '', path: 'data/universal-pim/', branch: 'master' })

const webdavForm = ref({
  enabled: false,
  url: '',
  username: '',
  password: '',
  syncPath: '/app_data/universal-pim'
})

const giteeSyncForm = ref({
  token: '',
  repo: '',
  path: 'data/universal-pim/',
  branch: 'master'
})

const giteeImportForm = ref({
  importContacts: true,
  selectedYears: []
})

// 标签管理相关
const editingTagName = ref('')
const newTagName = ref('')
const mergingTagName = ref('')
const targetTagName = ref('')

const hasWebDAVConfig = computed(() =>
  webdavConfig.value.url && webdavConfig.value.url.trim() !== ''
)

const hasGiteeSyncConfig = computed(() =>
  giteeSyncConfig.value.token && giteeSyncConfig.value.token.trim() !== '' &&
  giteeSyncConfig.value.repo && giteeSyncConfig.value.repo.trim() !== ''
)

// 所有标签（带计数）
const allTags = computed(() => {
  const tagCount = new Map()
  contactStore.contacts.forEach(contact => {
    if (contact.tags && Array.isArray(contact.tags)) {
      contact.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1)
      })
    }
  })
  return Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

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
  // 确保 db 已初始化
  await db.init()
  
  webdavConfig.value = await syncService.getWebDAVConfig()
  
  // 加载 Gitee 同步配置
  console.log('[Settings] Loading Gitee sync config...')
  const giteeSyncCfg = await giteeSyncService.getGiteeConfig(db)
  console.log('[Settings] Gitee sync config loaded:', giteeSyncCfg)
  giteeSyncConfig.value = giteeSyncCfg
  
  // 如果已配置，获取远程数据概览
  if (giteeSyncCfg.token && giteeSyncCfg.repo) {
    try {
      remoteOverview.value = await giteeSyncService.getRemoteOverview(giteeSyncCfg)
      if (remoteOverview.value?.stats?.years) {
        availableYears.value = remoteOverview.value.stats.years
      } else {
        // 尝试获取可用年份
        availableYears.value = await giteeSyncService.getAvailableYears(giteeSyncCfg)
      }
    } catch (e) {
      console.log('[Settings] Failed to get remote overview:', e.message)
    }
  }
  
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

function openGiteeSyncModal() {
  giteeSyncForm.value = {
    token: giteeSyncConfig.value.token || '',
    repo: giteeSyncConfig.value.repo || '',
    path: giteeSyncConfig.value.path || 'data/universal-pim/',
    branch: giteeSyncConfig.value.branch || 'master'
  }
  showGiteeSyncModal.value = true
}

async function saveGiteeSyncConfig() {
  saving.value = true
  try {
    console.log('[Settings] Saving Gitee sync config:', giteeSyncForm.value)
    await giteeSyncService.saveGiteeConfig(db, giteeSyncForm.value)
    console.log('[Settings] Gitee sync config saved')
    giteeSyncConfig.value = { ...giteeSyncForm.value }
    showGiteeSyncModal.value = false
    
    // 保存后获取远程数据概览
    try {
      remoteOverview.value = await giteeSyncService.getRemoteOverview(giteeSyncConfig.value)
      availableYears.value = await giteeSyncService.getAvailableYears(giteeSyncConfig.value)
    } catch (e) {
      console.log('[Settings] Failed to get remote overview:', e.message)
    }
  } finally {
    saving.value = false
  }
}

async function exportToGitee() {
  giteeSyncProgress.value = { phase: '开始导出', current: 0, total: 1 }
  
  try {
    // 导出联系人
    giteeSyncProgress.value = { phase: '导出联系人', current: 0, total: 2 }
    const contactsResult = await giteeSyncService.exportContacts(db, giteeSyncConfig.value, (p) => {
      giteeSyncProgress.value = { ...p, total: 2 }
    })
    
    // 导出消息（按年/月）
    giteeSyncProgress.value = { phase: '导出消息', current: 1, total: 2 }
    const messagesResult = await giteeSyncService.exportMessages(db, giteeSyncConfig.value, (p) => {
      giteeSyncProgress.value = { ...p, current: 1 + p.current, total: 2 + p.total }
    })
    
    // 导出元数据
    giteeSyncProgress.value = { phase: '导出元数据', current: 2, total: 2 }
    await giteeSyncService.exportMetadata(db, giteeSyncConfig.value, {
      contacts: contactsResult.count,
      messages: messagesResult.count,
      years: Array.from(new Set(
        (await db.getAllMessages()).map(m => new Date(m.timestamp).getFullYear().toString())
      ))
    })
    
    giteeSyncProgress.value = null
    alert(`导出成功！\n联系人：${contactsResult.count} 条\n消息：${messagesResult.count} 条（${messagesResult.files} 个文件）`)
    
    // 更新远程数据概览
    remoteOverview.value = await giteeSyncService.getRemoteOverview(giteeSyncConfig.value)
    availableYears.value = await giteeSyncService.getAvailableYears(giteeSyncConfig.value)
  } catch (e) {
    giteeSyncProgress.value = null
    alert(`导出失败：${e.message}`)
  }
}

async function importFromGitee() {
  giteeSyncProgress.value = { phase: '开始导入', current: 0, total: 1 }
  
  try {
    let importedContacts = 0
    let skippedContacts = 0
    let importedMessages = 0
    let skippedMessages = 0
    
    // 导入联系人
    if (giteeImportForm.value.importContacts) {
      giteeSyncProgress.value = { phase: '导入联系人', current: 0, total: 2 }
      const contactsResult = await giteeSyncService.importContacts(db, giteeSyncConfig.value, (p) => {
        giteeSyncProgress.value = { ...p, total: 2 }
      })
      importedContacts = contactsResult.imported
      skippedContacts = contactsResult.skipped
    }
    
    // 导入消息
    if (giteeImportForm.value.selectedYears.length > 0) {
      giteeSyncProgress.value = { phase: '导入消息', current: 1, total: 2 }
      const messagesResult = await giteeSyncService.importMessages(
        db, 
        giteeSyncConfig.value, 
        giteeImportForm.value.selectedYears,
        null,
        (p) => {
          giteeSyncProgress.value = { ...p, current: 1 + p.current, total: 2 + p.total }
        }
      )
      importedMessages = messagesResult.imported
      skippedMessages = messagesResult.skipped
    }
    
    giteeSyncProgress.value = null
    showGiteeImportModal.value = false
    
    // 刷新本地数据
    await contactStore.init()
    await messageStore.init()
    
    alert(`导入成功！\n联系人：导入 ${importedContacts} 条，跳过 ${skippedContacts} 条\n消息：导入 ${importedMessages} 条，跳过 ${skippedMessages} 条`)
  } catch (e) {
    giteeSyncProgress.value = null
    alert(`导入失败：${e.message}`)
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

// 标签管理函数
function openRenameTagModal(tagName) {
  editingTagName.value = tagName
  newTagName.value = tagName
  showRenameTagModal.value = true
}

function openMergeTagModal(tagName) {
  mergingTagName.value = tagName
  targetTagName.value = ''
  showMergeTagModal.value = true
}

async function renameTag() {
  if (!newTagName.value || newTagName.value === editingTagName.value) return
  
  const oldName = editingTagName.value
  const newName = newTagName.value.trim()
  
  if (!confirm(`确定将标签"${oldName}"重命名为"${newName}"吗？\n这将更新所有使用该标签的联系人。`)) {
    return
  }
  
  let updatedCount = 0
  for (const contact of contactStore.contacts) {
    if (contact.tags && contact.tags.includes(oldName)) {
      // 替换标签名
      const newTags = contact.tags.map(t => t === oldName ? newName : t)
      await contactStore.updateContact({ ...contact, tags: newTags })
      updatedCount++
    }
  }
  
  showRenameTagModal.value = false
  alert(`已将 ${updatedCount} 个联系人的标签"${oldName}"重命名为"${newName}"`)
}

async function mergeTag() {
  if (!targetTagName.value) return
  
  const sourceTag = mergingTagName.value
  const targetTag = targetTagName.value
  
  if (!confirm(`确定将标签"${sourceTag}"合并到"${targetTag}"吗？\n所有使用"${sourceTag}"的联系人将改用"${targetTag}"。`)) {
    return
  }
  
  let updatedCount = 0
  for (const contact of contactStore.contacts) {
    if (contact.tags && contact.tags.includes(sourceTag)) {
      // 移除源标签，添加目标标签（如果不存在）
      const newTags = contact.tags.filter(t => t !== sourceTag)
      if (!newTags.includes(targetTag)) {
        newTags.push(targetTag)
      }
      await contactStore.updateContact({ ...contact, tags: newTags })
      updatedCount++
    }
  }
  
  showMergeTagModal.value = false
  alert(`已将 ${updatedCount} 个联系人的标签"${sourceTag}"合并到"${targetTag}"`)
}

async function confirmDeleteTag(tagName) {
  const count = allTags.value.find(t => t.name === tagName)?.count || 0
  
  if (!confirm(`确定删除标签"${tagName}"吗？\n这将移除 ${count} 个联系人的该标签。`)) {
    return
  }
  
  let updatedCount = 0
  for (const contact of contactStore.contacts) {
    if (contact.tags && contact.tags.includes(tagName)) {
      const newTags = contact.tags.filter(t => t !== tagName)
      await contactStore.updateContact({ ...contact, tags: newTags })
      updatedCount++
    }
  }
  
  alert(`已从 ${updatedCount} 个联系人移除标签"${tagName}"`)
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

.sync-progress {
  margin-top: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.year-checkboxes {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 6px;
  cursor: pointer;
}

.checkbox-label:hover {
  background: #f1f5f9;
}

.import-info {
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 16px;
}

.import-info ul {
  margin: 8px 0;
  padding-left: 20px;
}

.import-info li {
  margin: 4px 0;
}

/* 标签管理 */
.tag-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tag-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tag-name {
  font-weight: 500;
}

.tag-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.tag-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 4px 12px;
  font-size: 13px;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.merge-info {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 16px;
}
</style>
