import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "../stores/auth";
import AppShell from "../layouts/AppShell.vue";
import AuthCallbackPage from "../modules/auth/views/AuthCallbackPage.vue";
import LoginPage from "../modules/auth/views/LoginPage.vue";
import DocTranslatePage from "../modules/doc-translate/views/DocTranslatePage.vue";
import TranslateGlossaryPage from "../modules/doc-translate/views/TranslateGlossaryPage.vue";
import TranslateHistoryPage from "../modules/doc-translate/views/TranslateHistoryPage.vue";
import TranslateMemoryPage from "../modules/doc-translate/views/TranslateMemoryPage.vue";
import TranslateReviewPage from "../modules/doc-translate/views/TranslateReviewPage.vue";
import TranslateTaskDetailPage from "../modules/doc-translate/views/TranslateTaskDetailPage.vue";
import TranslateToolsPage from "../modules/doc-translate/views/TranslateToolsPage.vue";
import ProfileSettingsPage from "../modules/system/views/ProfileSettingsPage.vue";
import RolePermissionPage from "../modules/system/views/RolePermissionPage.vue";
import UserManagementPage from "../modules/system/views/UserManagementPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginPage,
      meta: { public: true, title: "平台登录" },
    },
    {
      path: "/auth/callback",
      name: "auth-callback",
      component: AuthCallbackPage,
      meta: { public: true, title: "登录回调" },
    },
    {
      path: "/",
      component: AppShell,
      children: [
        {
          path: "",
          redirect: "/doc-translate/translate",
        },
        {
          path: "dashboard",
          redirect: "/doc-translate/translate",
        },
        {
          path: "doc-translate",
          redirect: "/doc-translate/translate",
        },
        {
          path: "doc-translate/translate",
          name: "doc-translate",
          component: DocTranslatePage,
          meta: { requiresAuth: true, title: "翻译" },
        },
        {
          path: "doc-translate/history",
          name: "doc-translate-history",
          component: TranslateHistoryPage,
          meta: { requiresAuth: true, title: "历史" },
        },
        {
          path: "doc-translate/task/:workflowId",
          name: "doc-translate-task-detail",
          component: TranslateTaskDetailPage,
          meta: { requiresAuth: true, title: "任务详情" },
        },
        {
          path: "doc-translate/task/:workflowId/review",
          name: "doc-translate-review",
          component: TranslateReviewPage,
          meta: { requiresAuth: true, title: "人工校验" },
        },
        {
          path: "doc-translate/glossary",
          name: "doc-translate-glossary",
          component: TranslateGlossaryPage,
          meta: { requiresAuth: true, title: "术语" },
        },
        {
          path: "doc-translate/memory",
          name: "doc-translate-memory",
          component: TranslateMemoryPage,
          meta: { requiresAuth: true, title: "记忆" },
        },
        {
          path: "doc-translate/tools",
          name: "doc-translate-tools",
          component: TranslateToolsPage,
          meta: { requiresAuth: true, title: "工具" },
        },
        {
          path: "system/users",
          name: "system-users",
          component: UserManagementPage,
          meta: { requiresAuth: true, requiresAdmin: true, title: "用户管理" },
        },
        {
          path: "system/roles",
          name: "system-roles",
          component: RolePermissionPage,
          meta: { requiresAuth: true, requiresAdmin: true, title: "角色与权限" },
        },
        {
          path: "system/profile",
          name: "system-profile",
          component: ProfileSettingsPage,
          meta: { requiresAuth: true, title: "个人信息设置" },
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/doc-translate/translate",
    },
  ],
});

router.beforeEach(async (to) => {
  const store = useAuthStore();
  const isPublic = Boolean(to.meta.public);

  if (store.status === "unknown") {
    await store.initialize();
  }

  if (isPublic && to.path === "/login" && store.isAuthenticated) {
    return { path: "/doc-translate/translate" };
  }

  if (isPublic) {
    return true;
  }

  if (!store.isAuthenticated) {
    return {
      path: "/login",
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.requiresAdmin) {
    const roleSet = new Set(store.user?.roles || []);
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      return { path: "/doc-translate/translate" };
    }
  }

  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === "string" ? to.meta.title : "文档翻译";
  document.title = `${title} - 文档翻译`;
});

export { router };
