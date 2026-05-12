<template>
  <div>
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h1 style="font-size: 28px; font-weight: 700;">Universal PIM</h1>
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
      <button class="btn btn-primary" @click="showAddModal = true">+ 新建联系人</button>
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

    <div v-else class="contact-list">
      <div 
        v-for="contact in contactStore.searchResults" 
        :key="contact._id"
        class="contact-card"
        :class="{ archived: contact.archived }"
        @click="goToContact(contact._id)"
      >
        <div class="contact-header">
          <span class="contact-name">
            {{ contact.name }}
            <span v-if="contact.favorite" class="badge badge-favorite">常用</span>
            <span v-if="contact.archived" class="badge badge-archived">已归档</span>
          </span>
        </div>
        <div class="contact-info">
          {{ contact.phone || contact.email || '无联系方式' }}
          <span v-if="contact.lastContacted">
            • 最近联系: {{ formatRelativeTime(contact.lastContacted) }}
          </span>
        </div>
        <div v-if="contact.tags && contact.tags.length" class="contact-tags">
          <span v-for="tag in contact.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
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
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContactStore } from '../stores/contactStore'

const router = useRouter()
const contactStore = useContactStore()

const showAddModal = ref(false)
const editingContact = ref(null)
const tagsInput = ref('')

const formData = ref({
  name: '',
  phone: '',
  email: '',
  notes: ''
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
</style>
