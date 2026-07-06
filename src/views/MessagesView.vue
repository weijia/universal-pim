<template>
  <div>
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h1 style="font-size: 28px; font-weight: 700;"><a href="https://github.com/weijia/universal-pim" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;">Universal PIM</a></h1>
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
      <div class="contact-filter">
        <input
          v-model="contactFilterQuery"
          type="text"
          placeholder="搜索联系人..."
          @input="onContactFilterInput"
          @focus="showContactDropdown = true"
        />
        <div v-if="showContactDropdown && filteredContacts.length > 0" class="contact-dropdown">
          <div
            v-for="contact in filteredContacts"
            :key="contact._id"
            class="contact-option"
            @click="selectContact(contact._id)"
          >
            {{ contact.name }} {{ contact.phone ? `(${contact.phone})` : '' }}
          </div>
        </div>
        <button v-if="messageStore.filterContact" class="btn-icon clear-btn" @click="clearContactFilter">&times;</button>
      </div>

      <select v-model="messageStore.filterChannel" @change="onFilterChange">
        <option value="">所有渠道</option>
        <option v-for="channel in messageStore.channels" :key="channel" :value="channel">
          {{ channel }}
        </option>
      </select>

      <select v-model="messageStore.filterYear" @change="onFilterChange">
        <option value="">所有年份</option>
        <option v-for="year in availableYears" :key="year" :value="year">
          {{ year }}
        </option>
      </select>

      <select v-model="messageStore.filterMonth" @change="onFilterChange">
        <option value="">所有月份</option>
        <option v-for="month in availableMonths" :key="month.value" :value="month.value">
          {{ month.label }}
        </option>
      </select>

      <button
        class="btn btn-secondary"
        @click="contactStore.toggleCompactMode()"
        :title="contactStore.compactMode ? '切换为标准模式' : '切换为紧凑模式'"
      >
        {{ contactStore.compactMode ? '⊞ 标准' : '⊟ 紧凑' }}
      </button>

      <button
        class="btn btn-secondary"
        :class="{ active: messageStore.filterActiveContacts }"
        @click="toggleActiveContactsFilter"
        title="只显示来自活跃联系人（未归档）的消息"
      >
        {{ messageStore.filterActiveContacts ? '✓ 活跃' : '○ 活跃' }}
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

    <!-- 导入进度 -->
    <div v-if="importProgress" class="import-progress">
      <div class="import-progress-header">
        <span>{{ importProgress.phase }}...</span>
        <span class="import-progress-text">{{ importProgress.current }} / {{ importProgress.total }}</span>
      </div>
      <div class="import-progress-bar">
        <div class="import-progress-fill" :style="{ width: (importProgress.current / importProgress.total * 100) + '%' }"></div>
      </div>
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

    <div class="message-list" :class="{ compact: contactStore.compactMode }" ref="listRef">
      <div v-if="messageStore.loading" class="empty-state">
        加载中...
      </div>
      
      <div v-else-if="filteredMessagesWithActiveFilter.length === 0" class="empty-state">
        <div class="empty-state-icon">💬</div>
        <p>{{ hasActiveFilters ? '没有符合条件的消息' : '暂无消息记录' }}</p>
      </div>

      <template v-else>
        <!-- 按日期分组显示 -->
        <div v-for="(group, date) in visibleGroups" :key="date" class="message-date-group">
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
                    :title="getContactDetails(msg)"
                  >
                    {{ msg.contactName || '未知联系人' }}
                  </router-link>
                  <span v-else class="contact-link" :title="getContactDetails(msg)">{{ msg.contactName || '未知联系人' }}</span>
                  <!-- 活跃联系人匹配详情 -->
                  <span v-if="messageStore.filterActiveContacts && getMatchedContact(msg)" class="contact-match-info">
                    → {{ getMatchedContact(msg).name }} ({{ getMatchedContact(msg).phone }})
                  </span>
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

    <!-- 分页信息 -->
    <div v-if="filteredMessagesWithActiveFilter.length > PAGE_SIZE" class="pagination-info">
      <span v-if="!allLoaded">已显示 {{ displayedCount }} / {{ filteredMessagesWithActiveFilter.length }} 条消息</span>
      <span v-else>共 {{ filteredMessagesWithActiveFilter.length }} 条消息，已全部显示</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'
