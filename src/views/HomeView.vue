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
        v-model="contactStore.searchQuery" 
        type="text" 
        placeholder="搜索联系人..."
      />
    </div>

    <div class="tabs">
      <button 
        class="tab-btn" 
        :class="{ active: !contactStore.showArchived }"
        @click="contactStore.showArchived = false"
      >
        活跃 ({{ contactStore.activeContacts.length }})
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: contactStore.showArchived }"
        @click="contactStore.showArchived = true"
      >
        已归档 ({{ contactStore.archivedContacts.length }})
      </button>
    </div>

    <div class="header-actions">
      <div class="view-modes">
        <button 
          class="btn btn-secondary" 
          @click="contactStore.toggleCompactMode()"
          :title="contactStore.compactMode ? '切换为标准模式' : '切换为紧凑模式'"
        >
          {{ contactStore.compactMode ? '⊞ 标准' : '⊟ 紧凑' }}
        </button>
        <button 
          class="btn btn-secondary" 
          @click="contactStore.toggleGridMode()"
          :title="contactStore.gridMode ? '切换为列表布局' : '切换为网格布局'"
        >
          {{ contactStore.gridMode ? '☰ 列表' : '⊞ 网格' }}
        </button>
      </div>
      <label class="btn btn-secondary import-btn" title="导入联系人 JSON/CSV/vCard">
        📥 导入
        <input type="file" accept=".json,.csv,.vcf" @change="importContacts" style="display: none;" />
      </label>
      <button class="btn btn-primary" @click="showAddModal = true">+ 新建</button>
    </div>

    <!-- 导入结果提示 -->
    <div v-if="importResult" class="import-result" :class="importResult.type">
      <div class="import-result-header">
        <span>{{ importResult.type === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ importResult.message }}</span>
        <button class="btn-icon" @click="importResult = null">&times;</button>
      </div>
      <div v-if="importResult.skipped?.length" class="skipped-details">
        <button class="btn btn-secondary btn-sm" @click="showSkipped = !showSkipped">
          {{ showSkipped ? '收起' : '查看' }}跳过详情 ({{ importResult.skipped.length }}条)
        </button>
        <div v-if="showSkipped" class="skipped-list">
          <div v-for="(item, idx) in importResult.skipped.slice(0, 10)" :key="idx" class="skipped-item">
            <span class="skipped-id">#{{ item.index + 1 }}</span>
            <span class="skipped-reason">{{ item.reason }}</span>
          </div>
          <div v-if="importResult.skipped.length > 10" class="skipped-more">
            ...还有 {{ importResult.skipped.length - 10 }} 条
          </div>
        </div>
      </div>
    </div>

    <div v-if="contactStore.loading" class="empty-state">
      加载中...
    </div>

    <div v-else-if="contactStore.searchResults.length === 0" class="empty-state">
      <div class="empty-state-icon">📇</div>
      <p>暂无联系人</p>
      <button class="btn btn-primary" style="margin-top: 16px;" @click="showAddModal = true">
        添加第一个联系人
      </button>
    </div>

    <div v-else>
      <div class="contact-list" :class="{ compact: contactStore.compactMode, grid: contactStore.gridMode }" ref="listRef">
        <div 
          v-for="contact in visibleContacts" 
          :key="contact._id"
          class="contact-card"
          :class="{ archived: contact.archived, compact: contactStore.compactMode }"
          @click="goToContact(contact._id)"
        >
          <div class="contact-header">
            <span class="contact-name">
              {{ contact.name }}
              <span v-if="contact.favorite" class="badge badge-favorite">常用</span>
              <span v-if="contact.archived" class="badge badge-archived">已归档</span>
            </span>
          </div>
          <div v-if="!contactStore.compactMode" class="contact-info">
            {{ contact.phone || contact.email || '无联系方式' }}
            <span v-if="contact.lastContacted">
              • 最近联系: {{ formatRelativeTime(contact.lastContacted) }}
            </span>
          </div>
          <div v-if="!contactStore.compactMode && contact.tags && contact.tags.length" class="contact-tags">
            <span v-for="tag in contact.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
          <!-- 紧凑模式下显示简化信息 -->
          <div v-if="contactStore.compactMode" class="contact-info-compact">
            {{ contact.phone || contact.email || '无联系方式' }}
          </div>
        </div>
      </div>

      <!-- 分页信息 -->
      <div v-if="contactStore.searchResults.length > PAGE_SIZE" class="pagination-info">
        <span v-if="!allLoaded">已显示 {{ visibleContacts.length }} / {{ contactStore.searchResults.length }} 个联系人</span>
        <span v-else>共 {{ contactStore.searchResults.length }} 个联系人，已全部显示</span>
      </div>
    </div>

    <!-- 添加/编辑联系人模态框 -->
    <div v-if="showAddModal || editingContact" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">{{ editingContact ? '编辑联系人' : '新建联系人' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        
        <form @submit.prevent="saveContact">
          <div class="form-group">
            <label>姓名 *</label>
            <input v-model="formData.name" type="text" required />
          </div>
          
          <div class="form-group">
            <label>电话</label>
            <input v-model="formData.phone" type="tel" />
          </div>
          
          <div class="form-group">
            <label>邮箱</label>
            <input v-model="formData.email" type="email" />
          </div>
          
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input v-model="tagsInput" type="text" placeholder="工作, 朋友, 家人" />
          </div>
          
          <div class="form-group">
            <label>备注</label>
            <textarea v-model="formData.notes" rows="3"></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useContactStore } from '../stores/contactStore'

