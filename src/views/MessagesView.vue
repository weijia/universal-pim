<template>
  <div>
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h1 style="font-size: 28px; font-weight: 700;">消息</h1>
      <nav style="display: flex; gap: 16px;">
        <router-link to="/" class="nav-link">通讯录</router-link>
        <router-link to="/messages" class="nav-link">消息</router-link>
        <router-link to="/settings" class="nav-link">设置</router-link>
      </nav>
    </header>

    <div class="search-box">
      <input 
        v-model="messageStore.searchQuery" 
        type="text" 
        placeholder="搜索消息内容..."
      />
    </div>

    <div class="filter-bar">
      <select v-model="messageStore.filterContact" @change="onFilterChange">
        <option value="">所有联系人</option>
        <option v-for="contact in contacts" :key="contact._id" :value="contact._id">
          {{ contact.name }}
        </option>
      </select>
      
      <select v-model="messageStore.filterChannel" @change="onFilterChange">
        <option value="">所有渠道</option>
        <option v-for="channel in messageStore.channels" :key="channel" :value="channel">
          {{ channel }}
        </option>
      </select>

      <button 
        class="btn btn-secondary" 
        @click="contactStore.toggleCompactMode()"
        :title="contactStore.compactMode ? '切换为标准模式' : '切换为紧凑模式'"
      >
        {{ contactStore.compactMode ? '⊞ 标准' : '⊟ 紧凑' }}
      </button>

      <label class="btn btn-secondary import-btn" title="导入短信备份 JSON/NDJSON/CSV 格式">
        📥 导入短信
        <input type="file" accept=".json,.ndjson,.txt,.csv" @change="importSmsBackup" style="display: none;" />
      </label>

      <button 
        v-if="hasActiveFilters" 
        class="btn btn-secondary" 
        @click="clearFilters"
      >
        清除过滤
      </button>
    </div>

    <!-- 导入结果提示 -->
    <div v-if="importResult" class="import-result" :class="importResult.type">
      <div class="import-result-header">
        <span>{{ importResult.type === 'success' ? '✅' : '⚠️' }}</span>
        <button class="btn-icon" @click="importResult = null" style="margin-left: auto;">&times;</button>
      </div>
      <p>{{ importResult.message }}</p>
      <div v-if="importResult.skipped.length" class="skipped-details">
        <button class="btn btn-secondary btn-sm" @click="showSkipped = !showSkipped">
          {{ showSkipped ? '收起' : '查看' }}跳过详情 ({{ importResult.skipped.length }}条)
        </button>
        <div v-if="showSkipped" class="skipped-list">
          <div v-for="(item, idx) in importResult.skipped" :key="idx" class="skipped-item">
            <span class="skipped-id">#{{ item.index + 1 }}</span>
            <span class="skipped-reason">{{ item.reason }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="message-list" :class="{ compact: contactStore.compactMode }">
      <div v-if="messageStore.loading" class="empty-state">
        加载中...
      </div>
      
      <div v-else-if="messageStore.filteredMessages.length === 0" class="empty-state">
        <div class="empty-state-icon">💬</div>
        <p>{{ hasActiveFilters ? '没有符合条件的消息' : '暂无消息记录' }}</p>
      </div>

      <template v-else>
        <!-- 按日期分组显示 -->
        <div v-for="(group, date) in groupedByDate" :key="date" class="message-date-group">
          <div class="date-header">{{ date }}</div>
          
          <div class="message-group-list" :class="{ compact: contactStore.compactMode }">
            <div v-for="msg in group" :key="msg._id" class="message-item" :class="{ compact: contactStore.compactMode }">
              <div class="message-header">
                <div class="message-sender">
                  <span class="channel-badge" :class="getChannelClass(msg.channel)">
                    {{ msg.channel }}
                  </span>
                  <router-link 
                    v-if="msg.contactId" 
                    :to="`/contact/${msg.contactId}`"
                    class="contact-link"
                  >
                    {{ msg.contactName || '未知联系人' }}
                  </router-link>
                  <span v-else class="contact-link">{{ msg.contactName || '未知联系人' }}</span>
                </div>
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div v-if="!contactStore.compactMode" class="message-content">{{ msg.content }}</div>
              <div v-else class="message-content-compact">{{ msg.content }}</div>
              <div v-if="!contactStore.compactMode" class="message-actions">
                <button class="btn-icon" @click="deleteMessage(msg)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 统计信息 -->
    <div v-if="messageStore.filteredMessages.length > 0" class="stats-bar">
      <span>共 {{ messageStore.filteredMessages.length }} 条消息</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'

const messageStore = useMessageStore()
const contactStore = useContactStore()

const contacts = computed(() => contactStore.contacts)

const importResult = ref(null)
const showSkipped = ref(false)

const hasActiveFilters = computed(() => 
  messageStore.filterContact || messageStore.filterChannel || messageStore.searchQuery
)

// 短信备份 JSON 的必需字段
const REQUIRED_FIELDS = ['_id', 'address', 'date', 'body']
// 允许的已知字段（必需 + 可选）
const KNOWN_FIELDS = [
  '_id', 'thread_id', 'address', 'date', 'date_sent', 'protocol',
  'read', 'status', 'type', 'reply_path_present', 'body',
  'service_center', 'locked', 'error_code', 'seen', 'timed',
  'deleted', 'sync_state', 'marker', 'bind_id', 'mx_status',
  'out_time', 'sim_id', 'block_type', 'advanced_seen', 'b2c_ttl',
  'fake_cell_type', 'url_risky_type', 'favorite_date', 'sub_id'
]

// CSV 字段映射（QQ 同步助手格式）
const CSV_FIELD_MAP = {
  '内容': 'body',
  '对方名字': 'name',
  '对方手机': 'address',
  '发送时间': 'date',
  '类型': 'type'
}
// CSV 允许的字段
const CSV_KNOWN_FIELDS = ['内容', '对方名字', '对方手机', '发送时间', '类型']

// 解析 CSV 行（处理引号内的逗号）
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 转义的引号
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// 解析 CSV 文件
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], records: [] }
  
  // 解析表头
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
  
  // 检查未知字段
  const unknownFields = headers.filter(h => !CSV_KNOWN_FIELDS.includes(h))
  if (unknownFields.length > 0) {
    throw new Error(`CSV 包含未知字段: "${unknownFields.join('", "')}"`)
  }
  
  // 解析记录
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''))
    const record = {}
    headers.forEach((header, index) => {
      record[header] = values[index] || ''
    })
    records.push(record)
  }
  
  return { headers, records }
}

