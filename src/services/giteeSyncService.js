/**
 * Gitee 同步服务
 * 用于导出/导入联系人和消息到 Gitee 仓库
 */

const GITEE_API_BASE = 'https://gitee.com/api/v5'

/**
 * 获取 Gitee 配置
 */
async function getGiteeConfig(db) {
  return {
    token: await db.getSetting('gitee_sync_token', ''),
    repo: await db.getSetting('gitee_sync_repo', ''),
    branch: await db.getSetting('gitee_sync_branch', 'master'),
    path: await db.getSetting('gitee_sync_path', 'data/universal-pim/')
  }
}

/**
 * 保存 Gitee 配置
 */
async function saveGiteeConfig(db, config) {
  await db.setSetting('gitee_sync_token', config.token)
  await db.setSetting('gitee_sync_repo', config.repo)
  await db.setSetting('gitee_sync_branch', config.branch || 'master')
  await db.setSetting('gitee_sync_path', config.path || 'data/universal-pim/')
}

/**
 * 获取远程文件内容和 sha
 */
async function getRemoteFile(config, filePath) {
  const [owner, repo] = config.repo.split('/')
  const url = `${GITEE_API_BASE}/repos/${owner}/${repo}/contents/${filePath}?ref=${config.branch}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${config.token}`
      }
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return { exists: false, content: null, sha: null }
      }
      throw new Error(`获取文件失败: ${response.status}`)
    }
    
    const data = await response.json()
    // 解码 Base64 内容
    const content = JSON.parse(atob(data.content))
    return { exists: true, content, sha: data.sha }
  } catch (e) {
    if (e.message.includes('404')) {
      return { exists: false, content: null, sha: null }
    }
    throw e
  }
}

/**
 * 创建或更新远程文件
 */
async function upsertRemoteFile(config, filePath, content, sha = null) {
  const [owner, repo] = config.repo.split('/')
  const url = `${GITEE_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`
  
  // 确保目录存在（通过创建 .gitkeep 文件）
  const dirPath = filePath.split('/').slice(0, -1).join('/')
  if (dirPath) {
    await ensureDirectoryExists(config, dirPath)
  }
  
  const body = {
    access_token: config.token,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    message: `更新 Universal-PIM 数据 - ${new Date().toLocaleString('zh-CN')}`,
    branch: config.branch
  }
  
  if (sha) {
    body.sha = sha
  }
  
  const method = sha ? 'PUT' : 'POST'
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || `操作失败: ${response.status}`)
  }
  
  return await response.json()
}

/**
 * 确保目录存在（通过创建 .gitkeep 文件）
 */
async function ensureDirectoryExists(config, dirPath) {
  const [owner, repo] = config.repo.split('/')
  
  // 检查目录是否已存在
  const checkUrl = `${GITEE_API_BASE}/repos/${owner}/${repo}/contents/${dirPath}?ref=${config.branch}`
  try {
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'Authorization': `token ${config.token}`
      }
    })
    if (checkResponse.ok) {
      return // 目录已存在
    }
  } catch (e) {
    // 继续尝试创建
  }
  
  // 创建 .gitkeep 文件来创建目录
  const gitkeepPath = `${dirPath}/.gitkeep`
  const gitkeepUrl = `${GITEE_API_BASE}/repos/${owner}/${repo}/contents/${gitkeepPath}`
  
  const body = {
    access_token: config.token,
    content: btoa(''), // 空内容
    message: `创建目录 ${dirPath}`,
    branch: config.branch
  }
  
  try {
    await fetch(gitkeepUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } catch (e) {
    // 目录创建失败可能是因为已存在，忽略错误
  }
}

/**
 * 获取远程目录列表
 */
async function getRemoteDirectory(config, dirPath) {
  const [owner, repo] = config.repo.split('/')
  const url = `${GITEE_API_BASE}/repos/${owner}/${repo}/contents/${dirPath}?ref=${config.branch}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${config.token}`
      }
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return []
      }
      throw new Error(`获取目录失败: ${response.status}`)
    }
    
    const data = await response.json()
    return data.filter(item => item.type === 'file' || item.type === 'dir')
  } catch (e) {
    if (e.message.includes('404')) {
      return []
    }
    throw e
  }
}

/**
 * 导出联系人到 Gitee
 */
async function exportContacts(db, config, onProgress = null) {
  if (onProgress) onProgress({ phase: '读取联系人', current: 0, total: 1 })
  
  const contacts = await db.getAllContacts()
  const filePath = `${config.path}contacts.json`
  
  const exportData = {
    contacts: contacts.map(c => ({
      _id: c._id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      tags: c.tags,
      archived: c.archived,
      updatedAt: c.updatedAt
    })),
    exportedAt: new Date().toISOString()
  }
  
  if (onProgress) onProgress({ phase: '上传联系人', current: 1, total: 1 })
  
  // 获取现有文件的 sha
  const { sha } = await getRemoteFile(config, filePath)
  
  // 创建或更新文件
  await upsertRemoteFile(config, filePath, exportData, sha)
  
  return { count: contacts.length }
}

/**
 * 导出消息到 Gitee（按年/月分文件）
 */
