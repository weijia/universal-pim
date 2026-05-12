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

      <button 
        v-if="hasActiveFilters" 
        class="btn btn-secondary" 
        @click="clearFilters"
      >
        清除过滤
      </button>
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
import { computed } from 'vue'
import { useMessageStore } from '../stores/messageStore'
import { useContactStore } from '../stores/contactStore'

const messageStore = useMessageStore()
const contactStore = useContactStore()

const contacts = computed(() => contactStore.contacts)

const hasActiveFilters = computed(() => 
  messageStore.filterContact || messageStore.filterChannel || messageStore.searchQuery
)

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
}

.btn-icon:hover {
  background: var(--border);
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
</style>
