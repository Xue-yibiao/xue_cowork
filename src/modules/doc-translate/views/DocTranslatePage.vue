<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowUp } from "@element-plus/icons-vue";
import type { UploadInstance, UploadProps, UploadUserFile } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import {
  listTermbaseSets,
  queryContractWorkflows,
  submitContractDocx,
  translateContractTextInline,
  type TermbaseSetItem,
  type WorkflowQueryItem,
} from "../api";

type WorkspaceMode = "upload" | "text";
type LangPairValue = "en_zh" | "zh_en" | "es_zh" | "zh_es" | "it_zh" | "zh_it";

const authStore = useAuthStore();
const router = useRouter();
const accessToken = computed(() => authStore.accessToken || "");

const workspaceMode = ref<WorkspaceMode>("upload");
const selectedLangPair = ref<LangPairValue>("en_zh");
const enableTb = ref(true);
const tbSetId = ref<number | null>(null);
const tbSetOptions = ref<TermbaseSetItem[]>([]);
const loadingTb = ref(false);

const uploadRef = ref<UploadInstance>();
const uploadList = ref<UploadUserFile[]>([]);
const selectedDocx = ref<File | null>(null);
const submittingDoc = ref(false);
const submittingText = ref(false);
const textInput = ref("");
const textOutput = ref("");

const recentLoading = ref(false);
const recentItems = ref<WorkflowQueryItem[]>([]);

const langPairOptions: Array<{ label: string; value: LangPairValue; src_lang: string; tgt_lang: string }> = [
  { label: "英文 -> 简体中文", value: "en_zh", src_lang: "en", tgt_lang: "zh" },
  { label: "简体中文 -> 英文", value: "zh_en", src_lang: "zh", tgt_lang: "en" },
  { label: "西班牙语 -> 简体中文", value: "es_zh", src_lang: "es", tgt_lang: "zh" },
  { label: "简体中文 -> 西班牙语", value: "zh_es", src_lang: "zh", tgt_lang: "es" },
  { label: "意大利语 -> 简体中文", value: "it_zh", src_lang: "it", tgt_lang: "zh" },
  { label: "简体中文 -> 意大利语", value: "zh_it", src_lang: "zh", tgt_lang: "it" },
];

const defaultLangPairOption = langPairOptions[0]!;

function getLangPairConfig(value: LangPairValue) {
  return langPairOptions.find((item) => item.value === value) || defaultLangPairOption;
}

function splitLangPairLabel(value: LangPairValue): [string, string] {
  const label = getLangPairConfig(value).label;
  const parts = label.split(" -> ");
  return [parts[0] || "原文", parts[1] || "译文"];
}

const currentLangLabels = computed(() => splitLangPairLabel(selectedLangPair.value));
const selectedUploadExtension = computed(() => {
  const name = String(selectedDocx.value?.name || "").trim();
  if (!name.includes(".")) {
    return "FILE";
  }
  return name.split(".").pop()?.toUpperCase() || "FILE";
});

const selectedUploadSizeLabel = computed(() => {
  const size = Number(selectedDocx.value?.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
});

const TERMINAL_WORKFLOW_STATUSES = new Set(["WAIT_REVIEW", "SUCCEEDED", "FAILED", "CANCELLED"]);
const RECENT_TASK_REFRESH_MS = 10000;
let recentTaskTimer: ReturnType<typeof setInterval> | null = null;

function normalizeWorkflowStatus(status: unknown): string {
  return String(status || "").trim().toUpperCase();
}

function isTerminalWorkflowStatus(status: unknown): boolean {
  const normalized = normalizeWorkflowStatus(status);
  return normalized ? TERMINAL_WORKFLOW_STATUSES.has(normalized) : false;
}

function formatWorkflowStatusLabel(status: unknown): string {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === "WAIT_REVIEW") {
    return "已完成";
  }
  return normalized || "-";
}

function getWorkflowStatusTagType(status: unknown): "success" | "danger" | "info" {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === "SUCCEEDED" || normalized === "WAIT_REVIEW") {
    return "success";
  }
  if (normalized === "FAILED") {
    return "danger";
  }
  return "info";
}

