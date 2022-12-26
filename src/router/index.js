import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/LoginView.vue'
import NoteBookView from '@/views/NoteBookView.vue'
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'home',
      component: Login
    },
    {
      path: '/',
      name: 'notebook',
      component: NoteBookView
    },
  ]
})

export default router
