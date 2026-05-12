<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useContactStore } from './stores/contactStore'
import { useMessageStore } from './stores/messageStore'
import { useSyncService } from './services/syncService'

const contactStore = useContactStore()
const messageStore = useMessageStore()
const syncService = useSyncService()

onMounted(async () => {
  await contactStore.init()
  await messageStore.init()
  syncService.startAutoSync()
})
</script>