// 将 CSV 记录转换为标准短信格式
function convertCSVRecord(record, index) {
  // 检查必需字段
  if (!record['内容'] || record['内容'].trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 行: 内容为空` }
  }
  if (!record['对方手机'] || record['对方手机'].trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 行: 对方手机为空` }
  }
  if (!record['发送时间'] || record['发送时间'].trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 行: 发送时间为空` }
  }
  
  // 解析时间（格式: 2016/11/01 14:23:02）
  const timeMatch = record['发送时间'].match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (!timeMatch) {
    return { valid: false, reason: `第 ${index + 1} 行: 发送时间格式不正确，应为 "YYYY/MM/DD HH:MM:SS"` }
  }
  
  const [, year, month, day, hour, minute, second] = timeMatch
  const date = new Date(year, month - 1, day, hour, minute, second)
  const timestamp = date.getTime()
  
  if (isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, reason: `第 ${index + 1} 行: 发送时间无效` }
  }
  
  // 判断方向
  const direction = record['类型'] === '发件箱' ? 'sent' : 'received'
  
  return {
    valid: true,
    record: {
      _id: `csv_${timestamp}_${index}`,
      address: record['对方手机'],
      date: String(timestamp),
      body: record['内容'],
      type: direction === 'sent' ? '2' : '1',
      _source: 'csv'
    }
  }
}

// 校验单条短信记录
function validateSmsRecord(record, index) {
  const errors = []
  
  // 必须是对象
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { valid: false, reason: `第 ${index + 1} 条记录不是有效的 JSON 对象` }
  }
  
  // 检查必需字段
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      errors.push(`缺少必需字段 "${field}"`)
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, reason: `第 ${index + 1} 条: ${errors.join('; ')}` }
  }
  
  // 检查未知字段（CSV 导入的记录跳过此检查）
  if (!record._source) {
    const recordKeys = Object.keys(record)
    const unknownFields = recordKeys.filter(k => !KNOWN_FIELDS.includes(k) && k !== '_source')
    if (unknownFields.length > 0) {
      return { valid: false, reason: `第 ${index + 1} 条: 包含未知字段 "${unknownFields.join('", "')}"` }
    }
  }
  
  // 检查 body 不为空
  if (!record.body || typeof record.body !== 'string' || record.body.trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 条: body 为空或不是字符串` }
  }
  
  // 检查 date 是有效时间戳（毫秒级数字字符串）
  const dateNum = Number(record.date)
  if (isNaN(dateNum) || dateNum < 0) {
    return { valid: false, reason: `第 ${index + 1} 条: date "${record.date}" 不是有效的时间戳` }
  }
  
  // 检查 address 不为空
  if (!record.address || typeof record.address !== 'string' || record.address.trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 条: address 为空或不是字符串` }
  }
  
  return { valid: true }
}

// 导入短信备份
async function importSmsBackup(event) {
  const file = event.target.files[0]
  if (!file) return
  
  importResult.value = null
  showSkipped.value = false
  
  try {
    const text = await file.text()
    let data = []
    const parseSkipped = [] // 解析阶段跳过的行
    let importType = ''
    
    // 检测文件类型
    const fileExt = file.name.toLowerCase().split('.').pop()
    const isCSV = fileExt === 'csv' || text.includes('内容","对方名字","对方手机","发送时间","类型"')
    
    if (isCSV) {
      // CSV 格式导入
      importType = 'CSV'
      try {
        const { headers, records } = parseCSV(text)
        
        // 转换 CSV 记录
        for (let i = 0; i < records.length; i++) {
          const result = convertCSVRecord(records[i], i)
          if (result.valid) {
            data.push(result.record)
          } else {
            parseSkipped.push({ index: i, reason: result.reason })
          }
        }
      } catch (e) {
        importResult.value = {
          type: 'error',
          message: `CSV 解析失败：${e.message}`,
          skipped: []
        }
        event.target.value = ''
        return
      }
    } else {
      // JSON/NDJSON 格式导入
      importType = 'JSON'
      
      // 尝试解析为 JSON
      // 先检查是否是 NDJSON 格式（每行一个 JSON 对象）
      const trimmedText = text.trim()
      
      if (trimmedText.includes('\n') || trimmedText.includes('\r')) {
        // 可能是 NDJSON 格式 - 按行解析，跳过无效行（如 MMS 多媒体数据）
        const lines = trimmedText.split(/\r?\n/).filter(line => line.trim())
        const parsedLines = []
        let jsonLineCount = 0
        let invalidLineCount = 0
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          try {
            const parsed = JSON.parse(line)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              parsedLines.push(parsed)
              jsonLineCount++
            } else {
              // 不是对象（可能是数组或其他类型），跳过
              invalidLineCount++
              parseSkipped.push({ index: i, reason: `第 ${i + 1} 行: 不是有效的 JSON 对象（可能是 MMS 多媒体数据）` })
            }
          } catch (e) {
            // 该行 JSON 解析失败，可能是 MMS 多媒体数据，跳过
            invalidLineCount++
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 行: JSON 解析失败 - ${e.message}` })
          }
        }
        
        // 如果大部分行都能解析为 JSON，认为是 NDJSON 格式
        if (jsonLineCount > 0) {
          data = parsedLines
          if (invalidLineCount > 0) {
            console.log(`[Import] NDJSON: ${jsonLineCount} 条有效, ${invalidLineCount} 条跳过`)
          }
        }
      }
      
      // 如果不是 NDJSON，尝试标准 JSON
      if (data.length === 0) {
        try {
          const parsed = JSON.parse(text)
          
          if (Array.isArray(parsed)) {
            data = parsed
          } else if (parsed && typeof parsed === 'object') {
            // 支持包裹在对象中的数组
            if (parsed.messages && Array.isArray(parsed.messages)) {
              data = parsed.messages
            } else if (parsed.sms && Array.isArray(parsed.sms)) {
              data = parsed.sms
            } else {
              importResult.value = {
                type: 'error',
                message: 'JSON 格式不正确：需要数组，或包含 "messages"/"sms" 数组的对象',
                skipped: []
              }
              event.target.value = ''
              return
            }
          } else {
            importResult.value = {
              type: 'error',
              message: 'JSON 格式不正确：需要数组或 NDJSON 格式',
              skipped: []
            }
            event.target.value = ''
            return
          }
        } catch (e) {
          importResult.value = {
            type: 'error',
            message: `JSON 解析失败：${e.message}`,
            skipped: []
          }
          event.target.value = ''
          return
        }
      }
    }
    
    if (data.length === 0) {
      importResult.value = {
        type: 'error',
        message: parseSkipped.length > 0 
          ? `没有可导入的短信记录。${parseSkipped.length} 行无法解析`
          : '文件中没有可导入的消息记录',
        skipped: parseSkipped
      }
      event.target.value = ''
      return
    }
    
    // 校验所有记录（CSV 导入的已在转换时校验，这里跳过）
    const skipped = [...parseSkipped]
    const validRecords = []
    
    data.forEach((record, index) => {
      if (record._source === 'csv') {
        // CSV 记录已经校验过
        validRecords.push(record)
      } else {
        const result = validateSmsRecord(record, index)
        if (result.valid) {
          validRecords.push(record)
        } else {
          skipped.push({ index, reason: result.reason })
        }
      }
    })
    
    if (validRecords.length === 0) {
      importResult.value = {
        type: 'error',
        message: `共 ${data.length} 条记录，全部校验失败，没有可导入的消息`,
        skipped
      }
      event.target.value = ''
      return
    }
    
    // 确认导入
    const confirmMsg = skipped.length > 0
      ? `共 ${data.length} 条记录，${validRecords.length} 条有效，${skipped.length} 条将被跳过。是否导入有效的 ${validRecords.length} 条消息？`
      : `共 ${data.length} 条记录，全部校验通过。是否导入？`
    
    if (!confirm(confirmMsg)) {
      importResult.value = null
      event.target.value = ''
      return
    }
    
    // 导入有效记录
    let imported = 0
    for (const record of validRecords) {
      // 检查是否已存在（通过 _id 前缀判断）
      const existingId = record._id.startsWith('csv_') ? record._id : `sms_${record._id}`
      const dateNum = Number(record.date)
      const timestamp = new Date(dateNum).toISOString()
      
      // 判断方向：type=1 通常是接收，type=2 通常是发送
      const direction = record.type === '2' ? 'sent' : 'received'
      
      await messageStore.addMessage({
        _id: existingId,
        contactId: '',
        contactName: record.address,
        channel: '短信',
        direction,
        timestamp,
        content: record.body,
        // 保留原始数据引用
        sourceAddress: record.address,
        sourceType: record.type,
        sourceRead: record.read
      })
      imported++
    }
    
    importResult.value = {
      type: 'success',
      message: `成功导入 ${imported} 条${importType}短信消息` + (skipped.length > 0 ? `，跳过 ${skipped.length} 条` : ''),
      skipped
    }
    
  } catch (error) {
    importResult.value = {
      type: 'error',
      message: `导入失败：${error.message}`,
      skipped: []
    }
  }
  
  event.target.value = ''
}