const activeWorkflow = computed(() => recentItems.value.find((item) => !isTerminalWorkflowStatus(item.status)) || null);
const hasActiveWorkflow = computed(() => Boolean(activeWorkflow.value));
const visibleRecentItems = computed(() => recentItems.value.slice(0, 6));

function isSupportedUploadFilename(name: string): boolean {
  const filename = String(name || "").trim().toLowerCase();
  return filename.endsWith(".docx") || filename.endsWith(".pdf");
}

async function loadTermbaseOptions() {
  loadingTb.value = true;
  try {
    const items = await listTermbaseSets(accessToken.value);
    tbSetOptions.value = items;
    const hasCurrent = items.some((item) => Number(item.id) === Number(tbSetId.value));
    if (!hasCurrent) {
      const firstItem = items[0];
      tbSetId.value = firstItem ? Number(firstItem.id) : null;
    }
  } catch (error) {
    console.error(error);
    tbSetOptions.value = [];
    tbSetId.value = null;
    ElMessage.error("加载词库失败");
  } finally {
    loadingTb.value = false;
  }
}

async function loadRecentTasks() {
  if (recentLoading.value) {
    return;
  }
  recentLoading.value = true;
  try {
    const resp = await queryContractWorkflows(accessToken.value, {
      limit: 20,
      offset: 0,
    });
    recentItems.value = resp.items || [];
  } catch (error) {
    console.error(error);
    ElMessage.error("加载最近任务失败");
  } finally {
    recentLoading.value = false;
  }
}

function openTask(row: WorkflowQueryItem) {
  const workflowId = String(row.workflow_id || "").trim();
  if (!workflowId) {
    return;
  }
  router.push(`/doc-translate/task/${encodeURIComponent(workflowId)}`);
}

function openHistory() {
  router.push("/doc-translate/history");
}

function openGlossary() {
  router.push("/doc-translate/glossary");
}

const beforeUploadDocx: UploadProps["beforeUpload"] = (rawFile) => {
  if (hasActiveWorkflow.value) {
    ElMessage.warning("当前已有进行中的翻译任务，完成后才能继续提交");
    return false;
  }
  if (!isSupportedUploadFilename(rawFile.name)) {
    ElMessage.error("当前前端仅支持上传 .docx 或 .pdf 文件");
    return false;
  }
  return false;
};

const handleUploadChange: UploadProps["onChange"] = (file, files) => {
  if (hasActiveWorkflow.value) {
    uploadList.value = [];
    uploadRef.value?.clearFiles();
    ElMessage.warning("当前已有进行中的翻译任务，完成后才能继续提交");
    return;
  }
  const raw = file.raw as File | undefined;
  if (!raw || !isSupportedUploadFilename(raw.name)) {
    selectedDocx.value = null;
    uploadList.value = [];
    uploadRef.value?.clearFiles();
    return;
  }
  selectedDocx.value = raw;
  uploadList.value = files.slice(-1);
};

const handleUploadRemove: UploadProps["onRemove"] = () => {
  selectedDocx.value = null;
  uploadList.value = [];
};

const handleUploadExceed: UploadProps["onExceed"] = () => {
  ElMessage.warning("一次仅支持上传 1 个 docx/pdf 文件");
};

function clearSelectedUpload() {
  if (hasActiveWorkflow.value) {
    return;
  }
  selectedDocx.value = null;
  uploadList.value = [];
  uploadRef.value?.clearFiles();
}

async function handleSubmitDocx() {
  const file = selectedDocx.value;
  if (!file) {
    ElMessage.warning("请先选择 .docx 或 .pdf 文件");
    return;
  }
  const langPair = getLangPairConfig(selectedLangPair.value);

  submittingDoc.value = true;
  try {
    const resp = await submitContractDocx(accessToken.value, {
      file,
      src_lang: langPair.src_lang,
      tgt_lang: langPair.tgt_lang,
      enable_tb: enableTb.value,
      tb_set_id: tbSetId.value,
    });
    ElMessage.success(`任务已提交：${resp.workflow_id}`);
    selectedDocx.value = null;
    uploadList.value = [];
    uploadRef.value?.clearFiles();
    await loadRecentTasks();
  } catch (error) {
    console.error(error);
    ElMessage.error("提交文档翻译失败");
  } finally {
    submittingDoc.value = false;
  }
}

