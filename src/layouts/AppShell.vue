<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CollectionTag,
  Files,
  FolderOpened,
  Grid,
  Operation,
  SwitchButton,
  Tools,
  User,
} from "@element-plus/icons-vue";

import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const productNavItems = [
  { path: "/doc-translate/translate", label: "翻译", icon: Files },
  { path: "/doc-translate/history", label: "历史", icon: FolderOpened },
  { path: "/doc-translate/glossary", label: "术语", icon: CollectionTag },
  { path: "/doc-translate/memory", label: "记忆", icon: Operation },
  { path: "/doc-translate/tools", label: "工具", icon: Tools },
];

const activePath = computed(() => {
  if (route.path.startsWith("/doc-translate/task/")) {
    return "/doc-translate/translate";
  }
  const found = productNavItems.find((item) => route.path.startsWith(item.path));
  return found?.path || "/doc-translate/translate";
});

const displayName = computed(() => authStore.user?.displayName || "未登录用户");
const canManageIam = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

function navigate(path: string) {
  if (route.path !== path) {
    router.push(path);
  }
}

function handleLogout() {
  authStore.logout();
  router.replace("/login");
}


const isTranslatePage = computed(() => route.path.startsWith('/doc-translate/translate'));

function goToTranslate() {
  router.push('/doc-translate/translate');
}
</script>

<template>
  <div class="translate-shell">
    <aside class="shell-aside">
      <div class="brand-block" @click="navigate('/doc-translate/translate')">
        <div class="brand-mark">
          <span></span>
          <span></span>
        </div>
        <div class="brand-copy">
          <strong>文档翻译</strong>
          <span>Translate Workspace</span>
        </div>
      </div>

      <nav class="product-nav">
        <button
          v-for="item in productNavItems"
          :key="item.path"
          :class="['nav-item', { 'is-active': activePath === item.path }]"
          type="button"
          @click="navigate(item.path)"
        >
          <el-icon class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="nav-footer">
        <button class="logout-button" type="button" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
          <span>退出登录</span>
        </button>

        <el-dropdown class="profile-dropdown" trigger="click" placement="top-start">
          <button class="profile-entry" type="button">
            <el-icon><User /></el-icon>
            <span>{{ displayName }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="navigate('/system/profile')">个人信息设置</el-dropdown-item>
              <el-dropdown-item v-if="canManageIam" @click="navigate('/system/users')">用户管理</el-dropdown-item>
              <el-dropdown-item v-if="canManageIam" @click="navigate('/system/roles')">角色与权限</el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </aside>

    <section class="shell-content">
      <header class="shell-header">
        <div>
          <p class="eyebrow">Simplify Style Workspace</p>
          <h1>{{ route.meta.title || "翻译" }}</h1>
        </div>

        <div class="header-actions">
          <button v-if="!isTranslatePage" class="ghost-action" type="button" @click="goToTranslate">
            <el-icon><Grid /></el-icon>
            <span>返回翻译台</span>
          </button>
        </div>
      </header>

      <main class="shell-main">
        <RouterView />
      </main>
    </section>
  </div>
</template>

<style scoped>
.translate-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, rgba(124, 92, 255, 0.08), transparent 28%),
    linear-gradient(180deg, #fcfbff 0%, #f7f6fd 100%);
}

.shell-aside {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  border-right: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.brand-block {
  height: 92px;
  padding: 24px 22px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.brand-mark {
  width: 28px;
  height: 18px;
  position: relative;
}

.brand-mark span {
  position: absolute;
  inset: 0;
  border: 4px solid #6e56cf;
  border-radius: 999px;
}

.brand-mark span:last-child {
  transform: translateX(10px);
}

.brand-copy {
  display: grid;
  gap: 2px;
}

.brand-copy strong {
  font-size: 14px;
  font-weight: 700;
  color: #2f244f;
}

.brand-copy span {
  font-size: 11px;
  color: #9b93b5;
}

.product-nav {
  padding: 8px 8px 0;
  display: grid;
  gap: 6px;
  overflow: auto;
}

.nav-item {
  border: 0;
  background: transparent;
  border-radius: 12px;
  height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #3c315e;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.nav-item:hover {
  background: rgba(110, 86, 207, 0.08);
}

.nav-item.is-active {
  background: #efebff;
  color: #5f45c6;
  font-weight: 600;
}

.nav-icon {
  font-size: 16px;
}

.nav-footer {
  margin-top: auto;
  padding: 18px 12px 20px;
  display: grid;
  gap: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.92) 24%);
  min-width: 0;
}

.nav-footer > * {
  min-width: 0;
}

.profile-dropdown {
  width: 100%;
  min-width: 0;
  display: block;
}

.logout-button {
  width: 100%;
  max-width: 100%;
  border: 1px solid rgba(103, 80, 164, 0.16);
  background: rgba(255, 255, 255, 0.94);
  border-radius: 12px;
  height: 42px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  color: #5f45c6;
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
}

.logout-button span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.profile-entry {
  width: 100%;
  max-width: 100%;
  border: 1px solid rgba(103, 80, 164, 0.16);
  background: #fff;
  border-radius: 12px;
  height: 42px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: #3c315e;
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
}

.profile-entry :deep(.el-icon),
.logout-button :deep(.el-icon) {
  flex-shrink: 0;
}

.profile-entry span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.shell-content {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.shell-header {
  height: 84px;
  padding: 18px 28px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #988eb8;
}

.shell-header h1 {
  margin: 0;
  font-size: 28px;
  color: #2f244f;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ghost-action {
  border: 1px solid rgba(103, 80, 164, 0.14);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  height: 42px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #5a4a8b;
  cursor: pointer;
}

.shell-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 28px 28px;
}

@media (max-width: 960px) {
  .translate-shell {
    grid-template-columns: 1fr;
  }

  .shell-aside {
    border-right: 0;
    border-bottom: 1px solid rgba(103, 80, 164, 0.12);
    height: auto;
  }

  .product-nav {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .nav-item {
    justify-content: center;
    padding: 0 8px;
  }

  .nav-item span {
    display: none;
  }

  .nav-footer {
    display: none;
  }

  .shell-header {
    padding: 18px 18px 12px;
  }

  .shell-main {
    padding: 0 18px 18px;
  }
}
</style>
