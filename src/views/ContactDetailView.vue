<template>
  <div class="contact-detail">
    <button class="back-btn" @click="$router.back()">
      ← 返回
    </button>

    <div v-if="!contact" class="empty-state">
      <p>联系人不存在</p>
    </div>

    <template v-else>
      <div class="detail-header">
        <div class="detail-avatar">
          {{ contact.name?.charAt(0).toUpperCase() }}
        </div>
        <h1 class="detail-name">{{ contact.name }}</h1>
        <p class="detail-info">
          <span v-if="contact.phone">{{ contact.phone }}</span>
          <span v-if="contact.phone && contact.email"> • </span>
          <span v-if="contact.email">{{ contact.email }}</span>
        </p>
        
        <div class="contact-tags" style="margin-bottom: 16px;">
          <span v-if="contact.favorite" class="badge badge-favorite">常用</span>
          <span v-if="contact.archived" class="badge badge-archived">已归档</span>
          <span v-for="tag in contact.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>

        <div class="detail-actions">
          <button class="btn btn-secondary" @click="editContact">
            编辑
          </button>
          <button class="btn btn-secondary" @click="toggleFavorite">
            {{ contact.favorite ? '取消常用' : '设为常用' }}
          </button>
          <button class="btn btn-secondary" @click="toggleArchive">
            {{ contact.archived ? '取消归档' : '归档' }}
          </button>
          <button class="btn btn-danger" @click="deleteContact">
            删除
          </button>
        </div>
      </div>

      <div class="tabs-inline">
        <button 
          class="tab-inline" 
          :class="{ active: activeTab === 'info' }"
          @click="activeTab = 'info'"
        >
          详情
        </button>
        <button 
          class="tab-inline" 
          :class="{ active: activeTab === 'messages' }"
          @click="activeTab = 'messages'"
        >
          消息 ({{ contactMessages.length }})
        </button>
        <button 
          class="tab-inline" 
          :class="{ active: activeTab === 'addMessage' }"
          @click="activeTab = 'addMessage'"
        >
          添加消息
        </button>
      </div>

      <!-- 详情标签页 -->
      <div v-if="activeTab === 'info'" class="info-section">
        <div class="info-card">
          <h3>联系方式</h3>
          <div class="info-row" v-if="contact.phone">
            <span class="info-label">电话</span>
            <span>{{ contact.phone }}</span>
          </div>
          <div class="info-row" v-if="contact.email">
            <span class="info-label">邮箱</span>
            <span>{{ contact.email }}</span>
          </div>
        </div>

        <div class="info-card" v-if="contact.notes">
          <h3>备注</h3>
          <p>{{ contact.notes }}</p>
        </div>

        <div class="info-card">
          <h3>统计</h3>
          <div class="info-row">
            <span class="info-label">联系频率</span>
            <span>{{ contact.contactFrequency || 0 }} 次</span>
          </div>
          <div class="info-row">
            <span class="info-label">最近联系</span>
            <span>{{ contact.lastContacted ? formatDate(contact.lastContacted) : '从未' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间</span>
            <span>{{ formatDate(contact.createdAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 消息标签页 -->
      <div v-if="activeTab === 'messages'">
        <div v-if="contactMessages.length === 0" class="empty-state">
          <div class="empty-state-icon">💬</div>
          <p>暂无消息记录</p>
          <button class="btn btn-primary" style="margin-top: 16px;" @click="activeTab = 'addMessage'">
            添加第一条消息
          </button>
        </div>
        <div v-else class="message-list">
          <div v-for="msg in contactMessages" :key="msg._id" class="message-item">
            <div class="message-header">
              <span>{{ msg.channel }}</span>
              <span>{{ formatDateTime(msg.timestamp) }}</span>
            </div>
            <div class="message-content">{{ msg.content }}</div>
          </div>
        </div>
      </div>

      <!-- 添加消息标签页 -->
      <div v-if="activeTab === 'addMessage'">
        <form @submit.prevent="saveMessage" class="message-form">
          <div class="form-group">
            <label>渠道</label>
            <select v-model="messageForm.channel" required>
              <option v-for="ch in messageStore.channels" :key="ch" :value="ch">{{ ch }}</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>方向</label>
            <select v-model="messageForm.direction">
              <option value="sent">发送</option>
              <option value="received">接收</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>时间</label>
            <input v-model="messageForm.timestamp" type="datetime-local" />
          </div>
          
          <div class="form-group">
            <label>内容</label>
            <textarea v-model="messageForm.content" rows="5" required placeholder="输入消息内容..."></textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">保存消息</button>
          </div>
        </form>
      </div>
    </template>

    <!-- 编辑联系人模态框 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">编辑联系人</h2>
          <button class="modal-close" @click="showEditModal = false">&times;</button>
        </div>
        
        <form @submit.prevent="updateContact">
          <div class="form-group">
            <label>姓名 *</label>
            <input v-model="editForm.name" type="text" required />
          </div>
          
          <div class="form-group">
            <label>电话</label>
            <input v-model="editForm.phone" type="tel" />
          </div>
          
          <div class="form-group">
            <label>邮箱</label>
            <input v-model="editForm.email" type="email" />
          </div>
          
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input v-model="editForm.tagsInput" type="text" placeholder="工作, 朋友, 家人" />
          </div>
          
          <div class="form-group">
            <label>备注</label>
            <textarea v-model="editForm.notes" rows="3"></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="showEditModal = false">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContactStore } from '../stores/contactStore'
import { useMessageStore } from '../stores/messageStore'

const route = useRoute()
const router = useRouter()
const contactStore = useContactStore()
const messageStore = useMessageStore()

const contact = computed(() => contactStore.getContact(route.params.id))
const contactMessages = computed(() => messageStore.getMessagesByContact(route.params.id))

const activeTab = ref('info')
const showEditModal = ref(false)

const editForm = ref({
  name: '',
  phone: '',
  email: '',
  notes: '',
  tagsInput: ''
})

const messageForm = ref({
  channel: '短信',
  direction: 'received',
  timestamp: new Date().toISOString().slice(0, 16),
  content: ''
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

function editContact() {
  if (!contact.value) return
  editForm.value = {
    name: contact.value.name || '',
    phone: contact.value.phone || '',
    email: contact.value.email || '',
    notes: contact.value.notes || '',
    tagsInput: (contact.value.tags || []).join(', ')
  }
  showEditModal.value = true
}

async function updateContact() {
  if (!contact.value) return
  
  await contactStore.updateContact({
    ...contact.value,
    name: editForm.value.name,
    phone: editForm.value.phone,
    email: editForm.value.email,
    notes: editForm.value.notes,
    tags: editForm.value.tagsInput.split(',').map(t => t.trim()).filter(t => t)
  })
  
  showEditModal.value = false
}

async function toggleFavorite() {
  if (!contact.value) return
  await contactStore.toggleFavorite(contact.value._id)
}

async function toggleArchive() {
  if (!contact.value) return
  await contactStore.toggleArchive(contact.value._id)
}

async function deleteContact() {
  if (!contact.value) return
  if (confirm('确定要删除这个联系人吗？')) {
    await contactStore.deleteContact(contact.value._id)
    router.push('/')
  }
}

async function saveMessage() {
  if (!contact.value) return
  
  await messageStore.addMessage({
    contactId: contact.value._id,
    contactName: contact.value.name,
    channel: messageForm.value.channel,
    direction: messageForm.value.direction,
    timestamp: new Date(messageForm.value.timestamp).toISOString(),
    content: messageForm.value.content
  })
  
  // 同时更新联系人频率
  await contactStore.incrementFrequency(contact.value._id)
  
  // 重置表单
  messageForm.value = {
    channel: '短信',
    direction: 'received',
    timestamp: new Date().toISOString().slice(0, 16),
    content: ''
  }
  
  activeTab.value = 'messages'
}
</script>

<style scoped>
.info-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.info-card h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: var(--text-secondary);
  font-size: 14px;
}

.message-form {
  max-width: 500px;
}
</style>