async function handleSubmitText() {
  const text = textInput.value.trim();
  if (!text) {
    ElMessage.warning("请输入待翻译文本");
    return;
  }
  const langPair = getLangPairConfig(selectedLangPair.value);

  submittingText.value = true;
  try {
    const resp = await translateContractTextInline(accessToken.value, {
      text,
      src_lang: langPair.src_lang,
      tgt_lang: langPair.tgt_lang,
      primary_engine: "llm",
      fallback_engine: "madlad",
      enable_tb: enableTb.value && Boolean(tbSetId.value),
      tb_set_id: tbSetId.value,
    });
    textOutput.value = String(resp.translation || "");
  } catch (error) {
    console.error(error);
    const status = (error as { response?: { status?: number } })?.response?.status;
    const detail =
      (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ||
      (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.message ||
      "";
    if (status || detail) {
      ElMessage.error(`文本翻译失败${status ? `（${status}）` : ""}${detail ? `：${detail}` : ""}`);
    } else {
      ElMessage.error("文本翻译失败");
    }
  } finally {
    submittingText.value = false;
  }
}

async function copyTextOutput() {
  const content = textOutput.value.trim();
  if (!content) {
    ElMessage.warning("当前没有可复制的译文");
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    ElMessage.success("译文已复制到剪贴板");
  } catch (error) {
    console.error(error);
    ElMessage.error("复制失败，请检查浏览器剪贴板权限");
  }
}

function resetTextPanels() {
  textInput.value = "";
  textOutput.value = "";
}

function formatUnixTs(v: unknown): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) {
    return "-";
  }
  return new Date(n * 1000).toLocaleString();
}

onMounted(async () => {
  await loadTermbaseOptions();
  await loadRecentTasks();
  recentTaskTimer = setInterval(() => {
    void loadRecentTasks();
  }, RECENT_TASK_REFRESH_MS);
});

onBeforeUnmount(() => {
  if (recentTaskTimer) {
    clearInterval(recentTaskTimer);
    recentTaskTimer = null;
  }
});
</script>

