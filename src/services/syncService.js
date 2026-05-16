import { sync } from 'universal-sync-v2'
import { WebDAVFileSystem } from 'zen-fs-webdav'
import { db } from './db'

class SyncService {
  constructor() {
    this.syncTimer = null
    this.isSyncing = false
    this.lastSyncTime = null
    this.listeners = []
    this.lastError = null
    this.webdavFs = null
    this._syncPath = '/universal-pim'
  }

  getLastError() {
    return this.lastError
  }

  clearError() {
    this.lastError = null
  }

  // 获取 zen-fs-webdav 的 fs 接口（适配 universal-sync-v2 需要的 fs.promises 接口）
  _getFsPromises() {
    if (!this.webdavFs) return null
    
    // 适配 zen-fs-webdav 接口为 universal-sync-v2 需要的 fs.promises 格式
    return {
      readFile: (path) => this.webdavFs.readFile(path),
      writeFile: (path, data) => this.webdavFs.writeFile(path, data),
      readdir: (path) => this.webdavFs.readdir(path),
      mkdir: (path, options) => this.webdavFs.mkdir(path, options),
      stat: (path) => this.webdavFs.stat(path),
      unlink: (path) => this.webdavFs.unlink(path),
      rmdir: (path, options) => this.webdavFs.rmdir(path, options),
      exists: (path) => this.webdavFs.exists(path),
      copy: (src, dest) => this.webdavFs.copy(src, dest),
    }
  }

  // 初始化 WebDAV 连接
  async _initWebDAV(config) {
    if (this.webdavFs) return true
    
    try {
      console.log('[Sync] Initializing WebDAV connection to:', config.url)
      
      this.webdavFs = new WebDAVFileSystem({
        baseUrl: config.url,
        username: config.username,
        password: config.password,
      })
      
      // 确保同步目录存在
      await this.webdavFs.mkdir(this._syncPath, { recursive: true })
      
      console.log('[Sync] WebDAV connection initialized successfully')
      return true
    } catch (error) {
      console.error('[Sync] Failed to initialize WebDAV:', error)
      this.lastError = 'WebDAV 连接失败: ' + (error.message || '未知错误')
      this.webdavFs = null
      return false
    }
  }

  // WebDAV配置管理
  async getWebDAVConfig() {
    const url = await db.getSetting('webdav_url', '')
    const username = await db.getSetting('webdav_username', '')
    const password = await db.getSetting('webdav_password', '')
    const enabled = await db.getSetting('webdav_enabled', false)
    const syncPath = await db.getSetting('webdav_sync_path', '/universal-pim')
    
    return { url, username, password, enabled, syncPath }
  }

  async saveWebDAVConfig(config) {
    this.clearError()
    this.webdavFs = null // 重置连接
    await db.setSetting('webdav_url', config.url)
    await db.setSetting('webdav_username', config.username)
    await db.setSetting('webdav_password', config.password)
    await db.setSetting('webdav_enabled', config.enabled)
    await db.setSetting('webdav_sync_path', config.syncPath || '/universal-pim')
    this.notifyListeners()
  }

  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError
    }
  }

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

  startAutoSync(intervalMs = 60000) {
    this.clearError()
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }
    
    this.syncTimer = setInterval(async () => {
      await this.sync()
    }, intervalMs)
    
    this.sync()
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  // 使用 universal-sync-v2 进行增量同步
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

    console.log('[Sync] Starting sync with universal-sync-v2...')
    this.isSyncing = true
    this.notifyListeners()

    try {
      // 初始化 WebDAV 连接
      const initialized = await this._initWebDAV(config)
      if (!initialized) {
        this.isSyncing = false
        this.notifyListeners()
        return false
      }

      this._syncPath = config.syncPath || '/universal-pim'
      const fsPromises = this._getFsPromises()

      // 对每个 PouchDB 数据库进行同步
      const dbs = [
        { name: 'contacts', instance: db.contactsDB },
        { name: 'messages', instance: db.messagesDB },
        { name: 'settings', instance: db.settingsDB }
      ]

      for (const { name, instance } of dbs) {
        if (!instance) continue
        
        const dbPath = this._syncPath + '/' + name
        console.log(`[Sync] Syncing ${name} to ${dbPath}...`)
        
        try {
          await sync(instance, fsPromises, dbPath)
          console.log(`[Sync] ${name} synced successfully`)
        } catch (error) {
          console.error(`[Sync] Failed to sync ${name}:`, error)
          // 继续同步其他数据库
        }
      }

      this.lastSyncTime = new Date()
      this.isSyncing = false
      this.notifyListeners()
      console.log('[Sync] All databases synced successfully!')
      return true
    } catch (error) {
      console.error('[Sync] Error:', error)
      this.lastError = error.message || '同步失败'
      this.isSyncing = false
      this.notifyListeners()
      return false
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
      
      this.webdavFs = new WebDAVFileSystem({
        baseUrl: config.url,
        username: config.username,
        password: config.password,
      })

      // 尝试创建并读取目录
      const testPath = this._syncPath
      await this.webdavFs.mkdir(testPath, { recursive: true })
      const exists = await this.webdavFs.exists(testPath)
      
      console.log('[TestConnection] Directory exists:', exists)

      if (exists) {
        return { success: true, message: '连接成功！服务器响应正常。' }
      }

      return { success: false, message: '无法创建同步目录' }
    } catch (error) {
      console.error('[TestConnection] Error:', error)
      this.lastError = error.message
      return { success: false, message: '连接失败: ' + (error.message || '未知错误') }
    }
  }
}

export const syncService = new SyncService()
export default syncService
