<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Download, EditPen, RefreshRight } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import PdfCanvasViewer from "../components/PdfCanvasViewer.vue";
import {
  fetchContractWorkflowArtifactBlob,
  getContractWorkflowDetail,
  type WorkflowArtifactKey,
} from "../api";

type Dict = Record<string, unknown>;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");
const workflowId = computed(() => String(route.params.workflowId || "").trim());

const workflowDetail = ref<Dict | null>(null);
const loadingDetail = ref(false);
const loadingPreview = ref(false);
const sourcePreviewUrl = ref("");
const translatedPreviewUrl = ref("");
const downloadingArtifactKey = ref<WorkflowArtifactKey | "">("");
const lastLoadedTranslatedStatus = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

function revokeUrl(value: string) {
  if (value) {
    window.URL.revokeObjectURL(value);
  }
}

function cleanupPreviews() {
  revokeUrl(sourcePreviewUrl.value);
  revokeUrl(translatedPreviewUrl.value);
  sourcePreviewUrl.value = "";
  translatedPreviewUrl.value = "";
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const detailArtifacts = computed<Dict>(() => {
  const raw = workflowDetail.value?.artifacts;
  if (raw && typeof raw === "object") {
    return raw as Dict;
  }
  return {};
});

const detailStatus = computed(() => String(workflowDetail.value?.status || "-"));
const detailLanguagePair = computed(() => String(workflowDetail.value?.language_pair || "-"));
const detailFilename = computed(() => String(detailArtifacts.value.source_filename || workflowId.value || "未命名文档"));
const canReview = computed(() => Boolean(workflowDetail.value?.review) || detailStatus.value === "WAIT_REVIEW");

async function loadPreviewBlob(artifactKey: WorkflowArtifactKey): Promise<string> {
  const { blob } = await fetchContractWorkflowArtifactBlob(accessToken.value, workflowId.value, artifactKey);
  return window.URL.createObjectURL(blob);
}

async function loadDetail() {
  if (!workflowId.value) {
    return;
  }
  loadingDetail.value = true;
  try {
    const prevStatus = detailStatus.value;
    const detail = await getContractWorkflowDetail(accessToken.value, workflowId.value);
    workflowDetail.value = detail;

    const nextStatus = String(detail.status || "");
    if (nextStatus === "RUNNING") {
      stopPolling();
      pollTimer = setInterval(() => {
        void loadDetail();
      }, 2500);
    } else {
      stopPolling();
    }

    if (prevStatus === "RUNNING" && ["WAIT_REVIEW", "SUCCEEDED", "FAILED", "CANCELLED"].includes(nextStatus)) {
      lastLoadedTranslatedStatus.value = "";
    }
  } catch (error) {
    console.error(error);
    ElMessage.error("加载任务详情失败");
  } finally {
    loadingDetail.value = false;
  }
}

async function loadPreviews() {
  if (!workflowId.value) {
    return;
  }

  loadingPreview.value = true;
  try {
    if (!sourcePreviewUrl.value && detailArtifacts.value.source_pdf) {
      sourcePreviewUrl.value = await loadPreviewBlob("source_pdf");
    }

    const status = detailStatus.value;
    const translatedReady = ["WAIT_REVIEW", "SUCCEEDED"].includes(status);
    const shouldReloadTranslated =
      translatedReady &&
      detailArtifacts.value.translated_pdf &&
      (status !== lastLoadedTranslatedStatus.value || !translatedPreviewUrl.value);

    if (shouldReloadTranslated) {
      revokeUrl(translatedPreviewUrl.value);
      translatedPreviewUrl.value = "";
      translatedPreviewUrl.value = await loadPreviewBlob("translated_pdf");
      lastLoadedTranslatedStatus.value = status;
    }

    if (status === "RUNNING") {
      revokeUrl(translatedPreviewUrl.value);
      translatedPreviewUrl.value = "";
    }
  } catch (error) {
    console.error(error);
    ElMessage.error("加载 PDF 预览失败");
  } finally {
    loadingPreview.value = false;
  }
}

async function downloadArtifact(artifactKey: WorkflowArtifactKey) {
  if (!workflowId.value) {
    return;
  }
  downloadingArtifactKey.value = artifactKey;
  try {
    const { blob, filename } = await fetchContractWorkflowArtifactBlob(accessToken.value, workflowId.value, artifactKey);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `${workflowId.value}-${artifactKey}.${artifactKey.endsWith("docx") ? "docx" : "pdf"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error(error);
    ElMessage.error("下载失败");
  } finally {
    downloadingArtifactKey.value = "";
  }
}

function goReview() {
  if (!workflowId.value) {
    return;
  }
  router.push(`/doc-translate/task/${encodeURIComponent(workflowId.value)}/review`);
}

watch(
  () => workflowId.value,
  async () => {
    stopPolling();
    cleanupPreviews();
    lastLoadedTranslatedStatus.value = "";
    await loadDetail();
  },
  { immediate: true },
);

watch(
  () => detailArtifacts.value,
  async () => {
    if (workflowDetail.value) {
      await loadPreviews();
    }
  },
);

onUnmounted(() => {
  stopPolling();
  cleanupPreviews();
});
</script>

<template>
  <div class="task-detail-page">
    <header class="task-header">
      <div class="task-title">
        <p class="title-eyebrow">任务详情</p>
        <h2>{{ detailFilename }}</h2>
        <p>{{ detailLanguagePair }}</p>
      </div>

      <div class="task-actions">
        <el-button :icon="RefreshRight" :loading="loadingDetail || loadingPreview" @click="loadDetail">刷新</el-button>
        <el-button :icon="Download" :loading="downloadingArtifactKey === 'translated_docx'" @click="downloadArtifact('translated_docx')">
          下载 DOCX
        </el-button>
        <el-button type="primary" :icon="EditPen" :disabled="!canReview" @click="goReview">人工校验</el-button>
      </div>
    </header>

    <section class="detail-layout">
      <article class="preview-column">
        <div class="column-header">
          <strong>原文</strong>
          <el-tag size="small">{{ detailStatus }}</el-tag>
        </div>
        <div class="preview-banner">在线展示仅用于快速预览，请下载查看真实排版效果</div>
        <div class="preview-body" v-loading="loadingPreview">
          <PdfCanvasViewer :src="sourcePreviewUrl" empty-text="原文 PDF 暂不可用" />
        </div>
      </article>

      <article class="preview-column">
        <div class="column-header">
          <strong>译文</strong>
          <div class="column-actions">
            <el-button
              size="small"
              type="success"
              plain
              :loading="downloadingArtifactKey === 'translated_pdf'"
              @click="downloadArtifact('translated_pdf')"
            >
              下载 PDF
            </el-button>
            <el-button size="small" type="primary" :disabled="!canReview" @click="goReview">人工校验</el-button>
          </div>
        </div>
        <div class="preview-banner">在线展示仅用于快速预览，请下载查看 DOCX 文件的真正排版效果</div>
        <div class="preview-body translated" v-loading="loadingPreview">
          <PdfCanvasViewer :src="translatedPreviewUrl" empty-text="译文 PDF 暂不可用" />
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.task-detail-page {
  display: grid;
  gap: 18px;
  min-height: calc(100vh - 132px);
}

.task-header,
.preview-column {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  box-shadow: var(--shadow-soft);
}

.task-header {
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.task-title {
  min-width: 0;
  flex: 1;
}

.title-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-500);
}

.task-title h2 {
  margin: 0 0 8px;
  font-size: 28px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-title p:last-child {
  margin: 0;
  color: var(--text-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
  min-width: 0;
}

.detail-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  min-height: calc(100vh - 248px);
}

.preview-column {
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
}

.column-header {
  padding: 18px 20px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.column-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-banner {
  margin: 0 20px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff3c4;
  color: #6a5610;
  font-size: 13px;
}

.preview-body {
  min-height: 0;
  height: 100%;
  background: #ffffff;
}

.preview-body.translated {
  position: relative;
}

@media (max-width: 1100px) {
  .task-header {
    flex-direction: column;
    align-items: stretch;
  }

  .task-title h2,
  .task-title p:last-child {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .detail-layout {
    grid-template-columns: 1fr;
  }

  .preview-body {
    min-height: 520px;
    height: 70vh;
  }
}
</style>