<template>
  <div class="translate-page" :class="{ 'is-text-mode': workspaceMode === 'text' }">
    <section class="compose-panel">
      <div class="mode-switch">
        <button :class="['mode-pill', { 'is-active': workspaceMode === 'upload' }]" type="button" @click="workspaceMode = 'upload'">
          上传文档
        </button>
        <button :class="['mode-pill', { 'is-active': workspaceMode === 'text' }]" type="button" @click="workspaceMode = 'text'">
          输入文字
        </button>
      </div>

      <div class="translate-settings">
        <el-select v-model="selectedLangPair" class="settings-select settings-select--lang" placeholder="翻译方向">
          <el-option v-for="item in langPairOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select
          v-model="tbSetId"
          class="settings-select settings-select--tb"
          placeholder="选择词库"
          clearable
          :disabled="!enableTb || loadingTb"
        >
          <el-option v-for="item in tbSetOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-checkbox v-model="enableTb" class="settings-check">使用词库</el-checkbox>
        <button class="glossary-link" type="button" @click="openGlossary">管理词库</button>
      </div>

      <div class="compose-board">
        <template v-if="workspaceMode === 'upload'">
          <div class="compose-scroll">
            <div class="upload-zone">
              <div v-if="hasActiveWorkflow" class="upload-selected-card upload-selected-card--locked">
                <div class="upload-selected-type">{{ formatWorkflowStatusLabel(activeWorkflow?.status) }}</div>
                <div class="upload-selected-name">{{ activeWorkflow?.source_filename || activeWorkflow?.workflow_id }}</div>
                <div class="upload-selected-meta">
                  <span>{{ formatUnixTs(activeWorkflow?.updated_at || activeWorkflow?.created_at) }}</span>
                  <span>{{ activeWorkflow?.workflow_id }}</span>
                </div>
                <div class="upload-selected-note">当前账号已有进行中的翻译任务，任务完成前暂不允许继续上传新文件。</div>
              </div>
              <div v-else-if="selectedDocx" class="upload-selected-card">
                <div class="upload-selected-type">{{ selectedUploadExtension }}</div>
                <div class="upload-selected-name">{{ selectedDocx.name }}</div>
                <div class="upload-selected-meta">
                  <span>{{ selectedUploadSizeLabel }}</span>
                  <span>已选择 1 个文件</span>
                </div>
                <div class="upload-selected-note">当前已锁定该文件。若要更换，请先移除后再重新选择。</div>
                <el-button class="upload-selected-action" @click="clearSelectedUpload">移除文件</el-button>
              </div>
              <el-upload
                v-else
                ref="uploadRef"
                v-model:file-list="uploadList"
                class="upload-dropzone"
                drag
                :auto-upload="false"
                :show-file-list="false"
                :limit="1"
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                :before-upload="beforeUploadDocx"
                :on-change="handleUploadChange"
                :on-remove="handleUploadRemove"
                :on-exceed="handleUploadExceed"
              >
                <el-icon class="upload-icon"><ArrowUp /></el-icon>
                <div class="upload-title">点击选择或拖拽文件到这里</div>
                <div class="upload-note">
                  当前前端支持 `.docx` 与图片型 `.pdf`；PDF 将通过 OCR 识别，处理耗时会更长。
                </div>
              </el-upload>
            </div>

            <p class="helper-note">
              {{ hasActiveWorkflow ? "任务进行中，系统会自动检查状态，完成后恢复上传。" : "文件不能超过 2048MB" }}
            </p>
          </div>

          <div class="compose-actions">
            <el-button
              type="primary"
              class="action-btn action-btn--primary"
              :loading="submittingDoc"
              :disabled="!selectedDocx || hasActiveWorkflow"
              @click="handleSubmitDocx"
            >
              开始翻译
            </el-button>
          </div>
        </template>

        <template v-else>
          <div class="compose-scroll">
            <div class="text-compare-board">
              <section class="text-pane">
                <header class="text-pane-head">{{ currentLangLabels[0] }}</header>
                <el-input
                  v-model="textInput"
                  class="text-compare-input"
                  type="textarea"
                  resize="none"
                  maxlength="120000"
                  show-word-limit
                  placeholder="输入需要翻译的内容（Shift+Enter 换行）"
                />
              </section>

              <section class="text-pane is-output">
                <header class="text-pane-head">{{ currentLangLabels[1] }}</header>
                <div class="text-compare-output">
                  <div v-if="textOutput" class="text-output-copy">{{ textOutput }}</div>
                  <div v-else class="text-output-placeholder">
                    {{ submittingText ? "翻译中..." : "译文会显示在这里" }}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div class="compose-actions compose-actions--split">
            <el-button class="action-btn action-btn--secondary" @click="resetTextPanels">重新输入</el-button>
            <div class="compose-actions-group">
              <el-button class="action-btn action-btn--secondary" @click="copyTextOutput">复制译文</el-button>
              <el-button type="primary" class="action-btn action-btn--primary" :loading="submittingText" @click="handleSubmitText">
                开始翻译
              </el-button>
            </div>
          </div>
        </template>
      </div>
    </section>

    <aside v-if="workspaceMode === 'upload'" class="recent-panel">
      <div class="recent-header">
        <div>
          <h3>您之前上传的文档</h3>
          <p>点击任务进入原文/译文预览与人工校验页面</p>
        </div>
        <button class="more-link" type="button" @click="openHistory">查看更多</button>
      </div>

      <div v-if="visibleRecentItems.length === 0 && !recentLoading" class="recent-empty">
        <p>还没有历史任务，提交一次翻译后会出现在这里。</p>
      </div>

      <div v-else class="recent-list" v-loading="recentLoading">
        <button
          v-for="row in visibleRecentItems"
          :key="row.workflow_id"
          class="recent-item"
          type="button"
          @click="openTask(row)"
        >
          <div class="recent-meta">
            <div class="file-dot">W</div>
            <div class="recent-copy">
              <p class="recent-name">{{ row.source_filename || row.workflow_id }}</p>
              <p class="recent-sub">{{ formatUnixTs(row.updated_at || row.created_at) }}</p>
            </div>
          </div>
          <el-tag
            size="small"
            :type="getWorkflowStatusTagType(row.status)"
          >
            {{ formatWorkflowStatusLabel(row.status) }}
          </el-tag>
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.translate-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 20px;
  align-items: stretch;
  overflow: hidden;
}

