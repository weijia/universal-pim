import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../services/db'

export const useMessageStore = defineStore('messages', () => {
  const messages = ref([])
  const loading = ref(false)
  const searchQuery = ref('')
  const filterContact = ref('')
  const filterChannel = ref('')
  const filterActiveContacts = ref(false) // 新增：只显示活跃联系人（未归档）的消息

  // 可用的消息渠道
  const channels = ['短信', '微信', 'WhatsApp', 'Telegram', 'Email', '其他']

  // 计算属性：过滤后的消息
  const filteredMessages = computed(() => {
    let result = [...messages.value]

    // 按联系人过滤
    if (filterContact.value) {
      result = result.filter(m => m.contactId === filterContact.value)
    }

    // 按渠道过滤
    if (filterChannel.value) {
      result = result.filter(m => m.channel === filterChannel.value)
    }

    // 搜索过滤
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(m => 
        m.content?.toLowerCase().includes(query) ||
        m.contactName?.toLowerCase().includes(query)
      )
    }

    // 按时间倒序排序
    result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    return result
  })

  // 按联系人和渠道分组的消息
  const groupedMessages = computed(() => {
    const groups = {}
    
    filteredMessages.value.forEach(msg => {
      const key = `${msg.contactId}-${msg.channel}`
      if (!groups[key]) {
        groups[key] = {
          contactId: msg.contactId,
          contactName: msg.contactName,
          channel: msg.channel,
          messages: []
        }
      }
      groups[key].messages.push(msg)
    })

    return Object.values(groups)
  })

  // 初始化
  async function init() {
    loading.value = true
    try {
      await db.init()
      messages.value = await db.getAllMessages()
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      loading.value = false
    }
  }

  // 添加消息
  async function addMessage(message) {
    const newMessage = await db.saveMessage({
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
      direction: message.direction || 'received'
    })
    messages.value.push(newMessage)
    return newMessage
  }

  // 更新消息
  async function updateMessage(message) {
    const updated = await db.saveMessage(message)
    const index = messages.value.findIndex(m => m._id === message._id)
    if (index !== -1) {
      messages.value[index] = updated
    }
    return updated
  }

  // 删除消息
  async function deleteMessage(id) {
    await db.deleteMessage(id)
    messages.value = messages.value.filter(m => m._id !== id)
  }

  // 获取某个联系人的所有消息
  function getMessagesByContact(contactId) {
    return messages.value.filter(m => m.contactId === contactId)
  }

  // 获取某个渠道的所有消息
  function getMessagesByChannel(channel) {
    return messages.value.filter(m => m.channel === channel)
  }

  // 设置过滤器
  function setFilters({ contact, channel, activeContacts }) {
    if (contact !== undefined) filterContact.value = contact
    if (channel !== undefined) filterChannel.value = channel
    if (activeContacts !== undefined) filterActiveContacts.value = activeContacts
  }

  // 清除过滤器
  function clearFilters() {
    filterContact.value = ''
    filterChannel.value = ''
    searchQuery.value = ''
    filterActiveContacts.value = false
  }

  // 切换活跃联系人过滤
  function toggleActiveContactsFilter() {
    filterActiveContacts.value = !filterActiveContacts.value
  }

  return {
    messages,
    loading,
    searchQuery,
    filterContact,
    filterChannel,
    filterActiveContacts,
    channels,
    filteredMessages,
    groupedMessages,
    init,
    addMessage,
    updateMessage,
    deleteMessage,
    getMessagesByContact,
    getMessagesByChannel,
    setFilters,
    clearFilters,
    toggleActiveContactsFilter
  }
})
