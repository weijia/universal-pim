<template>
  <div id="app">
    <router-view />
    <UpdateNotice />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useContactStore } from './stores/contactStore'
import { useMessageStore } from './stores/messageStore'
import { syncService } from './services/syncService'
import UpdateNotice from './components/UpdateNotice.vue'

const contactStore = useContactStore()
const messageStore = useMessageStore()

onMounted(async () => {
  await contactStore.init()
  await messageStore.init()
  
  // 检查是否启用了WebDAV同步
  const config = await syncService.getWebDAVConfig()
  if (config.enabled) {
    syncService.startAutoSync()
  }
})
</script>
