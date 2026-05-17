import { sync } from 'universal-sync-v2'
import * as zenFsWebdav from 'zen-fs-webdav'
import { db } from './db'

// 获取 WebDAVFileSystem 创建函数
const createWebDAVFileSystem = zenFsWebdav.createWebDAVFileSystem || zenFsWebdav.default?.createWebDAVFileSystem

// 启用调试日志
const DEBUG = true
function log(...args) {
  if (DEBUG) {
    console.log('[Sync]', ...args)
  }
}

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
    const fsPromises = {
      readFile: async (path) => {
        log('readFile:', path)
        try {
          const result = await this.webdavFs.readFile(path)
          log('readFile success:', path, 'size:', result?.length || 'unknown')
          return result
        } catch (e) {
          log('readFile error:', path, e.message)
          throw e
        }
      },
      writeFile: async (path, data) => {
        log('writeFile:', path, 'size:', data?.length || 'unknown')
        try {
          const result = await this.webdavFs.writeFile(path, data)
          log('writeFile success:', path)
          return result
        } catch (e) {
          log('writeFile error:', path, e.message)
          throw e
        }
      },
      readdir: async (path) => {
        log('readdir:', path)
        try {
          const result = await this.webdavFs.readdir(path)
          log('readdir success:', path, 'count:', result?.length || 'unknown')
          return result
        } catch (e) {
          log('readdir error:', path, e.message)
          throw e
        }
      },
      mkdir: async (path, options) => {
        log('mkdir:', path, options)
        try {
          const result = await this.webdavFs.mkdir(path, options)
          log('mkdir success:', path)
          return result
        } catch (e) {
          log('mkdir error:', path, e.message)
          throw e
        }
      },
      stat: async (path) => {
        log('stat:', path)
        try {
          const result = await this.webdavFs.stat(path)
          log('stat success:', path)
          return result
        } catch (e) {
          log('stat error:', path, e.message)
          throw e
        }
      },
      unlink: async (path) => {
        log('unlink:', path)
        try {
          const result = await this.webdavFs.unlink(path)
          log('unlink success:', path)
          return result
        } catch (e) {
          log('unlink error:', path, e.message)
          throw e
        }
      },
      rmdir: async (path, options) => {
        log('rmdir:', path, options)
        try {
          const result = await this.webdavFs.rmdir(path, options)
          log('rmdir success:', path)
          return result
        } catch (e) {
          log('rmdir error:', path, e.message)
          throw e
        }
      },
      exists: async (path) => {
        log('exists:', path)
        try {
          const result = await this.webdavFs.exists(path)
          log('exists result:', path, result)
          return result
        } catch (e) {
          log('exists error:', path, e.message)
          return false
        }
      },
      copy: async (src, dest) => {
        log('copy:', src, '->', dest)
        try {
          const result = await this.webdavFs.copy(src, dest)
          log('copy success:', src, '->', dest)
          return result
        } catch (e) {
          log('copy error:', src, '->', dest, e.message)
          throw e
        }
      },
    }
    
    return fsPromises
  }

  // 初始化 WebDAV 连接
  async _initWebDAV(config) {
    if (this.webdavFs) return true
    
    try {
      log('Initializing WebDAV connection to:', config.url)
      log('createWebDAVFileSystem type:', typeof createWebDAVFileSystem)
      
      if (typeof createWebDAVFileSystem !== 'function') {
        throw new Error('createWebDAVFileSystem is not a function. Available exports: ' + Object.keys(zenFsWebdav).join(', '))
      }
      
      this.webdavFs = createWebDAVFileSystem({
        baseUrl: config.url,
        username: config.username,
        password: config.password,
      })
      
      // 确保同步目录存在
      log('Creating sync directory:', this._syncPath)
      await this.webdavFs.mkdir(this._syncPath, { recursive: true })
      
      // 检查并清理可能损坏的锁文件
      await this._cleanupLockFile()
      
      log('WebDAV connection initialized successfully')
      return true
    } catch (error) {
      console.error('[Sync] Failed to initialize WebDAV:', error)
      this.lastError = 'WebDAV 连接失败: ' + (error.message || '未知错误')
      this.webdavFs = null
      return false
    }
  }

  // 清理损坏的锁文件
  async _cleanupLockFile() {
    const lockPath = this._syncPath + '/.sync.lock'
    try {
      log('Checking lock file:', lockPath)
      const exists = await this.webdavFs.exists(lockPath)
      if (exists) {
        log('Lock file exists, attempting to read...')
        try {
          const content = await this.webdavFs.readFile(lockPath)
          log('Lock file content:', content?.substring?.(0, 100) || content)
          // 尝试解析 JSON
          JSON.parse(content)
          log('Lock file is valid JSON')
        } catch (e) {
          log('Lock file is corrupted or not JSON, deleting...')
          await this.webdavFs.unlink(lockPath)
          log('Lock file deleted')
        }
      }
    } catch (e) {
      log('Error checking lock file:', e.message)
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
      log('Already syncing, skipping...')
      return false
    }
    
    const config = await this.getWebDAVConfig()
    if (!config.enabled) {
      log('WebDAV sync not enabled')
      return false
    }
    
    if (!config.url) {
      log('WebDAV URL not configured')
      this.lastError = 'WebDAV URL 未配置'
      this.notifyListeners()
      return false
    }

    log('Starting sync with universal-sync-v2...')
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
        log('Syncing', name, 'to', dbPath)
        
        try {
          await sync(instance, fsPromises, dbPath)
          log(name, 'synced successfully')
        } catch (error) {
          console.error('[Sync] Failed to sync', name, ':', error)
          // 如果是锁文件错误，尝试清理后重试一次
          if (error.message?.includes('lock') || error.message?.includes('sync.lock')) {
            log('Lock error detected, attempting cleanup and retry...')
            await this._cleanupLockFile()
            try {
              await sync(instance, fsPromises, dbPath)
              log(name, 'synced successfully after retry')
            } catch (retryError) {
              console.error('[Sync] Retry failed:', retryError)
            }
          }
        }
      }

      this.lastSyncTime = new Date()
      this.isSyncing = false
      this.notifyListeners()
      log('All databases synced successfully!')
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
      log('Testing connection to:', config.url)
      
      if (typeof createWebDAVFileSystem !== 'function') {
        throw new Error('createWebDAVFileSystem is not a function')
      }
      
      this.webdavFs = createWebDAVFileSystem({
        baseUrl: config.url,
        username: config.username,
        password: config.password,
      })

      // 尝试创建并读取目录
      const testPath = this._syncPath
      log('Creating test directory:', testPath)
      await this.webdavFs.mkdir(testPath, { recursive: true })
      const exists = await this.webdavFs.exists(testPath)
      
      log('Directory exists:', exists)

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