.translate-page.is-text-mode {
  grid-template-columns: 1fr;
}

.compose-panel,
.recent-panel {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
  min-height: 0;
}

.compose-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 20px;
  min-height: 0;
}

.mode-switch {
  margin: 0 auto;
  padding: 4px;
  border-radius: 14px;
  background: #f5f2ff;
  display: inline-flex;
  gap: 4px;
}

.mode-pill {
  border: 0;
  background: transparent;
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  color: var(--text-700);
  cursor: pointer;
}

.mode-pill.is-active {
  background: #fff;
  color: var(--brand-500);
  font-weight: 600;
}

.translate-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    "lang tb"
    "check link";
  gap: 12px;
  align-items: center;
}

.settings-select {
  width: 100%;
}

.settings-select--lang {
  grid-area: lang;
}

.settings-select--tb {
  grid-area: tb;
}

.settings-check {
  grid-area: check;
}

.glossary-link,
.more-link {
  border: 0;
  background: transparent;
  color: var(--brand-500);
  cursor: pointer;
}

.glossary-link {
  grid-area: link;
  justify-self: end;
}

.compose-board {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
  overflow: hidden;
}

.translate-page.is-text-mode .compose-board {
  min-height: 0;
}

.compose-scroll {
  min-height: 0;
  height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 14px;
  overflow: auto;
}

.translate-page.is-text-mode .compose-scroll {
  align-content: stretch;
  justify-items: stretch;
}

.compose-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(103, 80, 164, 0.1);
}

.compose-actions--split {
  justify-content: space-between;
}

.compose-actions-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-zone {
  width: min(500px, 100%);
}

.upload-dropzone,
.upload-zone {
  min-height: clamp(200px, 34vh, 260px);
}

.upload-dropzone :deep(.el-upload),
.upload-dropzone :deep(.el-upload-dragger) {
  width: 100%;
  height: 100%;
}

.upload-dropzone :deep(.el-upload-dragger) {
  border: 2px dashed rgba(131, 105, 239, 0.55);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(245, 242, 255, 0.9) 0%, rgba(250, 248, 255, 0.94) 100%);
  padding: clamp(24px, 4vh, 36px) clamp(20px, 3vw, 28px);
  display: grid;
  align-content: center;
  justify-items: center;
}

.upload-selected-card {
  width: 100%;
  min-height: inherit;
  height: 100%;
  border: 2px solid rgba(131, 105, 239, 0.34);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(244, 241, 255, 0.96) 0%, rgba(250, 248, 255, 0.98) 100%);
  padding: 22px 24px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 10px;
  text-align: center;
}

.upload-selected-card--locked {
  border-color: rgba(110, 86, 207, 0.42);
  background: linear-gradient(180deg, rgba(241, 237, 255, 0.98) 0%, rgba(248, 245, 255, 0.98) 100%);
}

.upload-selected-type {
  min-width: 68px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(110, 86, 207, 0.12);
  color: var(--brand-500);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.upload-selected-name {
  max-width: 100%;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-900);
  word-break: break-word;
}

.upload-selected-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  color: var(--text-500);
  font-size: 13px;
}

.upload-selected-note {
  color: var(--text-700);
  line-height: 1.7;
}

.upload-selected-action {
  margin-top: 4px;
}

.upload-icon {
  font-size: 34px;
  color: var(--brand-500);
  margin-bottom: 12px;
}

.upload-title {
  font-size: clamp(18px, 1.8vw, 20px);
  color: var(--text-900);
}