const router = useRouter()
const contactStore = useContactStore()

const showAddModal = ref(false)
const editingContact = ref(null)
const tagsInput = ref('')
const listRef = ref(null)
const displayCount = ref(50)
const PAGE_SIZE = 50
const importResult = ref(null)
const showSkipped = ref(false)

const formData = ref({
  name: '',
  phone: '',
  email: '',
  notes: ''
})

// 小米通讯录 JSON 的必需字段
const CONTACT_REQUIRED_FIELDS = ['_id', 'display_name']
// 允许的已知字段
const CONTACT_KNOWN_FIELDS = [
  '_id', 'display_name', 'display_name_alt', 'sort_key', 'sort_key_alt',
  'starred', 'times_contacted', 'last_time_contacted', 'account_type',
  'account_name', 'has_phone_number', 'in_visible_group', 'in_default_directory',
  'is_user_profile', 'phonebook_label', 'phonebook_label_alt', 'phonebook_bucket',
  'phonebook_bucket_alt', 'contact_last_updated_timestamp', 'lookup',
  'contact_account_type', 'name_raw_contact_id', 'send_to_voicemail',
  'pinned', 'raw_contacts'
]

// 从 raw_contacts 中提取联系方式
function extractContactInfo(rawContact) {
  const info = {
    name: '',
    phone: '',
    email: '',
    notes: ''
  }
  
  // 获取姓名
  info.name = rawContact.display_name || rawContact.display_name_alt || ''
  
  // 从 contacts_data 中提取电话和邮箱
  if (rawContact.contacts_data && Array.isArray(rawContact.contacts_data)) {
    for (const data of rawContact.contacts_data) {
      if (!data.mimetype) continue
      
      switch (data.mimetype) {
        case 'vnd.android.cursor.item/name':
          // 姓名，已处理
          break
        case 'vnd.android.cursor.item/phone_v2':
          // 电话
          if (data.data1 && !info.phone) {
            info.phone = data.data1
          }
          break
        case 'vnd.android.cursor.item/email_v2':
          // 邮箱
          if (data.data1 && !info.email) {
            info.email = data.data1
          }
          break
        case 'vnd.android.cursor.item/note':
          // 备注
          if (data.data1) {
            info.notes = data.data1
          }
          break
      }
    }
  }
  
  return info
}

// 校验单条联系人记录
function validateContactRecord(record, index) {
  // 必须是对象
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { valid: false, reason: `第 ${index + 1} 条记录不是有效的 JSON 对象` }
  }
  
  // 检查必需字段
  for (const field of CONTACT_REQUIRED_FIELDS) {
    if (!(field in record)) {
      return { valid: false, reason: `第 ${index + 1} 条: 缺少必需字段 "${field}"` }
    }
  }
  
  // 检查未知字段（只警告，不阻止）
  const recordKeys = Object.keys(record)
  const unknownFields = recordKeys.filter(k => !CONTACT_KNOWN_FIELDS.includes(k))
  
  // 检查 display_name 不为空
  if (!record.display_name || typeof record.display_name !== 'string' || record.display_name.trim() === '') {
    return { valid: false, reason: `第 ${index + 1} 条: display_name 为空` }
  }
  
  return { valid: true, unknownFields }
}