import { db } from '../services/db'

const messageStore = useMessageStore()
const contactStore = useContactStore()

const contacts = computed(() => contactStore.contacts)

const importResult = ref(null)
const showSkipped = ref(false)
const importProgress = ref(null) // { current, total, phase }
const listRef = ref(null)
const displayCount = ref(100)
const PAGE_SIZE = 100

// 联系人过滤
const contactFilterQuery = ref('')
const showContactDropdown = ref(false)

// 过滤后的联系人列表
const filteredContacts = computed(() => {
  if (!contactFilterQuery.value.trim()) {
    return contacts.value.slice(0, 10) // 默认显示前10个
  }
  const query = contactFilterQuery.value.toLowerCase()
  return contacts.value.filter(c =>
    c.name?.toLowerCase().includes(query) ||
    c.phone?.includes(query) ||
    c.email?.toLowerCase().includes(query)
  ).slice(0, 20) // 最多显示20个
})

// 获取消息中所有年份
const availableYears = computed(() => {
  const years = new Set()
  messageStore.messages.forEach(m => {
    const d = new Date(m.timestamp)
    if (!isNaN(d.getTime())) {
      years.add(d.getFullYear().toString())
    }
  })
  return Array.from(years).sort().reverse()
})

// 获取消息中所有月份
const availableMonths = computed(() => {
  const months = new Set()
  messageStore.messages.forEach(m => {
    const d = new Date(m.timestamp)
    if (!isNaN(d.getTime())) {
      months.add((d.getMonth() + 1).toString().padStart(2, '0'))
    }
  })
  return Array.from(months).sort().reverse().map(m => ({
    value: m,
    label: `${m}月`
  }))
})

const hasActiveFilters = computed(() =>
  messageStore.filterContact || messageStore.filterChannel || messageStore.searchQuery ||
  messageStore.filterActiveContacts || messageStore.filterYear || messageStore.filterMonth
)

// 获取活跃联系人（未归档）的 ID 和电话号码列表
const activeContactIds = computed(() => {
  return contactStore.activeContacts.map(c => c._id)
})

const activeContactPhones = computed(() => {
  return contactStore.activeContacts
    .map(c => c.phone)
    .filter(p => p && p.replace(/\D/g, '').length >= 7) // 过滤空值和短号（少于7位）
})

// 过滤后的消息（包含活跃联系人过滤）
const filteredMessagesWithActiveFilter = computed(() => {
  let messages = messageStore.filteredMessages
  if (messageStore.filterActiveContacts) {
    // 只显示来自活跃联系人（未归档）的消息
    messages = messages.filter(m => {
      // 如果消息有 contactId，检查是否在活跃联系人列表中
      if (m.contactId) {
        return activeContactIds.value.includes(m.contactId)
      }
      // 如果没有 contactId（如导入的短信），根据电话号码匹配
      // 短信导入时 address 保存在 contactName 中
      if (m.contactName) {
        const msgAddr = m.contactName.replace(/\D/g, '') // 只保留数字
        // 过滤掉短号（少于7位）
        if (msgAddr.length < 7) {
          return false
        }
        // 检查 contactName 是否匹配任何活跃联系人的电话号码
        // 支持部分匹配（如短信地址可能包含国家码）
        return activeContactPhones.value.some(phone => {
          const contactPhone = phone.replace(/\D/g, '')
          // 互相包含即可（处理带/不带国家码的情况）
          return msgAddr.includes(contactPhone) || contactPhone.includes(msgAddr)
        })
      }
      return false
    })
  }
  return messages
})

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

