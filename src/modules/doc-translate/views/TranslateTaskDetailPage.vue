<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { Download, EditPen } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import PdfCanvasViewer from "../components/PdfCanvasViewer.vue";
import TranslateReviewWorkspace from "../components/TranslateReviewWorkspace.vue";
import {
  buildContractWorkflowArtifactRequest,
  fetchContractWorkflowArtifactBlob,
  getContractWorkflowDetail,
  type WorkflowArtifactKey,
} from "../api";

type Dict = Record<string, unknown>;

const route = useRoute();
const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");
const workflowId = computed(() => String(route.params.workflowId || "").trim());

const workflowDetail = ref<Dict | null>(null);
const downloadingArtifactKey = ref<WorkflowArtifactKey | "">("");
const reviewVisible = ref(false);
const reviewWindowRef = ref<HTMLElement | null>(null);
const reviewWindowX = ref(0);
const reviewWindowY = ref(0);
const reviewWindowWidth = ref(0);
const reviewWindowHeight = ref(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let interactionMode: "idle" | "drag" | "resize" = "idle";
let dragOffsetX = 0;
let dragOffsetY = 0;
let resizeStartMouseX = 0;
let resizeStartMouseY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

const REVIEW_MIN_WIDTH = 720;
const REVIEW_MIN_HEIGHT = 260;
const REVIEW_EDGE_GAP = 12;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function stopDragging() {
  interactionMode = "idle";
  window.removeEventListener("mousemove", handleWindowMouseMove);
  window.removeEventListener("mouseup", stopDragging);
}

function getReviewWindowMaxSize() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return {
    maxWidth: Math.max(360, viewportWidth - REVIEW_EDGE_GAP * 2),
    maxHeight: Math.max(420, viewportHeight - REVIEW_EDGE_GAP * 2),
  };
}

