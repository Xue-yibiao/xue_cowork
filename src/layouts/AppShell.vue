<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CollectionTag,
  Files,
  FolderOpened,
  SwitchButton,
  User,
} from "@element-plus/icons-vue";

import { useAuthStore } from "../stores/auth";
import brandLogo from "../../logo.png";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const canUseGlossary = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

const productNavItems = computed(() => [
  { path: "/doc-translate/translate", label: "翻译", icon: Files, disabled: false },
  { path: "/doc-translate/history", label: "历史", icon: FolderOpened, disabled: false },
  { path: "/doc-translate/glossary", label: "词库", icon: CollectionTag, disabled: !canUseGlossary.value },
]);

const activePath = computed(() => {
  if (route.path.startsWith("/doc-translate/task/")) {
    return "/doc-translate/translate";
  }
  const found = productNavItems.value.find((item) => route.path.startsWith(item.path));
  return found?.path || "/doc-translate/translate";
});

const displayName = computed(() => authStore.user?.displayName || "未登录用户");
const canManageIam = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

const canManageContractTasks = computed(() => {
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
</script>

<template>
  <div class="translate-shell">
    <aside class="shell-aside">
      <div class="brand-block" @click="navigate('/doc-translate/translate')">
        <img class="brand-logo" :src="brandLogo" alt="项目 Logo" />
        <div class="brand-copy">
          <strong>文档翻译</strong>
        </div>
      </div>

      <nav class="product-nav">
        <button
          v-for="item in productNavItems"
          :key="item.path"
          :class="['nav-item', { 'is-active': activePath === item.path, 'is-disabled': item.disabled }]"
          type="button"
          :disabled="item.disabled"
          @click="!item.disabled && navigate(item.path)"
        >
          <el-icon class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="nav-footer">
        <el-dropdown class="profile-dropdown" trigger="click" placement="top-start">
          <button class="profile-entry" type="button">
            <el-icon><User /></el-icon>
            <span>{{ displayName }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="canManageIam" @click="navigate('/system/profile')">个人信息设置</el-dropdown-item>
              <el-dropdown-item v-if="canManageContractTasks" @click="navigate('/system/contract-workflows')">
                任务管理
              </el-dropdown-item>
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
        <div class="header-actions">
<!--          <button class="ghost-action" type="button" @click="navigate('/doc-translate/translate')">-->
<!--            <el-icon><Grid /></el-icon>-->
<!--            <span>返回翻译台</span>-->
<!--          </button>-->
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

.brand-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-copy {
  min-width: 0;
  display: flex;
  align-items: center;
}

.brand-copy strong {
  font-size: 14px;
  font-weight: 700;
  color: #2f244f;
  line-height: 1.2;
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

.nav-item.is-disabled {
  color: #b5b0c3;
  cursor: not-allowed;
  opacity: 0.9;
}

.nav-item.is-disabled:hover {
  background: transparent;
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
  height: 40px;
  padding: 4px 16px 2px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
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
  height: 34px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #5a4a8b;
  cursor: pointer;
  font-size: 12px;
}

.shell-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 16px 8px;
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
    height: 36px;
    padding: 4px 10px 2px;
  }

  .shell-main {
    padding: 0 10px 6px;
  }
}
</style>