// CSV 字段映射（支持多种格式）
const CSV_FIELD_MAP = {
  // QQ 同步助手格式
  '内容': 'body',
  '对方名字': 'name',
  '对方手机': 'address',
  '发送时间': 'date',
  '类型': 'type',
  // 腾讯格式
  '发件人名字': 'senderName',
  '发件人手机': 'senderAddress',
  '收件人': 'recipientName',
  '收件人手机': 'recipientAddress'
}
// CSV 允许的字段（支持多种格式）
const CSV_KNOWN_FIELDS = [
  '内容', '对方名字', '对方手机', '发送时间', '类型',
  '发件人名字', '发件人手机', '收件人', '收件人手机'
]

// 检测 CSV 格式类型
function detectCSVFormat(headers) {
  // 腾讯格式：有发件人手机、收件人手机字段
  if (headers.includes('发件人手机') && headers.includes('收件人手机')) {
    return 'tencent'
  }
  // QQ 同步助手格式：有对方手机字段
  if (headers.includes('对方手机')) {
    return 'qq'
  }
  return 'unknown'
}

// 解析分隔符格式短信导出（多行格式）
// 格式：
// 状态：接收<<<<				时间：2011-02-01 20:14:07
// 发件人：陌生人				号码 ：1065752581880
// 正文：消息内容
// ============================================================
function parseSeparatedFormat(text) {
  const records = []
  // 用分隔线分割每条短信
  const blocks = text.split(/={50,}/)

  for (const block of blocks) {
    if (!block.trim()) continue

    const lines = block.trim().split(/\r?\n/)
    if (lines.length < 3) continue

    // 解析第一行：状态和时间
    const statusLine = lines[0] || ''
    // 放宽正则：允许状态和时间中间有更多空格或制表符
    const statusMatch = statusLine.match(/状态[：:\s]*(接收|发送)[<>\s]+\s*时间[：:\s]*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/)
    console.log('[Import] Status line:', statusLine, 'Match:', statusMatch)
    if (!statusMatch) continue

    const direction = statusMatch[1] === '发送' ? 'sent' : 'received'
    const datetime = statusMatch[2]

    // 解析第二行：发件人/收件人和号码
    const contactLine = lines[1] || ''
    let contactName = ''
    let phone = ''

    if (direction === 'received') {
      // 发件人：陌生人				号码 ：1065752581880
      // 放宽正则：允许中间有制表符或多个空格
      const senderMatch = contactLine.match(/发件人[：:\s]*(.+?)\s+号码[：:\s]*(.+)/)
      console.log('[Import] Contact line:', contactLine, 'Match:', senderMatch)
      if (senderMatch) {
        contactName = senderMatch[1].trim()
        phone = senderMatch[2].trim()
      }
    } else {
      // 收件人：阿				号码 ：10086
      const recipientMatch = contactLine.match(/收件人[：:\s]*(.+?)\s+号码[：:\s]*(.+)/)
      console.log('[Import] Contact line:', contactLine, 'Match:', recipientMatch)
      if (recipientMatch) {
        contactName = recipientMatch[1].trim()
        phone = recipientMatch[2].trim()
      }
    }

    // 解析第三行及之后：正文
    const contentLine = lines.slice(2).join('\n').trim()
    // 放宽正则：允许正文标签后有任意空白
    const contentMatch = contentLine.match(/正文[：:\s]*(.+)/)
    const content = contentMatch ? contentMatch[1].trim() : contentLine
    console.log('[Import] Content:', content)

    if (datetime && phone && content) {
      records.push({
        datetime,
        contactName,
        phone,
        content,
        direction
      })
    }
  }

  return records
}

// 检测是否为分隔符格式
function isSeparatedFormat(text) {
  // 检查是否包含分隔线（至少10个等号）和 状态行
  const hasSeparator = text.includes('========')
  const hasStatus = text.match(/状态[：:\s]*(接收|发送)/)
  console.log('[Import] Separated format check:', hasSeparator, hasStatus)
  return hasSeparator && hasStatus
}

