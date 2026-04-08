<script setup lang="ts">
import { Setting } from "@element-plus/icons-vue";
import { onBeforeUnmount, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { getWecomQrLoginUrl, sendPhoneLoginCode, verifyPhoneLoginCode } from "../api";
import { useAuthStore } from "../../../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const qrDialogVisible = ref(false);
const qrLoading = ref(false);
const qrError = ref("");
const qrConnectUrl = ref("");
const qrExpireIn = ref<number | null>(null);
const qrFrameLoaded = ref(false);

const sendCodeLoading = ref(false);
const phoneLoginLoading = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const phoneForm = reactive({
  phone: "",
  code: "",
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

function goAdminLogin() {
  void router.push({
    path: "/login/admin",
    query: route.query.redirect ? { redirect: getRedirectTarget() } : {},
  });
}

function startCountdown() {
  countdown.value = 60;
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
  countdownTimer = setInterval(() => {
    if (countdown.value <= 1) {
      countdown.value = 0;
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      return;
    }
    countdown.value -= 1;
  }, 1000);
}

async function handleSendCode() {
  const phone = String(phoneForm.phone || "").trim();
  if (!phone) {
    authStore.lastError = "请输入手机号";
    return;
  }

  sendCodeLoading.value = true;
  authStore.lastError = null;
  try {
    await sendPhoneLoginCode(phone);
    startCountdown();
  } catch (error) {
    console.error("send phone login code failed", error);
    authStore.lastError = "发送验证码失败，请稍后重试";
  } finally {
    sendCodeLoading.value = false;
  }
}

async function handlePhoneLogin() {
  const phone = String(phoneForm.phone || "").trim();
  const code = String(phoneForm.code || "").trim();
  if (!phone || !code) {
    authStore.lastError = "请输入手机号和验证码";
    return;
  }

  phoneLoginLoading.value = true;
  authStore.lastError = null;
  try {
    const verified = await verifyPhoneLoginCode(phone, code);
    const ok = await authStore.loginWithPhoneCode(verified.phone_reg_token);
    if (!ok) {
      return;
    }
    await router.replace(getRedirectTarget());
  } catch (error) {
    console.error("phone verify/login failed", error);
    authStore.lastError = "验证码错误、已过期，或该手机号尚未开通";
  } finally {
    phoneLoginLoading.value = false;
  }
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

onBeforeUnmount(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});
</script>

<template>
  <div class="login-page">
    <div class="login-panel">
      <section class="brand-side">
        <button class="admin-entry" type="button" @click="goAdminLogin">
          <el-icon><Setting /></el-icon>
        </button>

        <div class="brand-mark">AI</div>
        <h1>工程服务平台</h1>
        <p>面向正式上线的统一登录入口，优先支持企业微信与手机号验证码接入。</p>
        <ul>
          <li>企业微信 PC 扫码登录</li>
          <li>手机号验证码登录</li>
          <li>企业微信内打开可快捷恢复会话</li>
        </ul>
      </section>

      <section class="form-side">
        <div class="intro-block">
          <h2>欢迎登录</h2>
        </div>

        <div class="entry-grid">
          <article class="entry-card featured">
            <span class="entry-tag">推荐</span>
            <h3>企业微信扫码登录</h3>
            <p>适合电脑浏览器访问。扫码确认后将自动回到当前页面并保持登录状态。</p>
            <el-button class="entry-button" type="primary" size="large" @click="openQrDialog">
              打开扫码登录
            </el-button>
          </article>

          <article class="entry-card">
            <span class="entry-tag soft">手机号</span>
            <h3>手机号验证码登录</h3>
            <p>适合无法扫码的用户。输入手机号并完成验证码校验后进入平台。</p>

            <el-form class="phone-form" @submit.prevent="handlePhoneLogin">
              <el-form-item>
                <el-input
                  v-model="phoneForm.phone"
                  placeholder="请输入手机号"
                  size="large"
                  clearable
                />
              </el-form-item>

              <el-form-item>
                <div class="code-row">
                  <div class="code-input-wrap">
                    <el-input
                      v-model="phoneForm.code"
                      placeholder="请输入验证码"
                      size="large"
                      clearable
                    />
                  </div>
                  <el-button
                    class="code-button"
                    size="large"
                    :disabled="countdown > 0"
                    :loading="sendCodeLoading"
                    @click="handleSendCode"
                  >
                    {{ countdown > 0 ? `${countdown}s 后重发` : "发送验证码" }}
                  </el-button>
                </div>
              </el-form-item>

              <el-button
                class="entry-button"
                type="primary"
                size="large"
                :loading="phoneLoginLoading"
                @click="handlePhoneLogin"
              >
                验证码登录
              </el-button>
            </el-form>
          </article>
        </div>

        <el-alert
          v-if="authStore.lastError"
          class="login-alert"
          :title="authStore.lastError"
          type="error"
          show-icon
          :closable="false"
        />
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
  padding: clamp(16px, 3vw, 40px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background:
    radial-gradient(900px 540px at 12% 8%, rgba(238, 244, 255, 0.95) 0%, transparent 60%),
    radial-gradient(720px 460px at 100% 100%, rgba(225, 238, 255, 0.78) 0%, transparent 58%),
    linear-gradient(180deg, #f4f7fb 0%, #eaf0f7 100%);
}

.login-panel {
  width: min(1180px, 100%);
  min-height: min(720px, calc(100vh - 2 * clamp(16px, 3vw, 40px)));
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card);
  box-shadow: var(--shadow-soft);
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
}

.brand-side {
  position: relative;
  padding: clamp(28px, 4vw, 56px);
  display: grid;
  align-content: start;
  background:
    linear-gradient(160deg, rgba(15, 38, 93, 0.9) 0%, rgba(11, 74, 139, 0.92) 42%, rgba(33, 116, 172, 0.95) 100%),
    linear-gradient(145deg, #173a6a 0%, #0d3b72 100%);
  color: #f8fbff;
}

.admin-entry {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #f4f8ff;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.admin-entry:hover {
  transform: rotate(18deg);
  background: rgba(255, 255, 255, 0.16);
}

.brand-mark {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 28px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.brand-side h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 36px);
  line-height: 1.18;
  font-weight: 700;
}

.brand-side p {
  margin: 18px 0 28px;
  font-size: 16px;
  line-height: 1.8;
  color: rgba(244, 249, 255, 0.84);
}

.brand-side ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 14px;
}

.brand-side li {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.form-side {
  padding: clamp(24px, 4vw, 48px);
  display: grid;
  gap: 18px;
  align-content: start;
  min-width: 0;
  overflow: auto;
}

.intro-block h2 {
  margin: 0;
  font-size: clamp(26px, 3.4vw, 30px);
  color: #1d3150;
}

.intro-block,
.entry-grid,
.login-alert {
  width: min(460px, 100%);
}

.entry-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

.entry-card {
  border-radius: 22px;
  border: 1px solid rgba(142, 165, 196, 0.22);
  background: linear-gradient(180deg, #fbfdff 0%, #f2f7ff 100%);
  padding: 24px;
  min-width: 0;
}

.entry-card.featured {
  background: linear-gradient(180deg, #eef5ff 0%, #e1eeff 100%);
  border-color: rgba(64, 132, 230, 0.24);
}

.entry-tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #1f6fd6;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.entry-tag.soft {
  background: rgba(31, 111, 214, 0.12);
  color: #1f5bb0;
}

.entry-card h3 {
  margin: 14px 0 10px;
  color: #1f3150;
  font-size: 20px;
}

.entry-card p {
  margin: 0 0 18px;
  color: var(--text-500);
  line-height: 1.75;
}

.entry-button {
  width: 100%;
}

.phone-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.phone-form :deep(.el-form-item__content) {
  width: 100%;
  min-width: 0;
}

.phone-form :deep(.el-input) {
  width: 100%;
}

.code-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 128px);
  gap: 12px;
  align-items: stretch;
}

.code-input-wrap {
  min-width: 0;
}

.code-input-wrap :deep(.el-input__wrapper) {
  min-height: 40px;
}

.code-button {
  width: 100%;
  min-width: 0;
}

.login-alert {
  margin-top: -4px;
}

.qr-panel {
  min-height: 340px;
  display: grid;
  gap: 16px;
  align-content: start;
}

.qr-frame {
  width: 100%;
  min-height: 360px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
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
  text-align: center;
}

.qr-hint {
  margin-top: 8px;
}

.qr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 1080px) {
  .login-panel {
    grid-template-columns: 1fr;
    max-height: none;
  }

  .brand-side,
  .form-side {
    padding: 32px 24px;
  }
}

@media (max-width: 920px) {
  .code-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .login-page {
    padding: 0;
  }

  .login-panel {
    min-height: 100vh;
    border-radius: 0;
  }

  .code-row {
    grid-template-columns: 1fr;
  }

  .code-button {
    width: 100%;
  }
}
</style>
