import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { installDemoBackend } from './mock/mockBackend'
import './styles.css'

installDemoBackend()

const component = () => import('./renderer/features/ai-logo-reset/AiLogoResetEntry.vue')
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/tools/ai-logo-reset' },
    { path: '/tools/ai-logo-reset', component },
    { path: '/tools/ai-logo-reset/workspace/:projectId', component },
    { path: '/:pathMatch(.*)*', redirect: '/tools/ai-logo-reset' }
  ]
})

createApp(App).use(router).mount('#app')
