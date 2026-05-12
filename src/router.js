import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/contact/:id', name: 'contact', component: () => import('./views/ContactDetailView.vue') },
  { path: '/messages', name: 'messages', component: () => import('./views/MessagesView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