// 导入联系人
async function importContacts(event) {
  const file = event.target.files[0]
  if (!file) return
  
  importResult.value = null
  showSkipped.value = false
  
  try {
    const text = await file.text()
    let data = []
    
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        data = parsed
      } else {
        importResult.value = {
          type: 'error',
          message: 'JSON 格式不正确：需要联系人数组',
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
    
    if (data.length === 0) {
      importResult.value = {
        type: 'error',
        message: '文件中没有可导入的联系人',
        skipped: []
      }
      event.target.value = ''
      return
    }
    
    // 校验所有记录
    const skipped = []
    const validRecords = []
    
    data.forEach((record, index) => {
      const result = validateContactRecord(record, index)
      if (result.valid) {
        validRecords.push({ record, unknownFields: result.unknownFields })
      } else {
        skipped.push({ index, reason: result.reason })
      }
    })
    
    if (validRecords.length === 0) {
      importResult.value = {
        type: 'error',
        message: `共 ${data.length} 条记录，全部校验失败`,
        skipped
      }
      event.target.value = ''
      return
    }
    
    // 确认导入
    const confirmMsg = skipped.length > 0
      ? `共 ${data.length} 条记录，${validRecords.length} 条有效，${skipped.length} 条将被跳过。是否导入有效的 ${validRecords.length} 条联系人？`
      : `共 ${data.length} 条记录，全部校验通过。是否导入？`
    
    if (!confirm(confirmMsg)) {
      importResult.value = null
      event.target.value = ''
      return
    }
    
    // 导入有效记录
    let imported = 0
    for (const { record } of validRecords) {
      // 从 raw_contacts 提取信息
      let contactInfo = {
        name: record.display_name,
        phone: '',
        email: '',
        notes: ''
      }
      
      if (record.raw_contacts && Array.isArray(record.raw_contacts) && record.raw_contacts.length > 0) {
        const rawContact = record.raw_contacts[0]
        contactInfo = extractContactInfo(rawContact)
        // 如果 raw_contact 中没有名字，使用顶层的 display_name
        if (!contactInfo.name) {
          contactInfo.name = record.display_name
        }
      }
      
      // 生成唯一 ID
      const contactId = `imported_${record._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      await contactStore.addContact({
        _id: contactId,
        name: contactInfo.name,
        phone: contactInfo.phone,
        email: contactInfo.email,
        notes: contactInfo.notes,
        tags: ['导入'],
        sourceId: record._id,
        sourceAccount: record.account_name || ''
      })
      imported++
    }
    
    importResult.value = {
      type: 'success',
      message: `成功导入 ${imported} 条联系人` + (skipped.length > 0 ? `，跳过 ${skipped.length} 条` : ''),
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

// 可见联系人（分页）
const visibleContacts = computed(() => {
  return contactStore.searchResults.slice(0, displayCount.value)
})

const allLoaded = computed(() => {
  return displayCount.value >= contactStore.searchResults.length
})

// 重置分页当搜索条件变化
watch(() => contactStore.searchQuery, () => {
  displayCount.value = PAGE_SIZE
})

watch(() => contactStore.showArchived, () => {
  displayCount.value = PAGE_SIZE
})

// 滚动加载
function handleScroll() {
  if (!listRef.value || allLoaded.value) return
  
  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  if (scrollTop + clientHeight >= scrollHeight - 100) {
    displayCount.value = Math.min(
      displayCount.value + PAGE_SIZE,
      contactStore.searchResults.length
    )
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, true)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll, true)
})

// 格式化相对时间
function formatRelativeTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}月前`
}

// 跳转到联系人详情
function goToContact(id) {
  router.push(`/contact/${id}`)
}

// 关闭模态框
function closeModal() {
  showAddModal.value = false
  editingContact.value = null
  formData.value = { name: '', phone: '', email: '', notes: '' }
  tagsInput.value = ''
}

// 保存联系人
async function saveContact() {
  const contactData = {
    ...formData.value,
    tags: tagsInput.value.split(',').map(t => t.trim()).filter(t => t)
  }
  
  if (editingContact.value) {
    await contactStore.updateContact({
      ...editingContact.value,
      ...contactData
    })
  } else {
    await contactStore.addContact(contactData)
  }
  
  closeModal()
}

// 暴露编辑方法给父组件
defineExpose({
  editContact(contact) {
    editingContact.value = contact
    formData.value = {
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      notes: contact.notes || ''
    }
    tagsInput.value = (contact.tags || []).join(', ')
    showAddModal.value = true
  }
})
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

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.view-modes {
  display: flex;
  gap: 8px;
}

/* 紧凑模式样式 */
.contact-list.compact {
  gap: 4px;
}

.contact-card.compact {
  padding: 8px 12px;
}

/* 网格模式下紧凑卡片 */
.contact-list.grid.compact {
  gap: 8px;
}

.contact-list.grid.compact .contact-card.compact {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contact-card.compact {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.contact-list.grid .contact-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.contact-card .contact-header {
  margin-bottom: 0;
}

.contact-card.compact .contact-header {
  flex: 1;
}

.contact-card.compact .contact-name {
  font-size: 15px;
}

.contact-info-compact {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-list.grid.compact .contact-info-compact {
  max-width: none;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.pagination-info {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 导入按钮 */
.import-btn {
  cursor: pointer;
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
  gap: 8px;
  font-weight: 600;
  margin-bottom: 6px;
}

.import-result-header .btn-icon {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
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

.skipped-more {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

@media (max-width: 480px) {
  .contact-card.compact:not(.grid .contact-card.compact) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .contact-info-compact {
    max-width: 100%;
  }
  
  .header-actions {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .view-modes {
    justify-content: center;
  }
}
</style>