async function exportMessages(db, config, onProgress = null) {
  const messages = await db.getAllMessages()
  
  // 按年/月分组
  const grouped = {}
  messages.forEach(msg => {
    const date = new Date(msg.timestamp)
    const year = date.getFullYear().toString()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const key = `${year}/${month}`
    
    if (!grouped[key]) {
      grouped[key] = {
        year,
        month,
        messages: []
      }
    }
    
    grouped[key].messages.push({
      _id: msg._id,
      contactId: msg.contactId,
      contactName: msg.contactName,
      channel: msg.channel,
      direction: msg.direction,
      timestamp: msg.timestamp,
      content: msg.content
    })
  })
  
  const keys = Object.keys(grouped)
  const total = keys.length
  
  if (onProgress) onProgress({ phase: '准备导出', current: 0, total })
  
  let exported = 0
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const group = grouped[key]
    const filePath = `${config.path}messages/${group.year}/${group.month}.json`
    
    if (onProgress) onProgress({ 
      phase: `导出 ${group.year}-${group.month}`, 
      current: i + 1, 
      total 
    })
    
    const exportData = {
      messages: group.messages,
      month: `${group.year}-${group.month}`,
      exportedAt: new Date().toISOString()
    }
    
    // 获取现有文件的 sha
    const { sha } = await getRemoteFile(config, filePath)
    
    // 创建或更新文件
    await upsertRemoteFile(config, filePath, exportData, sha)
    
    exported += group.messages.length
  }
  
  return { count: exported, files: total }
}

/**
 * 导出元数据到 Gitee
 */
async function exportMetadata(db, config, stats) {
  const filePath = `${config.path}metadata.json`
  
  const metadata = {
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.0',
    hash: typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'unknown',
    lastExportTime: new Date().toISOString(),
    stats: stats,
    exportedAt: new Date().toISOString()
  }
  
  // 获取现有文件的 sha
  const { sha } = await getRemoteFile(config, filePath)
  
  // 创建或更新文件
  await upsertRemoteFile(config, filePath, metadata, sha)
}

/**
 * 从 Gitee 导入联系人
 */
async function importContacts(db, config, onProgress = null) {
  if (onProgress) onProgress({ phase: '读取远程联系人', current: 0, total: 1 })
  
  const filePath = `${config.path}contacts.json`
  const { exists, content } = await getRemoteFile(config, filePath)
  
  if (!exists || !content || !content.contacts) {
    throw new Error('远程联系人文件不存在或格式错误')
  }
  
  if (onProgress) onProgress({ phase: '导入联系人', current: 1, total: 1 })
  
  // 批量导入联系人
  let imported = 0
  let skipped = 0
  
  for (const contact of content.contacts) {
    // 检查是否已存在
    const existing = await db.getContact(contact._id)
    if (existing) {
      // 如果远程更新时间更新，则更新
      if (contact.updatedAt && existing.updatedAt && 
          new Date(contact.updatedAt) > new Date(existing.updatedAt)) {
        await db.updateContact(contact)
        imported++
      } else {
        skipped++
      }
    } else {
      await db.addContact(contact)
      imported++
    }
  }
  
  return { imported, skipped }
}

/**
 * 从 Gitee 导入消息
 */
async function importMessages(db, config, selectedYears, selectedMonths, onProgress = null) {
  // 获取远程消息目录结构
  const messagesPath = `${config.path}messages/`
  
  // 获取年份目录
  let yearDirs = await getRemoteDirectory(config, messagesPath)
  yearDirs = yearDirs.filter(d => d.type === 'dir').map(d => d.name)
  
  // 如果指定了年份，只处理这些年份
  if (selectedYears && selectedYears.length > 0) {
    yearDirs = yearDirs.filter(y => selectedYears.includes(y))
  }
  
  let totalFiles = 0
  let imported = 0
  let skipped = 0
  
  // 遍历年份目录
  for (const year of yearDirs) {
    const yearPath = `${messagesPath}${year}/`
    let monthFiles = await getRemoteDirectory(config, yearPath)
    monthFiles = monthFiles.filter(f => f.type === 'file' && f.name.endsWith('.json'))
    
    // 如果指定了月份，只处理这些月份
    if (selectedMonths && selectedMonths.length > 0) {
      monthFiles = monthFiles.filter(f => {
        const month = f.name.replace('.json', '')
        return selectedMonths.includes(month)
      })
    }
    
    totalFiles += monthFiles.length
    
    for (const monthFile of monthFiles) {
      const filePath = `${yearPath}${monthFile.name}`
      
      if (onProgress) onProgress({ 
        phase: `导入 ${year}/${monthFile.name.replace('.json', '')}`, 
        current: imported + skipped, 
        total: totalFiles 
      })
      
      const { exists, content } = await getRemoteFile(config, filePath)
      
      if (exists && content && content.messages) {
        for (const msg of content.messages) {
          // 检查是否已存在
          const existing = await db.getMessage(msg._id)
          if (existing) {
            skipped++
          } else {
            await db.addMessage(msg)
            imported++
          }
        }
      }
    }
  }
  
  return { imported, skipped, files: totalFiles }
}

/**
 * 获取远程数据概览
 */
async function getRemoteOverview(config) {
  const filePath = `${config.path}metadata.json`
  const { exists, content } = await getRemoteFile(config, filePath)
  
  if (!exists) {
    return null
  }
  
  return content
}

/**
 * 获取远程可用的年份列表
 */
async function getAvailableYears(config) {
  const messagesPath = `${config.path}messages/`
  const dirs = await getRemoteDirectory(config, messagesPath)
  return dirs.filter(d => d.type === 'dir').map(d => d.name).sort()
}

/**
 * 导出服务对象
 */
export const giteeSyncService = {
  getGiteeConfig,
  saveGiteeConfig,
  exportContacts,
  exportMessages,
  exportMetadata,
  importContacts,
  importMessages,
  getRemoteOverview,
  getAvailableYears
}