.upload-note,
.helper-note {
  margin: 14px 0 0;
  text-align: center;
  color: var(--text-500);
}

.action-btn {
  height: 44px;
  padding: 0 24px;
  border-radius: 12px;
}

.action-btn--primary {
  background: linear-gradient(135deg, var(--brand-500), var(--brand-400));
  border: 0;
  color: #fff;
  box-shadow: 0 10px 22px rgba(110, 86, 207, 0.18);
}

.action-btn--secondary {
  border: 1px solid rgba(103, 80, 164, 0.14);
  background: #ffffff;
  color: var(--text-700);
  box-shadow: 0 8px 18px rgba(103, 80, 164, 0.08);
}

.text-compare-board {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid rgba(103, 80, 164, 0.14);
  border-radius: 22px;
  overflow: hidden;
  background: #ffffff;
}

.text-pane {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
}

.text-pane + .text-pane {
  border-left: 1px solid rgba(103, 80, 164, 0.12);
}

.text-pane-head {
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 16px;
  color: var(--text-900);
  border-bottom: 1px solid rgba(103, 80, 164, 0.1);
  background: rgba(250, 249, 255, 0.8);
}

.text-compare-input {
  height: 100%;
}

.text-compare-input :deep(.el-textarea),
.text-compare-input :deep(.el-textarea__inner) {
  height: 100%;
}

.text-compare-input :deep(.el-textarea__inner) {
  min-height: 100% !important;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 18px 20px;
  resize: none;
  line-height: 1.8;
}

.text-compare-output {
  min-height: 0;
  padding: 18px 20px;
  overflow: auto;
  white-space: pre-wrap;
  line-height: 1.8;
  color: var(--text-900);
}

.text-output-copy {
  color: var(--text-900);
}

.text-output-placeholder {
  color: var(--text-500);
}

.recent-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: stretch;
  gap: 16px;
  overflow: hidden;
}

.recent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.recent-header h3 {
  margin: 0 0 8px;
  font-size: 20px;
}

.recent-header p {
  margin: 0;
  color: var(--text-500);
  font-size: 13px;
}

.recent-list {
  display: grid;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  align-content: start;
  padding-right: 4px;
}

.recent-item {
  width: 100%;
  border: 1px solid rgba(103, 80, 164, 0.1);
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  min-width: 0;
}

.recent-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #e8f0ff;
  color: #2b65d9;
  font-size: 12px;
  font-weight: 700;
}

.recent-copy {
  flex: 1;
  min-width: 0;
}

.recent-name,
.recent-sub {
  margin: 0;
  text-align: left;
}

.recent-name {
  color: var(--text-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.recent-item :deep(.el-tag) {
  flex-shrink: 0;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-sub {
  margin-top: 4px;
  color: var(--text-500);
  font-size: 12px;
}

.recent-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--text-500);
}

@media (max-width: 1200px) {
  .translate-page {
    height: auto;
    overflow: visible;
    grid-template-columns: 1fr;
  }

  .recent-panel {
    grid-template-rows: auto auto;
    overflow: visible;
  }

  .recent-list {
    overflow: visible;
    padding-right: 0;
  }
}

@media (max-width: 768px) {
  .compose-panel,
  .recent-panel {
    padding: 18px;
    border-radius: 18px;
  }

  .translate-settings {
    grid-template-columns: 1fr;
    grid-template-areas:
      "lang"
      "check"
      "tb"
      "link";
    align-items: stretch;
  }

  .upload-zone,
  .upload-dropzone {
    min-height: 180px;
  }

  .upload-dropzone :deep(.el-upload-dragger) {
    padding: 24px 18px;
  }

  .glossary-link {
    justify-self: start;
  }

  .text-compare-board {
    grid-template-columns: 1fr;
  }

  .text-pane + .text-pane {
    border-left: 0;
    border-top: 1px solid rgba(103, 80, 164, 0.12);
  }

  .compose-actions,
  .compose-actions--split {
    flex-direction: column-reverse;
    align-items: stretch;
    justify-content: stretch;
  }

  .compose-actions-group {
    width: 100%;
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
