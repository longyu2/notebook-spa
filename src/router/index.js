import { createRouter, createWebHistory } from "vue-router";
import Login from "@/views/LoginView.vue";
import NoteBookView from "@/views/NoteBookView.vue";
import NoteBookPhoneView from "@/views/NoteBookPhoneView.vue";
import ArticleContent from "@/components/phone/ArticleContent.vue";
import ArticleList from "@/components/phone/ArticleList.vue";
import Admin from "@/views/AdminView.vue";
import App from "@/App.vue";
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "app",
      component: App,
    },
    {
      path: "/admin",
      name: "admin",
      component: Admin,
    },
    {
      path: "/login",
      name: "login",
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
      redirect: "/notebook_phone/list",
      children: [
        {
          path: "list",
          component: ArticleList,
        },
        {
          path: "content",
          component: ArticleContent,
        },
      ],
    },
  ],
});

router.beforeEach((to, from) => {
  if (to.path != "/login") {
    if (localStorage.getItem("token") != null) {
      console.log("有token");
    } else {
      console.log("无token，请登录");
      return { name: "login" };
    }
  }

  return true;
  // 返回 false 以取消导航
});

export default router;
