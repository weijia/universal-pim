import { db } from './db'

class SyncService {
  constructor() {
    this.syncTimer = null
    this.isSyncing = false
    this.lastSyncTime = null
    this.listeners = []
    this.lastError = null
  }

  // 获取最后错误
  getLastError() {
    return this.lastError
  }

  // 清除错误
  clearError() {
    this.lastError = null
  }

  // WebDAV配置管理
  async getWebDAVConfig() {
    const url = await db.getSetting('webdav_url', '')
    const username = await db.getSetting('webdav_username', '')
    const password = await db.getSetting('webdav_password', '')
    const enabled = await db.getSetting('webdav_enabled', false)
    
    return { url, username, password, enabled }
  }

  async saveWebDAVConfig(config) {
    this.clearError()
    await db.setSetting('webdav_url', config.url)
    await db.setSetting('webdav_username', config.username)
    await db.setSetting('webdav_password', config.password)
    await db.setSetting('webdav_enabled', config.enabled)
    this.notifyListeners()
  }

  // 同步状态
  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError
    }
  }

  // 添加监听器
  addListener(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  notifyListeners() {
    const status = this.getSyncStatus()
    this.listeners.forEach(l => l(status))
  }

  // 自动同步 (轮询方式，因为浏览器环境无法长期运行)
  startAutoSync(intervalMs = 60000) {
    this.clearError()
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }
    
    this.syncTimer = setInterval(async () => {
      await this.sync()
    }, intervalMs)
    
    // 立即执行一次
    this.sync()
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  // 手动同步
  async sync() {
    this.clearError()
    
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping...')
      return false
    }
    
    const config = await this.getWebDAVConfig()
    if (!config.enabled) {
      console.log('[Sync] WebDAV sync not enabled')
      return false
    }
    
    if (!config.url) {
      console.log('[Sync] WebDAV URL not configured')
      this.lastError = 'WebDAV URL 未配置'
      this.notifyListeners()
      return false
    }

    console.log('[Sync] Starting sync...')
    this.isSyncing = true
    this.notifyListeners()

    try {
      // 导出数据
      console.log('[Sync] Exporting data...')
      const data = await db.exportData()
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      console.log('[Sync] Data exported, size:', jsonStr.length, 'bytes')
      
      // 上传到WebDAV - 使用带认证的请求
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `universal-pim-${timestamp}.json`
      
      // 确保URL格式正确
      let baseUrl = config.url.replace(/\/$/, '')
      
      console.log('[Sync] Uploading to:', baseUrl + '/' + filename)
      
      const headers = {
        'Content-Type': 'application/json'
      }
      
      // 添加认证信息
      if (config.username && config.password) {
        const auth = btoa(config.username + ':' + config.password)
        headers['Authorization'] = 'Basic ' + auth
      }
      
      const response = await fetch(baseUrl + '/' + filename, {
        method: 'PUT',
        headers,
        body: blob
      })

      console.log('[Sync] Upload response status:', response.status, response.statusText)
      
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        let errorText = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorBody = await response.text()
          if (errorBody) errorText += ' - ' + errorBody.substring(0, 200)
        } catch (e) {}
        throw new Error(errorText)
      }

      // 也保存一份最新的备份
      console.log('[Sync] Saving latest backup...')
      const latestResponse = await fetch(baseUrl + '/universal-pim-latest.json', {
        method: 'PUT',
        headers,
        body: blob
      })

      if (!latestResponse.ok && latestResponse.status !== 201 && latestResponse.status !== 204) {
        console.warn('[Sync] Failed to save latest backup:', latestResponse.status)
      }

      this.lastSyncTime = new Date()
      this.isSyncing = false
      this.notifyListeners()
      console.log('[Sync] Completed successfully!')
      return true
    } catch (error) {
      console.error('[Sync] Error:', error)
      this.lastError = error.message || '同步失败'
      this.isSyncing = false
      this.notifyListeners()
      return false
    }
  }

  // 从WebDAV恢复数据
  async restoreFromWebDAV() {
    this.clearError()
    const config = await this.getWebDAVConfig()
    
    if (!config.enabled) {
      return { success: false, message: 'WebDAV 同步未启用' }
    }
    
    if (!config.url) {
      return { success: false, message: 'WebDAV URL 未配置' }
    }

    try {
      console.log('[Restore] Starting restore...')
      
      // 确保URL格式正确
      let baseUrl = config.url.replace(/\/$/, '')
      
      const headers = {}
      if (config.username && config.password) {
        const auth = btoa(config.username + ':' + config.password)
        headers['Authorization'] = 'Basic ' + auth
      }
      
      // 尝试获取最新的备份
      const response = await fetch(baseUrl + '/universal-pim-latest.json', { headers })
      
      console.log('[Restore] Response status:', response.status)
      
      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, message: '服务器上没有找到备份文件' }
        }
        return { success: false, message: `获取备份失败: HTTP ${response.status}` }
      }

      const data = await response.json()
      console.log('[Restore] Data received, contacts:', data.contacts?.length, 'messages:', data.messages?.length)
      
      await db.importData(data)
      
      return { success: true, message: '恢复成功', data }
    } catch (error) {
      console.error('[Restore] Error:', error)
      this.lastError = error.message || '恢复失败'
      return { success: false, message: '恢复失败: ' + (error.message || '未知错误') }
    }
  }

  // 测试WebDAV连接
  async testConnection() {
    this.clearError()
    const config = await this.getWebDAVConfig()
    
    if (!config.url) {
      return { success: false, message: 'URL 未配置' }
    }

    try {
      console.log('[TestConnection] Testing connection to:', config.url)
      
      // 确保URL格式正确
      let testUrl = config.url.replace(/\/$/, '')
      
      const headers = {
        'Depth': '0'
      }
      
      if (config.username && config.password) {
        const auth = btoa(config.username + ':' + config.password)
        headers['Authorization'] = 'Basic ' + auth
      }
      
      const response = await fetch(testUrl, {
        method: 'PROPFIND',
        headers
      })

      console.log('[TestConnection] Response:', response.status)

      if (response.ok || response.status === 207) {
        return { success: true, message: '连接成功！服务器响应正常。' }
      }

      return { success: false, message: `连接失败: HTTP ${response.status} ${response.statusText}` }
    } catch (error) {
      console.error('[TestConnection] Error:', error)
      this.lastError = error.message
      return { success: false, message: '连接失败: ' + (error.message || '未知错误') }
    }
  }
}

export const syncService = new SyncService()
export default syncService