// 解析小米短信导出格式（无引号，逗号分隔）
// 格式：日期时间 , 联系人 , timestamp , 消息内容 ,
// 第一行：,,,inbox 或 ,,,"sentbox"
function parseXiaomiCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { boxType: 'inbox', records: [] }

  // 第一行判断收件箱/发件箱
  const firstLine = lines[0]
  let boxType = 'inbox' // 默认收件箱
  if (firstLine.includes('sentbox')) {
    boxType = 'sentbox'
  }

  const records = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 解析：日期时间 , 联系人 , timestamp , 消息内容 ,
    // 注意每列前后可能有空格，最后一列可能是空的
    const parts = line.split(',')
    if (parts.length >= 4) {
      const datetime = parts[0]?.trim() || ''
      const contactName = parts[1]?.trim() || ''
      const timestampStr = parts[2]?.trim() || ''
      const content = parts.slice(3).join(',').trim() // 内容可能包含逗号，合并后面的部分

      if (datetime && contactName && content) {
        records.push({
          datetime,
          contactName,
          timestamp: timestampStr,
          content,
          boxType
        })
      }
    }
  }

  return { boxType, records }
}

// 检测是否为小米短信导出格式
function isXiaomiCSVFormat(text) {
  const firstLine = text.split(/\r?\n/)[0]?.trim() || ''
  // 第一行格式：,,,inbox 或 ,,,"sentbox" 或类似
  return firstLine.match(/^,*,.*,?(inbox|sentbox|"inbox"|"sentbox")/)
}

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

// 解析分号分隔格式短信导出（Nokia/其他手机格式）
// 格式："Message type";"To/From";"Date";"Time";"Folder";"Message"
// "SMS";"x1庄";"2008年5月2日";"10:29:57 am";"收件箱";"我在荡马路…"
function parseSemicolonCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { records: [] }

  // 跳过表头行
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 解析分号分隔的字段，每个字段用双引号包裹
    const parts = line.split(';').map(p => p.replace(/^"|"$/g, '').trim())
    if (parts.length < 6) continue

    const [messageType, toFrom, dateStr, timeStr, folder, message] = parts
    if (!message || !toFrom) continue

    // 解析日期：2008年5月2日
    const dateMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (!dateMatch) continue

    const [, year, month, day] = dateMatch

    // 解析时间：10:29:57 am 或 8:27:31 pm
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?/)
    if (!timeMatch) continue

    let [, hour, minute, second, ampm] = timeMatch
    hour = parseInt(hour)
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0

    const date = new Date(year, month - 1, day, hour, minute, second)
    const timestamp = date.getTime()

    // 判断方向：收件箱 = received，发件箱 = sent
    const direction = folder.includes('发件箱') || folder.includes('已发送') ? 'sent' : 'received'

    records.push({
      datetime: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
      contactName: toFrom, // 可能是姓名或号码
      timestamp,
      content: message,
      direction
    })
  }

  return { records }
}

