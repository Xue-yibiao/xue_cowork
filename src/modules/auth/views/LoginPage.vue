<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { getWecomQrLoginUrl } from "../api";
import { useAuthStore } from "../../../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const qrDialogVisible = ref(false);
const qrLoading = ref(false);
const qrError = ref("");
const qrConnectUrl = ref("");
const qrExpireIn = ref<number | null>(null);
const qrFrameLoaded = ref(false);
const form = reactive({
  username: "",
  password: "",
});

function normalizeRedirect(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

function getRedirectTarget(): string {
  return normalizeRedirect(route.query.redirect);
}

async function handlePasswordLogin() {
  loading.value = true;
  const ok = await authStore.loginWithPassword({
    username: form.username,
    password: form.password,
  });
  loading.value = false;
  if (!ok) {
    return;
  }
  await router.replace(getRedirectTarget());
}

function handleWecomLogin() {
  const redirect = normalizeRedirect(route.query.redirect || "/auth/callback?from=wecom");
  authStore.startWecomLogin(redirect);
}

async function loadQrCode() {
  qrLoading.value = true;
  qrError.value = "";
  qrFrameLoaded.value = false;
  try {
    const data = await getWecomQrLoginUrl({
      redirect: getRedirectTarget(),
      callback: `${window.location.origin}/auth/callback`,
    });
    if (!data.ok || !data.qr_url) {
      qrConnectUrl.value = "";
      qrExpireIn.value = null;
      qrError.value = "扫码登录服务暂时不可用，请稍后重试";
      return;
    }
    qrConnectUrl.value = data.qr_url;
    qrExpireIn.value = data.expire_in || null;
  } catch (error) {
    console.error("load wecom qr url failed", error);
    qrConnectUrl.value = "";
    qrExpireIn.value = null;
    qrError.value = "获取二维码失败，请检查后端服务或代理配置";
  } finally {
    qrLoading.value = false;
  }
}

async function openQrDialog() {
  qrDialogVisible.value = true;
  await loadQrCode();
}

function openQrPage() {
  if (!qrConnectUrl.value) {
    return;
  }
  window.open(qrConnectUrl.value, "_blank", "noopener,noreferrer");
}
</script>

<template>
  <div class="login-page">
    <div class="login-panel">
      <section class="brand-side">
        <div class="brand-mark">AI</div>
        <h1>工程服务平台</h1>
        <p>统一入口，承载文档翻译、权限管理与后续业务模块。</p>
        <ul>
          <li>统一身份认证</li>
          <li>企业微信可跳转登录</li>
          <li>模块化扩展架构</li>
        </ul>
      </section>

      <section class="form-side">
        <h2>欢迎登录</h2>
        <p>使用平台账号密码，或通过企业微信进入。</p>

        <el-form @submit.prevent="handlePasswordLogin">
          <el-form-item>
            <el-input
              v-model="form.username"
              placeholder="账号"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item>
            <el-input
              v-model="form.password"
              placeholder="密码"
              size="large"
              show-password
            />
          </el-form-item>

          <el-alert
            v-if="authStore.lastError"
            :title="authStore.lastError"
            type="error"
            show-icon
            :closable="false"
          />

          <el-button
            class="submit-btn"
            type="primary"
            size="large"
            :loading="loading"
            @click="handlePasswordLogin"
          >
            账号登录
          </el-button>
        </el-form>

        <div class="divider">或</div>

        <div class="wecom-actions">
          <el-button class="wecom-btn" size="large" @click="openQrDialog">
            企业微信扫码登录
          </el-button>
          <el-button class="wecom-btn" size="large" plain @click="handleWecomLogin">
            企业微信登录（兼容旧流程）
          </el-button>
        </div>
      </section>
    </div>

    <el-dialog v-model="qrDialogVisible" title="企业微信扫码登录" width="520px" destroy-on-close>
      <div class="qr-panel">
        <el-skeleton v-if="qrLoading" animated :rows="6" />
        <template v-else>
          <el-alert
            v-if="qrError"
            :title="qrError"
            type="error"
            show-icon
            :closable="false"
          />
          <template v-else>
            <iframe
              v-if="qrConnectUrl"
              class="qr-frame"
              :src="qrConnectUrl"
              title="企业微信扫码登录页面"
              referrerpolicy="no-referrer"
              @load="qrFrameLoaded = true"
            />
            <p class="qr-tip">请在电脑端打开此页面，并用手机企业微信扫码确认。</p>
            <p v-if="qrExpireIn" class="qr-expire">二维码有效期约 {{ qrExpireIn }} 秒，请过期后刷新。</p>
            <el-alert
              v-if="!qrFrameLoaded"
              class="qr-hint"
              title="如果此处未显示登录页，请点击“打开登录页”在新窗口完成扫码。"
              type="info"
              :closable="false"
            />
          </template>
        </template>
      </div>
      <template #footer>
        <div class="qr-actions">
          <el-button :loading="qrLoading" @click="loadQrCode">刷新二维码</el-button>
          <el-button type="primary" :disabled="!qrConnectUrl" @click="openQrPage">打开登录页</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(900px 500px at 10% 10%, #ebf3ff 0%, transparent 60%),
    linear-gradient(180deg, #f5f7fb 0%, #edf1f8 100%);
}

.login-panel {
  width: min(1080px, 100%);
  min-height: 640px;
  border-radius: 24px;
  overflow: hidden;
  background: var(--bg-card);
  box-shadow: var(--shadow-soft);
  display: grid;
  grid-template-columns: 1fr 420px;
}

.brand-side {
  padding: 56px;
  background: linear-gradient(145deg, #1e3a8a 0%, #0f4ba8 45%, #1f65d1 100%);
  color: #f8fbff;
}

.brand-mark {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.brand-side h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.2;
  font-weight: 700;
}

.brand-side p {
  margin: 18px 0 28px;
  font-size: 16px;
  color: rgba(246, 251, 255, 0.86);
}

.brand-side ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 12px;
  color: rgba(246, 251, 255, 0.95);
}

.form-side {
  padding: 52px 42px;
  display: flex;
  flex-direction: column;
}

.form-side h2 {
  margin: 0;
  font-size: 30px;
  color: var(--text-900);
}

.form-side p {
  margin: 10px 0 28px;
  color: var(--text-500);
}

.submit-btn,
.wecom-btn {
  width: 100%;
  margin-top: 6px;
}

.wecom-actions {
  display: grid;
  gap: 10px;
}

.divider {
  margin: 22px 0;
  color: var(--text-500);
  text-align: center;
  position: relative;
}

.divider::before,
.divider::after {
  content: "";
  position: absolute;
  top: 50%;
  width: calc(50% - 20px);
  border-top: 1px solid var(--border-soft);
}

.divider::before {
  left: 0;
}

.divider::after {
  right: 0;
}

.qr-panel {
  min-height: 460px;
  display: grid;
  align-content: start;
  gap: 12px;
}

.qr-frame {
  width: 100%;
  height: 380px;
  margin: 0;
  border-radius: 12px;
  border: 1px solid var(--border-soft);
  background: #fff;
}

.qr-tip {
  margin: 0;
  color: var(--text-700);
  text-align: center;
}

.qr-expire {
  margin: 0;
  color: var(--text-500);
  font-size: 13px;
  text-align: center;
}

.qr-hint {
  margin-top: 4px;
}

.qr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 980px) {
  .login-page {
    padding: 20px;
  }

  .login-panel {
    grid-template-columns: 1fr;
  }

  .brand-side {
    display: none;
  }

  .form-side {
    padding: 38px 26px;
  }
}
</style>
