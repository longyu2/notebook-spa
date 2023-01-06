import { createRouter, createWebHistory } from "vue-router";
import Login from "@/views/LoginView.vue";
import NoteBookView from "@/views/NoteBookView.vue";
import NoteBookPhoneView from "@/views/NoteBookPhoneView.vue";
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "home",
      component: Login,
    },
    {
      path: "/notebook",
      name: "notebook",
      component: NoteBookView,
    },
    {
      path: "/notebook_phone",
      name: "phone",
      component: NoteBookPhoneView,
    },
  ],
});

export default router;
