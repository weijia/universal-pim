import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '../services/db'

export const useContactStore = defineStore('contacts', () => {
  const contacts = ref([])
  const loading = ref(false)
  const searchQuery = ref('')
  const showArchived = ref(false)
  const compactMode = ref(false)

  // 计算属性：活跃联系人
  const activeContacts = computed(() => 
    contacts.value.filter(c => !c.archived)
  )

  // 计算属性：已归档联系人
  const archivedContacts = computed(() => 
    contacts.value.filter(c => c.archived)
  )

  // 计算属性：按使用频率排序的联系人
  const sortedActiveContacts = computed(() => {
    return [...activeContacts.value].sort((a, b) => {
      const freqA = a.contactFrequency || 0
      const freqB = b.contactFrequency || 0
      return freqB - freqA
    })
  })

  // 计算属性：搜索结果
  const searchResults = computed(() => {
    if (!searchQuery.value.trim()) {
      return showArchived.value ? archivedContacts.value : sortedActiveContacts.value
    }
    
    const query = searchQuery.value.toLowerCase()
    const targetList = showArchived.value ? archivedContacts.value : activeContacts.value
    
    return targetList.filter(c => 
      c.name?.toLowerCase().includes(query) ||
      c.phone?.includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.tags?.some(t => t.toLowerCase().includes(query))
    )
  })

  // 初始化
  async function init() {
    loading.value = true
    try {
      await db.init()
      contacts.value = await db.getAllContacts()
      // 从设置中读取紧凑模式偏好
      const savedCompactMode = await db.getSetting('compactMode', false)
      compactMode.value = savedCompactMode
    } catch (error) {
      console.error('Failed to load contacts:', error)
    } finally {
      loading.value = false
    }
  }

  // 切换紧凑模式
  async function toggleCompactMode() {
    compactMode.value = !compactMode.value
    await db.setSetting('compactMode', compactMode.value)
  }

  // 添加联系人
  async function addContact(contact) {
    const newContact = await db.saveContact({
      ...contact,
      contactFrequency: 0,
      lastContacted: null,
      archived: false,
      createdAt: new Date().toISOString()
    })
    contacts.value.push(newContact)
    return newContact
  }

  // 更新联系人
  async function updateContact(contact) {
    const updated = await db.saveContact(contact)
    const index = contacts.value.findIndex(c => c._id === contact._id)
    if (index !== -1) {
      contacts.value[index] = updated
    }
    return updated
  }

  // 删除联系人
  async function deleteContact(id) {
    await db.deleteContact(id)
    contacts.value = contacts.value.filter(c => c._id !== id)
  }

  // 归档/取消归档联系人
  async function toggleArchive(id) {
    const contact = contacts.value.find(c => c._id === id)
    if (contact) {
      contact.archived = !contact.archived
      await updateContact(contact)
    }
  }

  // 标记联系人为常用
  async function toggleFavorite(id) {
    const contact = contacts.value.find(c => c._id === id)
    if (contact) {
      contact.favorite = !contact.favorite
      await updateContact(contact)
    }
  }

  // 增加联系频率
  async function incrementFrequency(id) {
    const contact = contacts.value.find(c => c._id === id)
    if (contact) {
      contact.contactFrequency = (contact.contactFrequency || 0) + 1
      contact.lastContacted = new Date().toISOString()
      await updateContact(contact)
    }
  }

  // 获取单个联系人
  function getContact(id) {
    return contacts.value.find(c => c._id === id)
  }

  return {
    contacts,
    loading,
    searchQuery,
    showArchived,
    compactMode,
    activeContacts,
    archivedContacts,
    sortedActiveContacts,
    searchResults,
    init,
    toggleCompactMode,
    addContact,
    updateContact,
    deleteContact,
    toggleArchive,
    toggleFavorite,
    incrementFrequency,
    getContact
  }
})