// 按日期分组
const groupedByDate = computed(() => {
  const groups = {}
  
  messageStore.filteredMessages.forEach(msg => {
    const date = new Date(msg.timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
    
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(msg)
  })
  
  return groups
})

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getChannelClass(channel) {
  const classMap = {
    '短信': 'channel-sms',
    '微信': 'channel-wechat',
    'WhatsApp': 'channel-whatsapp',
    'Telegram': 'channel-telegram',
    'Email': 'channel-email'
  }
  return classMap[channel] || 'channel-default'
}

function onFilterChange() {
  // 过滤器已通过 v-model 双向绑定自动更新
}

function clearFilters() {
  messageStore.clearFilters()
}

async function deleteMessage(msg) {
  if (confirm('确定要删除这条消息吗？')) {
    await messageStore.deleteMessage(msg._id)
  }
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

.import-btn {
  cursor: pointer;
}

.message-date-group {
  margin-bottom: 24px;
}

.date-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

.message-group-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-group-list.compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

@media (min-width: 1200px) {
  .message-group-list.compact {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1600px) {
  .message-group-list.compact {
    grid-template-columns: repeat(3, 1fr);
  }
}

.message-item {
  padding: 16px;
  background: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.message-item.compact {
  padding: 10px 12px;
}

.message-sender {
  display: flex;
  align-items: center;
  gap: 8px;
}

.channel-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.channel-sms { background: #e0f2fe; color: #0369a1; }
.channel-wechat { background: #dcfce7; color: #16a34a; }
.channel-whatsapp { background: #dcfce7; color: #16a34a; }
.channel-telegram { background: #dbeafe; color: #2563eb; }
.channel-email { background: #fef3c7; color: #d97706; }
.channel-default { background: var(--border); color: var(--text); }

.contact-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.contact-link:hover {
  text-decoration: underline;
}

.message-time {
  font-size: 13px;
  color: var(--text-secondary);
}

.message-content-compact {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-item:hover .message-actions {
  opacity: 1;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 16px;
}

.btn-icon:hover {
  background: var(--border);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.stats-bar {
  margin-top: 20px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}

/* 导入结果提示 */
.import-result {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 12px;
  font-size: 14px;
}

.import-result.success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.import-result.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.import-result-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  margin-bottom: 6px;
}

.skipped-details {
  margin-top: 10px;
}

.skipped-list {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skipped-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  background: rgba(0,0,0,0.04);
  border-radius: 4px;
}

.skipped-id {
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-secondary);
}

.skipped-reason {
  color: var(--text);
}
</style>