// 检测是否为分号分隔格式
function isSemicolonCSVFormat(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  return firstLine.includes('Message type') &&
         firstLine.includes('To/From') &&
         firstLine.includes(';')
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
function convertCSVRecord(record, index, format = 'qq') {
  // 检查必需字段
  if (!record['内容'] || record['内容'].trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 行: 内容为空` }
  }
  if (!record['发送时间'] || record['发送时间'].trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 行: 发送时间为空` }
  }

  // 根据格式确定地址和方向
  let address = ''
  let direction = 'received'

  if (format === 'tencent') {
    // 腾讯格式：根据发件人/收件人判断方向
    const sender = record['发件人手机'] || ''
    const recipient = record['收件人手机'] || ''

    // 如果收件人是"本人手机"，则是接收的短信
    if (recipient === '本人手机' || recipient === '') {
      address = sender
      direction = 'received'
    } else {
      // 发件人是"本人手机"或空，则是发送的短信
      address = recipient
      direction = 'sent'
    }

    if (!address || address === '本人手机') {
      return { valid: false, reason: `第 ${index + 1} 行: 无法确定对方手机号` }
    }
  } else {
    // QQ 同步助手格式
    if (!record['对方手机'] || record['对方手机'].trim() === '') {
      return { valid: false, reason: `第 ${index + 1} 行: 对方手机为空` }
    }
    address = record['对方手机']
    direction = record['类型'] === '发件箱' ? 'sent' : 'received'
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

  // 生成稳定的 _id（基于内容哈希，避免重复导入）
  const contentHash = simpleHash(address + record['发送时间'] + record['内容'].substring(0, 50))

  return {
    valid: true,
    record: {
      _id: `csv_${contentHash}`,
      address: address,
      date: String(timestamp),
      body: record['内容'],
      type: direction === 'sent' ? '2' : '1',
      _source: 'csv'
    }
  }
}

// 简单字符串哈希函数
function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
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
  
  // 检查是否已导入过该文件
  const importedFiles = await db.getSetting('imported_files', [])
  if (importedFiles.includes(file.name)) {
    const confirmReimport = confirm(`文件 "${file.name}" 已经导入过。\n是否要再次导入？`)
    if (!confirmReimport) {
      event.target.value = '' // 清空文件选择
      return
    }
  }
  
  importResult.value = null
  showSkipped.value = false
  importProgress.value = null
  
  try {
    // 先尝试读取为 ArrayBuffer，自动检测编码
    const arrayBuffer = await file.arrayBuffer()
    let text = ''

    // 尝试 UTF-8 解码
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      text = decoder.decode(arrayBuffer)
    } catch (e) {
      // UTF-8 解码失败，尝试 GBK/GB2312
      console.log('[Import] UTF-8 decode failed, trying GBK...')
      try {
        const decoder = new TextDecoder('gbk', { fatal: false })
        text = decoder.decode(arrayBuffer)
        console.log('[Import] GBK decode success')
      } catch (e2) {
        // 最后尝试 GB2312
        try {
          const decoder = new TextDecoder('gb2312', { fatal: false })
          text = decoder.decode(arrayBuffer)
          console.log('[Import] GB2312 decode success')
        } catch (e3) {
          // 全部失败，使用默认解码
          text = new TextDecoder().decode(arrayBuffer)
          console.log('[Import] Using default decode')
        }
      }
    }

    // 去除各种 BOM 字符
    // UTF-8 BOM: \uFEFF
    // UTF-16/32 BOM: \uFEFF \uFFFE \u0000 等
    text = text.replace(/^[\uFEFF\uFFFE\u0000]+/, '')

    let data = []
    const parseSkipped = [] // 解析阶段跳过的行
    let importType = ''
    
    // 检测文件类型
    const fileExt = file.name.toLowerCase().split('.').pop()
    const isSemicolonCSV = isSemicolonCSVFormat(text)
    const isSeparated = isSeparatedFormat(text)
    const isXiaomiCSV = isXiaomiCSVFormat(text)
    const isQQCSV = text.includes('内容","对方名字","对方手机","发送时间","类型"')
    const isTencentCSV = text.includes('发送时间","发件人名字","发件人手机","收件人","收件人手机","内容"')
    const isCSV = fileExt === 'csv' || isQQCSV || isTencentCSV || isXiaomiCSV

    if (isSemicolonCSV) {
      // 分号分隔格式导入（Nokia/其他手机）
      importType = '分号CSV'
      console.log('[Import] Detected semicolon CSV format')
      
      try {
        const { records } = parseSemicolonCSV(text)
        console.log('[Import] Semicolon CSV records:', records.length)
        
        // 转换分号分隔格式记录
        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          
          if (isNaN(record.timestamp) || record.timestamp <= 0) {
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 条: 日期无效` })
            continue
          }
          
          // 生成稳定的 _id
          const contentHash = simpleHash(record.contactName + record.datetime + record.content.substring(0, 50))
          
          data.push({
            _id: `scsv_${contentHash}`,
            address: record.contactName, // 可能是姓名或号码
            date: String(record.timestamp),
            body: record.content,
            type: record.direction === 'sent' ? '2' : '1',
            _source: 'semicolon_csv',
            _contactName: record.contactName // 保存用于匹配
          })
        }
      } catch (e) {
        importResult.value = {
          type: 'error',
          message: `分号CSV解析失败：${e.message}`,
          skipped: []
        }
        event.target.value = ''
        return
      }
    } else if (isSeparated) {
      // 分隔符格式导入
      importType = '分隔符格式'
      console.log('[Import] Detected separated format')
      
      try {
        const records = parseSeparatedFormat(text)
        console.log('[Import] Separated format records:', records.length)
        
        // 转换分隔符格式记录
        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          // 解析日期时间：2011-02-01 20:14:07
          const dateMatch = record.datetime.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
          if (!dateMatch) {
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 条: 日期格式不正确 "${record.datetime}"` })
            continue
          }
          
          const [, year, month, day, hour, minute, second] = dateMatch
          const date = new Date(year, month - 1, day, hour, minute, second)
          const timestamp = date.getTime()
          
          if (isNaN(timestamp) || timestamp <= 0) {
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 条: 日期无效` })
            continue
          }
          
          // 生成稳定的 _id
          const contentHash = simpleHash(record.phone + record.datetime + record.content.substring(0, 50))
          
          data.push({
            _id: `sep_${contentHash}`,
            address: record.phone,
            date: String(timestamp),
            body: record.content,
            type: record.direction === 'sent' ? '2' : '1',
            _source: 'separated',
            _contactName: record.contactName // 保存联系人名称用于后续匹配
          })
        }
      } catch (e) {
        importResult.value = {
          type: 'error',
          message: `分隔符格式解析失败：${e.message}`,
          skipped: []
        }
        event.target.value = ''
        return
      }
    } else if (isXiaomiCSV) {
      // 小米短信导出格式导入
      importType = '小米CSV'
      console.log('[Import] Detected Xiaomi CSV format')
      
      try {
        const { records } = parseXiaomiCSV(text)
        console.log('[Import] Xiaomi CSV records:', records.length)
        
        // 转换小米格式记录
        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          // 解析日期时间：2010-07-17 12:34:37
          const dateMatch = record.datetime.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/)
          if (!dateMatch) {
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 行: 日期格式不正确 "${record.datetime}"` })
            continue
          }
          
          const [, year, month, day, hour, minute, second] = dateMatch
          const date = new Date(year, month - 1, day, hour, minute, second)
          const timestamp = date.getTime()
          
          if (isNaN(timestamp) || timestamp <= 0) {
            parseSkipped.push({ index: i, reason: `第 ${i + 1} 行: 日期无效` })
            continue
          }
          
          // 判断方向：inbox = received, sentbox = sent
          const direction = record.boxType === 'sentbox' ? 'sent' : 'received'
          
          // 生成稳定的 _id
          const contentHash = simpleHash(record.contactName + record.datetime + record.content.substring(0, 50))
          
          data.push({
            _id: `xiaomi_${contentHash}`,
            address: record.contactName,
            date: String(timestamp),
            body: record.content,
            type: direction === 'sent' ? '2' : '1',
            _source: 'xiaomi_csv'
          })
        }
      } catch (e) {
        importResult.value = {
          type: 'error',
          message: `小米CSV 解析失败：${e.message}`,
          skipped: []
        }
        event.target.value = ''
        return
      }
    } else if (isCSV) {
      // CSV 格式导入
      importType = 'CSV'
      try {
        const { headers, records } = parseCSV(text)

        // 检测 CSV 格式类型
        const csvFormat = detectCSVFormat(headers)
        console.log('[Import] Detected CSV format:', csvFormat)

        // 转换 CSV 记录
        for (let i = 0; i < records.length; i++) {
          const result = convertCSVRecord(records[i], i, csvFormat)
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
    
    // 校验所有记录（CSV/小米CSV/分隔符格式/分号CSV 导入的已在转换时校验，这里跳过）
    const skipped = [...parseSkipped]
    const validRecords = []
    
    data.forEach((record, index) => {
      if (record._source === 'csv' || record._source === 'xiaomi_csv' || record._source === 'separated' || record._source === 'semicolon_csv') {
        // CSV/小米CSV/分隔符格式/分号CSV 记录已经校验过
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
    
    // 导入有效记录（批量导入提升性能）
    importProgress.value = { current: 0, total: validRecords.length, phase: '导入中' }
    let imported = 0

    // 加载所有联系人用于匹配
    await contactStore.init()
    console.log('[Import] Loaded contacts for matching:', contactStore.contacts.length)

    // 准备所有消息文档
    const docs = validRecords.map(record => {
      const existingId = record._id.startsWith('csv_') || record._id.startsWith('xiaomi_') || record._id.startsWith('sep_') || record._id.startsWith('scsv_') ? record._id : `sms_${record._id}`
      const dateNum = Number(record.date)
      const timestamp = new Date(dateNum).toISOString()
      const direction = record.type === '2' ? 'sent' : 'received'

      // 尝试匹配联系人（优先用号码匹配）
      const contactNameFromSource = record._contactName || ''
      const phoneFromSource = record.address || ''
      let matchedContactId = ''
      let matchedContactName = contactNameFromSource || phoneFromSource

      // 1. 优先用号码匹配（分隔符格式中号码在 address 字段）
      const phoneDigits = phoneFromSource.replace(/\D/g, '')
      if (phoneDigits.length >= 7) {
        const byPhone = contactStore.contacts.find(c => {
          const cPhoneDigits = (c.phone || '').replace(/\D/g, '')
          return cPhoneDigits.length >= 7 && (
            phoneDigits.includes(cPhoneDigits) || cPhoneDigits.includes(phoneDigits)
          )
        })
        if (byPhone) {
          matchedContactId = byPhone._id
          matchedContactName = byPhone.name || phoneFromSource
          console.log('[Import] Matched by phone:', phoneFromSource, '→', byPhone.name, '(' + byPhone._id + ')')
        }
      }

      // 2. 如果号码没匹配到，用姓名匹配
      if (!matchedContactId && contactNameFromSource && contactNameFromSource !== '陌生人') {
        const byName = contactStore.contacts.find(c => c.name === contactNameFromSource)
        if (byName) {
          matchedContactId = byName._id
          matchedContactName = byName.name
          console.log('[Import] Matched by name:', contactNameFromSource, '→', byName._id)
        }
      }

      // 3. 如果都没匹配到，但有号码，检查号码是否匹配联系人姓名（小米CSV格式可能号码就是姓名）
      if (!matchedContactId && phoneDigits.length >= 7) {
        const byPhoneAsName = contactStore.contacts.find(c => {
          // 有些格式中号码可能作为姓名保存
          const cPhoneDigits = (c.phone || '').replace(/\D/g, '')
          return cPhoneDigits.length >= 7 && c.name && (
            phoneDigits.includes(cPhoneDigits) || cPhoneDigits.includes(phoneDigits)
          )
        })
        if (byPhoneAsName) {
          matchedContactId = byPhoneAsName._id
          matchedContactName = byPhoneAsName.name
          console.log('[Import] Matched phone to contact:', phoneFromSource, '→', byPhoneAsName.name)
        }
      }

      return {
        _id: existingId,
        contactId: matchedContactId,
        contactName: matchedContactName,
        channel: '短信',
        direction,
        timestamp,
        content: record.body,
        sourceAddress: record.address,
        sourceType: record.type,
        sourceRead: record.read
      }
    })

    // 批量导入
    imported = await db.bulkImportMessages(docs, (current, total) => {
      importProgress.value = { current, total, phase: '导入中' }
    })

    importProgress.value = null
    
    // 刷新消息列表
    await messageStore.init()
    
    // 记录已导入的文件名
    const importedFiles = await db.getSetting('imported_files', [])
    if (!importedFiles.includes(file.name)) {
      importedFiles.push(file.name)
      await db.setSetting('imported_files', importedFiles)
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

// 分页：可见的消息
const visibleMessages = computed(() => {
  return filteredMessagesWithActiveFilter.value.slice(0, displayCount.value)
})

// 分页：按日期分组（只显示已加载的消息）
const visibleGroups = computed(() => {
  const groups = {}
  
  visibleMessages.value.forEach(msg => {
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

const displayedCount = computed(() => visibleMessages.value.length)

const allLoaded = computed(() => {
  return displayCount.value >= filteredMessagesWithActiveFilter.value.length
})

// 重置分页当过滤条件变化
watch(() => messageStore.searchQuery, () => {
  displayCount.value = PAGE_SIZE
})

watch(() => messageStore.filterContact, () => {
  displayCount.value = PAGE_SIZE
})

watch(() => messageStore.filterChannel, () => {
  displayCount.value = PAGE_SIZE
})

watch(() => messageStore.filterActiveContacts, () => {
  displayCount.value = PAGE_SIZE
})

// 滚动加载
function handleScroll() {
  if (!listRef.value || allLoaded.value) return
  
  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    displayCount.value = Math.min(
      displayCount.value + PAGE_SIZE,
      messageStore.filteredMessages.length
    )
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, true)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll, true)
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

// 获取匹配到的活跃联系人信息
function getMatchedContact(msg) {
  if (!msg.contactName) return null
  const msgAddr = msg.contactName.replace(/\D/g, '')
  // 过滤掉短号（少于7位）
  if (msgAddr.length < 7) return null
  // 通过电话号码匹配
  return contactStore.activeContacts.find(c => {
    if (!c.phone) return false
    const contactPhone = c.phone.replace(/\D/g, '')
    // 联系人电话也必须是有效号码（不少于7位）
    if (contactPhone.length < 7) return false
    return msgAddr.includes(contactPhone) || contactPhone.includes(msgAddr)
  })
}

// 获取联系人详细信息（用于 tooltip）
function getContactDetails(msg) {
  const parts = []
  
  // 基本信息
  if (msg.contactName) {
    parts.push(`发件人: ${msg.contactName}`)
  }
  
  // 匹配到的活跃联系人详情
  const matched = getMatchedContact(msg)
  if (matched) {
    parts.push(`匹配联系人: ${matched.name}`)
    if (matched.phone) parts.push(`电话: ${matched.phone}`)
    if (matched.email) parts.push(`邮箱: ${matched.email}`)
    if (matched.tags?.length) parts.push(`标签: ${matched.tags.join(', ')}`)
  }
  
  // 消息来源信息
  if (msg.sourceAddress) {
    parts.push(`来源号码: ${msg.sourceAddress}`)
  }
  
  return parts.join('\n')
}

function onFilterChange() {
  // 过滤器已通过 v-model 双向绑定自动更新
  displayCount.value = PAGE_SIZE
}

function onContactFilterInput() {
  showContactDropdown.value = true
}

function selectContact(contactId) {
  messageStore.filterContact = contactId
  const contact = contacts.value.find(c => c._id === contactId)
  if (contact) {
    contactFilterQuery.value = contact.name
  }
  showContactDropdown.value = false
  displayCount.value = PAGE_SIZE
}

function clearContactFilter() {
  messageStore.filterContact = ''
  contactFilterQuery.value = ''
  displayCount.value = PAGE_SIZE
}

function clearFilters() {
  messageStore.clearFilters()
  contactFilterQuery.value = ''
  displayCount.value = PAGE_SIZE
}

function toggleActiveContactsFilter() {
  messageStore.toggleActiveContactsFilter()
  displayCount.value = PAGE_SIZE
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

/* 联系人过滤输入框 */
.contact-filter {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.contact-filter input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--card-bg);
  color: var(--text);
}

.contact-filter input:focus {
  outline: none;
  border-color: var(--primary);
}

.contact-filter .clear-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-secondary);
  padding: 4px 8px;
}

.contact-filter .clear-btn:hover {
  color: var(--text);
}

.contact-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.contact-option {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}

.contact-option:last-child {
  border-bottom: none;
}

.contact-option:hover {
  background: var(--border);
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

.contact-match-info {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 4px;
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

.pagination-info {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 导入进度条 */
.import-progress {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.import-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  color: #1e40af;
  font-weight: 500;
}

.import-progress-text {
  font-variant-numeric: tabular-nums;
}

.import-progress-bar {
  height: 8px;
  background: #dbeafe;
  border-radius: 4px;
  overflow: hidden;
}

.import-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s ease;
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
