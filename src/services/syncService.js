import { db } from './db'

class SyncService {
  constructor() {
    this.syncTimer = null
    this.isSyncing = false
    this.lastSyncTime = null
    this.listeners = []
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
      lastSyncTime: this.lastSyncTime
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
    if (this.isSyncing) return false
    
    const config = await this.getWebDAVConfig()
    if (!config.enabled || !config.url) {
      return false
    }

    this.isSyncing = true
    this.notifyListeners()

    try {
      // 导出数据
      const data = await db.exportData()
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      
      // 上传到WebDAV
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `universal-pim-${timestamp}.json`
      
      const response = await fetch(config.url + '/' + filename, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: blob
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      // 也保存一份最新的备份
      await fetch(config.url + '/universal-pim-latest.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: blob
      })

      this.lastSyncTime = new Date()
      this.isSyncing = false
      this.notifyListeners()
      return true
    } catch (error) {
      console.error('Sync failed:', error)
      this.isSyncing = false
      this.notifyListeners()
      return false
    }
  }

  // 从WebDAV恢复数据
  async restoreFromWebDAV() {
    const config = await this.getWebDAVConfig()
    if (!config.enabled || !config.url) {
      return { success: false, message: 'WebDAV not configured' }
    }

    try {
      // 尝试获取最新的备份
      const response = await fetch(config.url + '/universal-pim-latest.json')
      
      if (!response.ok) {
        return { success: false, message: 'No backup found' }
      }

      const data = await response.json()
      await db.importData(data)
      
      return { success: true, message: 'Data restored successfully', data }
    } catch (error) {
      console.error('Restore failed:', error)
      return { success: false, message: error.message }
    }
  }

  // 测试WebDAV连接
  async testConnection() {
    const config = await this.getWebDAVConfig()
    if (!config.url) {
      return { success: false, message: 'URL not configured' }
    }

    try {
      const response = await fetch(config.url, {
        method: 'PROPFIND',
        headers: {
          'Depth': '0'
        }
      })

      if (response.ok || response.status === 207) {
        return { success: true, message: 'Connection successful' }
      }

      return { success: false, message: `Connection failed: ${response.status}` }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }
}

export const syncService = new SyncService()
export default syncService