function ensureReviewWindowSize() {
  const { maxWidth, maxHeight } = getReviewWindowMaxSize();
  const minWidth = Math.min(REVIEW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(REVIEW_MIN_HEIGHT, maxHeight);
  if (!reviewWindowWidth.value) {
    reviewWindowWidth.value = maxWidth;
  }
  if (!reviewWindowHeight.value) {
    reviewWindowHeight.value = maxHeight;
  }
  reviewWindowWidth.value = Math.min(Math.max(reviewWindowWidth.value, minWidth), maxWidth);
  reviewWindowHeight.value = Math.min(Math.max(reviewWindowHeight.value, minHeight), maxHeight);
}

function clampReviewWindowPosition(nextX: number, nextY: number) {
  ensureReviewWindowSize();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const panelWidth = reviewWindowWidth.value;
  const panelHeight = reviewWindowHeight.value;
  const minX = REVIEW_EDGE_GAP;
  const minY = REVIEW_EDGE_GAP;
  const maxX = Math.max(minX, viewportWidth - panelWidth - REVIEW_EDGE_GAP);
  const maxY = Math.max(minY, viewportHeight - panelHeight - REVIEW_EDGE_GAP);
  reviewWindowX.value = Math.min(Math.max(nextX, minX), maxX);
  reviewWindowY.value = Math.min(Math.max(nextY, minY), maxY);
}

function clampReviewWindowSize(nextWidth: number, nextHeight: number) {
  const { maxWidth, maxHeight } = getReviewWindowMaxSize();
  const minWidth = Math.min(REVIEW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(REVIEW_MIN_HEIGHT, maxHeight);
  reviewWindowWidth.value = Math.min(Math.max(nextWidth, minWidth), maxWidth);
  reviewWindowHeight.value = Math.min(Math.max(nextHeight, minHeight), maxHeight);
  clampReviewWindowPosition(reviewWindowX.value, reviewWindowY.value);
}

function centerReviewWindow() {
  nextTick(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    ensureReviewWindowSize();
    const panelWidth = reviewWindowWidth.value;
    const panelHeight = reviewWindowHeight.value;
    clampReviewWindowPosition(
      Math.round((viewportWidth - panelWidth) / 2),
      Math.round((viewportHeight - panelHeight) / 2),
    );
  });
}

function handleWindowMouseMove(event: MouseEvent) {
  if (interactionMode === "idle") {
    return;
  }
  if (interactionMode === "drag") {
    clampReviewWindowPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
    return;
  }
  if (interactionMode === "resize") {
    const nextWidth = resizeStartWidth + (event.clientX - resizeStartMouseX);
    const nextHeight = resizeStartHeight + (event.clientY - resizeStartMouseY);
    clampReviewWindowSize(nextWidth, nextHeight);
  }
}

function handleReviewDragStart(event: MouseEvent) {
  if (!reviewVisible.value) {
    return;
  }
  const rect = reviewWindowRef.value?.getBoundingClientRect();
  dragOffsetX = event.clientX - (rect?.left || reviewWindowX.value);
  dragOffsetY = event.clientY - (rect?.top || reviewWindowY.value);
  interactionMode = "drag";
  window.addEventListener("mousemove", handleWindowMouseMove);
  window.addEventListener("mouseup", stopDragging);
}

function handleReviewResizeStart(event: MouseEvent) {
  if (!reviewVisible.value) {
    return;
  }
  event.preventDefault();
  ensureReviewWindowSize();
  interactionMode = "resize";
  resizeStartMouseX = event.clientX;
  resizeStartMouseY = event.clientY;
  resizeStartWidth = reviewWindowWidth.value;
  resizeStartHeight = reviewWindowHeight.value;
  window.addEventListener("mousemove", handleWindowMouseMove);
  window.addEventListener("mouseup", stopDragging);
}

function handleViewportResize() {
  if (!reviewVisible.value) {
    return;
  }
  ensureReviewWindowSize();
  clampReviewWindowPosition(reviewWindowX.value, reviewWindowY.value);
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
const detailFilename = computed(() =>
  String(
    detailArtifacts.value.source_filename ||
      workflowDetail.value?.source_filename ||
      workflowDetail.value?.filename ||
      workflowDetail.value?.original_filename ||
      workflowId.value ||
      "未命名文档",
  ),
);
const canReview = computed(() => Boolean(workflowDetail.value?.review) || detailStatus.value === "WAIT_REVIEW");
const previewRequestHeaders = computed<Record<string, string> | undefined>(() => {
  const token = accessToken.value.trim();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
});
const sourcePreviewUrl = computed(() => {
  if (!workflowId.value || !detailArtifacts.value.source_pdf) {
    return "";
  }
  return buildContractWorkflowArtifactRequest(accessToken.value, workflowId.value, "source_pdf").url;
});
const translatedPreviewUrl = computed(() => {
  if (!workflowId.value || !detailArtifacts.value.translated_pdf) {
    return "";
  }
  if (!["WAIT_REVIEW", "SUCCEEDED"].includes(detailStatus.value)) {
    return "";
  }
  return buildContractWorkflowArtifactRequest(accessToken.value, workflowId.value, "translated_pdf").url;
});

async function loadDetail() {
  if (!workflowId.value) {
    return;
  }
  try {
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
  } catch (error) {
    console.error(error);
    ElMessage.error("加载任务详情失败");
  }
}

async function downloadArtifact(artifactKey: WorkflowArtifactKey) {
  if (!workflowId.value) {
    return;
  }
  downloadingArtifactKey.value = artifactKey;
  try {
    const fallbackFilename = `${workflowId.value}-${artifactKey}.${artifactKey.endsWith("docx") ? "docx" : "pdf"}`;
    const resp = await fetchContractWorkflowArtifactBlob(accessToken.value, workflowId.value, artifactKey);
    const blob = resp.blob;
    const filename = resp.filename;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || fallbackFilename;
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
  reviewVisible.value = true;
  ensureReviewWindowSize();
  centerReviewWindow();
}

function closeReview() {
  reviewVisible.value = false;
  stopDragging();
}

async function handleReviewSubmitted() {
  await loadDetail();
}

watch(
  () => workflowId.value,
  async () => {
    stopPolling();
    closeReview();
    await loadDetail();
  },
  { immediate: true },
);

onUnmounted(() => {
  stopPolling();
  stopDragging();
  window.removeEventListener("resize", handleViewportResize);
});

watch(reviewVisible, (visible) => {
  if (visible) {
    window.addEventListener("resize", handleViewportResize);
  } else {
    window.removeEventListener("resize", handleViewportResize);
  }
});
</script>

<template>
  <div class="task-detail-page">
    <header class="task-header">
      <div class="task-title">
        <div class="task-meta">
          <span class="title-eyebrow">任务详情</span>
          <span class="task-lang">{{ detailLanguagePair }}</span>
        </div>
        <h2>{{ detailFilename }}</h2>
      </div>

      <div class="task-actions">
        <el-button type="primary" :icon="EditPen" :disabled="!canReview" @click="goReview">人工修订</el-button>
      </div>
    </header>

    <section class="detail-layout">
      <article class="preview-column">
        <div class="column-header">
          <strong>原文</strong>
          <el-tag size="small">{{ detailStatus }}</el-tag>
        </div>
        <div class="preview-body">
          <PdfCanvasViewer :src="sourcePreviewUrl" :headers="previewRequestHeaders" empty-text="原文 PDF 暂不可用" />
        </div>
      </article>

      <article class="preview-column">
        <div class="column-header">
          <strong>译文</strong>
          <div class="column-actions">
            <el-button
              size="small"
              plain
              :loading="downloadingArtifactKey === 'translated_pdf'"
              @click="downloadArtifact('translated_pdf')"
            >
              下载 PDF
            </el-button>
            <el-button
              size="small"
              plain
              :icon="Download"
              :loading="downloadingArtifactKey === 'translated_docx'"
              @click="downloadArtifact('translated_docx')"
            >
              下载 Word
            </el-button>
          </div>
        </div>
        <div class="preview-body translated">
          <PdfCanvasViewer :src="translatedPreviewUrl" :headers="previewRequestHeaders" empty-text="译文 PDF 暂不可用" />
        </div>
      </article>
    </section>

    <div
      v-if="reviewVisible"
      ref="reviewWindowRef"
      class="review-floating-window"
      :style="{
        left: `${reviewWindowX}px`,
        top: `${reviewWindowY}px`,
        width: `${reviewWindowWidth}px`,
        height: `${reviewWindowHeight}px`,
      }"
    >
      <TranslateReviewWorkspace
        :workflow-id="workflowId"
        floating
        @close="closeReview"
        @submitted="handleReviewSubmitted"
        @drag-start="handleReviewDragStart"
      />
      <button class="review-resize-handle" type="button" aria-label="调整人工修订窗口大小" @mousedown="handleReviewResizeStart" />
    </div>
  </div>
</template>

<style scoped>
.task-detail-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 6px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.task-header,
.preview-column {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  box-shadow: var(--shadow-soft);
}

.task-header {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.task-title {
  min-width: 0;
  flex: 1;
}

.task-meta {
  margin: 0 0 1px;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.title-eyebrow {
  font-size: 11px;
  color: var(--text-500);
  white-space: nowrap;
}

.task-lang {
  font-size: 11px;
  color: var(--text-500);
  white-space: nowrap;
}

.task-title h2 {
  margin: 0;
  font-size: 17px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
}

.detail-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.preview-column {
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
}

.column-header {
  padding: 12px 16px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.column-header strong {
  font-size: 15px;
}

.column-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-body {
  min-height: 0;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
  border-top: 1px solid rgba(103, 80, 164, 0.08);
}

.preview-body.translated {
  position: relative;
}

.review-floating-window {
  position: fixed;
  z-index: 2000;
  min-height: 260px;
  min-width: 720px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  display: grid;
  overflow: hidden;
}

.review-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  border: 0;
  padding: 0;
  background:
    linear-gradient(135deg, transparent 50%, rgba(110, 86, 207, 0.28) 50%) center/100% 100% no-repeat;
  cursor: nwse-resize;
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
    min-height: 0;
    height: 100%;
  }

  .preview-body {
    min-height: 0;
    height: 100%;
  }

  .review-floating-window {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
    min-height: 0;
    min-width: 0;
  }
}
</style>
