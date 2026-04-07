<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Minus, Plus } from "@element-plus/icons-vue";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { readAuthSnapshot, writeAuthSnapshot } from "../../../shared/auth-session";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PageSlot = {
  pageNo: number;
  baseWidth: number;
  baseHeight: number;
  displayWidth: number;
  displayHeight: number;
  top: number;
};

const PAGE_GAP = 16;
const MIN_FIT_SCALE = 0.35;
const MAX_DEVICE_PIXEL_RATIO = 2;

const props = withDefaults(
  defineProps<{
    src?: string | null;
    headers?: Record<string, string> | null;
    data?: Uint8Array | null;
    emptyText?: string;
  }>(),
  {
    src: "",
    headers: null,
    data: null,
    emptyText: "PDF 暂不可用",
  },
);

const scrollWrapRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const pages = ref(0);
const scale = ref(1);
const manualScale = ref(false);
const errorText = ref("");
const pageSlots = ref<PageSlot[]>([]);
const paintedPages = ref<Record<number, string>>({});
const visibleRange = ref({ start: 0, end: -1 });
const totalContentHeight = ref(0);
const defaultBaseWidth = ref(816);
const defaultBaseHeight = ref(1056);

let pdfDoc: any = null;
let loadingTask: any = null;
const canvasRefs = new Map<number, HTMLCanvasElement>();
const renderTasks = new Map<number, any>();
let renderToken = 0;
let loadToken = 0;
let scrollFrame: number | null = null;
let suppressScaleWatcher = false;
let queuedRenderVersion = 0;
let renderSequence: Promise<void> = Promise.resolve();
let refreshingAccessTokenPromise: Promise<Record<string, string> | undefined> | null = null;

const sourceUrl = computed(() => String(props.src || "").trim());
const canRender = computed(() => Boolean(sourceUrl.value) || Boolean(props.data?.length));
const visiblePages = computed(() => {
  if (visibleRange.value.end < visibleRange.value.start) {
    return [];
  }
  return pageSlots.value.slice(visibleRange.value.start, visibleRange.value.end + 1);
});
const zoomText = computed(() => `${Math.round(scale.value * 100)}%`);

function setCanvasRef(pageNo: number, el: HTMLCanvasElement | null) {
  if (el) {
    canvasRefs.set(pageNo, el);
    return;
  }
  canvasRefs.delete(pageNo);
  const next = { ...paintedPages.value };
  delete next[pageNo];
  paintedPages.value = next;
}

function isPagePainted(pageNo: number) {
  return paintedPages.value[pageNo] === scale.value.toFixed(3);
}

async function cancelRenderTasks() {
  const pendingTasks = Array.from(renderTasks.values());
  renderTasks.clear();
  for (const task of pendingTasks) {
    try {
      task.cancel?.();
      await task.promise?.catch(() => undefined);
    } catch {
      // noop
    }
  }
}

async function cleanupDocument(options?: { keepError?: boolean }) {
  renderToken += 1;
  loadToken += 1;

  if (scrollFrame !== null) {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }

  await cancelRenderTasks();

  if (loadingTask) {
    try {
      loadingTask.destroy?.();
    } catch {
      // noop
    }
    loadingTask = null;
  }

  if (pdfDoc) {
    try {
      await pdfDoc.destroy();
    } catch {
      // noop
    }
  }

  pdfDoc = null;
  canvasRefs.clear();
  if (!options?.keepError) {
    errorText.value = "";
  }
  pages.value = 0;
  pageSlots.value = [];
  paintedPages.value = {};
  totalContentHeight.value = 0;
  visibleRange.value = { start: 0, end: -1 };
}

function buildPageSlots(pageCount: number, width: number, height: number) {
  return Array.from({ length: pageCount }, (_, index) => ({
    pageNo: index + 1,
    baseWidth: width,
    baseHeight: height,
    displayWidth: 0,
    displayHeight: 0,
    top: 0,
  }));
}

function fitScaleToContainer(options?: { suppressWatcher?: boolean }) {
  if (manualScale.value || !scrollWrapRef.value) {
    return;
  }
  const availableWidth = Math.max(scrollWrapRef.value.clientWidth - 28, 320);
  const nextScale = Math.max(availableWidth / Math.max(defaultBaseWidth.value, 1), MIN_FIT_SCALE);
  const roundedScale = Number(nextScale.toFixed(3));
  if (scale.value === roundedScale) {
    return;
  }
  if (options?.suppressWatcher) {
    suppressScaleWatcher = true;
  }
  scale.value = roundedScale;
}

function rebuildPageLayouts() {
  if (!pageSlots.value.length) {
    totalContentHeight.value = 0;
    return;
  }

  let top = 0;
  pageSlots.value = pageSlots.value.map((slot) => {
    const baseWidth = slot.baseWidth || defaultBaseWidth.value;
    const baseHeight = slot.baseHeight || defaultBaseHeight.value;
    const displayWidth = Number((baseWidth * scale.value).toFixed(2));
    const displayHeight = Number((baseHeight * scale.value).toFixed(2));
    const nextSlot = {
      ...slot,
      displayWidth,
      displayHeight,
      top,
    };
    top += displayHeight + PAGE_GAP;
    return nextSlot;
  });

  totalContentHeight.value = Math.max(1, top - PAGE_GAP);
}

function updatePageBaseSize(pageNo: number, width: number, height: number) {
  const index = pageNo - 1;
  const current = pageSlots.value[index];
  if (!current) {
    return;
  }

  const nextWidth = Number(width.toFixed(2));
  const nextHeight = Number(height.toFixed(2));
  if (Math.abs(current.baseWidth - nextWidth) < 0.1 && Math.abs(current.baseHeight - nextHeight) < 0.1) {
    return;
  }

  if (pageNo === 1) {
    defaultBaseWidth.value = nextWidth;
    defaultBaseHeight.value = nextHeight;
  }

  const nextSlots = [...pageSlots.value];
  nextSlots[index] = {
    ...current,
    baseWidth: nextWidth,
    baseHeight: nextHeight,
  };
  pageSlots.value = nextSlots;
  rebuildPageLayouts();
}

function findPageIndexByOffset(offset: number) {
  if (!pageSlots.value.length) {
    return -1;
  }

  let low = 0;
  let high = pageSlots.value.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slot = pageSlots.value[mid];
    if (!slot) {
      break;
    }
    const start = slot.top;
    const end = slot.top + slot.displayHeight + PAGE_GAP;
    if (offset < start) {
      high = mid - 1;
    } else if (offset >= end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return Math.min(Math.max(low, 0), pageSlots.value.length - 1);
}

function scheduleVisibleWindowUpdate(options?: { force?: boolean }) {
  if (scrollFrame !== null) {
    cancelAnimationFrame(scrollFrame);
  }
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = null;
    updateVisibleWindow(options);
  });
}

function queueVisibleRender(options?: { interrupt?: boolean }) {
  const version = ++queuedRenderVersion;
  if (options?.interrupt) {
    renderToken += 1;
  }
  renderSequence = renderSequence
    .catch(() => undefined)
    .then(async () => {
      if (version !== queuedRenderVersion) {
        return;
      }
      await renderVisiblePages();
    });
}

function updateVisibleWindow(options?: { force?: boolean }) {
  const viewport = scrollWrapRef.value;
  if (!viewport || !pageSlots.value.length) {
    visibleRange.value = { start: 0, end: -1 };
    return;
  }

  const overscan = Math.max(viewport.clientHeight * 1.25, 900);
  const start = findPageIndexByOffset(Math.max(0, viewport.scrollTop - overscan));
  const end = findPageIndexByOffset(viewport.scrollTop + viewport.clientHeight + overscan);
  if (!options?.force && start === visibleRange.value.start && end === visibleRange.value.end) {
    return;
  }

  visibleRange.value = { start, end };
  void nextTick(() => queueVisibleRender({ interrupt: true }));
}

async function renderVisiblePages() {
  if (!pdfDoc || !visiblePages.value.length) {
    return;
  }

  const token = ++renderToken;
  errorText.value = "";
  await cancelRenderTasks();
  await nextTick();

  const viewport = scrollWrapRef.value;
  const viewportCenter = viewport ? viewport.scrollTop + viewport.clientHeight / 2 : 0;
  const queue = [...visiblePages.value].sort((left, right) => {
    const leftDistance = Math.abs(left.top + left.displayHeight / 2 - viewportCenter);
    const rightDistance = Math.abs(right.top + right.displayHeight / 2 - viewportCenter);
    return leftDistance - rightDistance;
  });

  for (const slot of queue) {
    if (token !== renderToken) {
      return;
    }
    await ensurePageRendered(slot.pageNo, token);
  }
}

function isBenignRenderError(error: unknown) {
  const name = String((error as { name?: string } | null)?.name || "");
  const message = String((error as { message?: string } | null)?.message || "");
  if (name === "RenderingCancelledException") {
    return true;
  }
  return message.includes("Cannot use the same canvas during multiple render() operations");
}

async function refreshPreviewHeaders(): Promise<Record<string, string> | undefined> {
  const snapshot = readAuthSnapshot();
  const refreshToken = String(snapshot?.mode === "bearer" ? snapshot?.refreshToken || "" : "").trim();
  if (!refreshToken) {
    return props.headers ? { ...props.headers } : undefined;
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const response = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`refresh preview token failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; refresh_token?: string | null };
  const nextAccessToken = String(data.access_token || "").trim();
  if (!nextAccessToken) {
    throw new Error("refresh preview token missing access token");
  }

  writeAuthSnapshot({
    ...snapshot,
    mode: "bearer",
    accessToken: nextAccessToken,
    refreshToken: String(data.refresh_token || "").trim() || refreshToken,
  });

  return {
    ...(props.headers || {}),
    Authorization: `Bearer ${nextAccessToken}`,
  };
}

async function resolvePreviewHeaders(): Promise<Record<string, string> | undefined> {
  const snapshot = readAuthSnapshot();
  const accessToken = String(snapshot?.mode === "bearer" ? snapshot?.accessToken || "" : "").trim();
  const refreshToken = String(snapshot?.mode === "bearer" ? snapshot?.refreshToken || "" : "").trim();
  if (!refreshToken) {
    return props.headers ? { ...props.headers } : undefined;
  }
  if (accessToken) {
    return {
      ...(props.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    };
  }

  refreshingAccessTokenPromise = refreshingAccessTokenPromise || refreshPreviewHeaders();
  try {
    return await refreshingAccessTokenPromise;
  } finally {
    refreshingAccessTokenPromise = null;
  }
}

async function ensurePageRendered(pageNo: number, token: number) {
  if (!pdfDoc) {
    return;
  }

  const canvas = canvasRefs.get(pageNo);
  if (!canvas) {
    return;
  }

  const renderScaleKey = scale.value.toFixed(3);
  if (paintedPages.value[pageNo] === renderScaleKey && canvas.width > 0 && canvas.height > 0) {
    return;
  }

  try {
    const pdfPage = await pdfDoc.getPage(pageNo);
    if (token !== renderToken) {
      return;
    }

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    updatePageBaseSize(pageNo, baseViewport.width, baseViewport.height);

    const viewport = pdfPage.getViewport({ scale: scale.value });
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    const task = pdfPage.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    renderTasks.set(pageNo, task);

    await task.promise.catch((error: { name?: string }) => {
      if (error?.name !== "RenderingCancelledException") {
        throw error;
      }
    });

    if (token !== renderToken) {
      return;
    }

    const nextPainted = { ...paintedPages.value };
    nextPainted[pageNo] = renderScaleKey;
    paintedPages.value = nextPainted;
  } catch (error) {
    if (isBenignRenderError(error)) {
      console.warn(error);
      return;
    }
    console.error(error);
    errorText.value = "当前环境暂时无法完成 PDF 预览，请下载文件查看。";
  } finally {
    renderTasks.delete(pageNo);
  }
}

async function loadDocument() {
  await cleanupDocument();
  if (!canRender.value) {
    return;
  }

  const token = ++loadToken;
  loading.value = true;
  try {
    const loadingParams: Record<string, unknown> = {
      isEvalSupported: false,
      disableStream: false,
      disableAutoFetch: false,
      rangeChunkSize: 1 << 16,
    };

    if (sourceUrl.value) {
      loadingParams.url = sourceUrl.value;
      const nextHeaders = await resolvePreviewHeaders();
      if (nextHeaders && Object.keys(nextHeaders).length) {
        loadingParams.httpHeaders = nextHeaders;
      }
      loadingParams.withCredentials = true;
    } else {
      loadingParams.data = props.data;
      loadingParams.useWorkerFetch = false;
    }

    const task = (pdfjsLib as any).getDocument(loadingParams);
    loadingTask = task;
    const doc = await task.promise;
    if (token !== loadToken) {
      await doc.destroy();
      return;
    }

    loadingTask = null;
    pdfDoc = doc;
    pages.value = Number(pdfDoc.numPages || 0);
    const firstPage = await pdfDoc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    defaultBaseWidth.value = Number(firstViewport.width || 816);
    defaultBaseHeight.value = Number(firstViewport.height || 1056);
    pageSlots.value = buildPageSlots(pages.value, defaultBaseWidth.value, defaultBaseHeight.value);
    fitScaleToContainer({ suppressWatcher: true });
    rebuildPageLayouts();
    await nextTick();
    updateVisibleWindow({ force: true });
  } catch (error) {
    console.error(error);
    errorText.value = "当前环境暂时无法完成 PDF 预览，请下载文件查看。";
    await cleanupDocument({ keepError: true });
  } finally {
    loading.value = false;
  }
}

function zoomIn() {
  manualScale.value = true;
  scale.value = Math.min(scale.value + 0.1, 2.4);
}

function zoomOut() {
  manualScale.value = true;
  scale.value = Math.max(scale.value - 0.1, 0.6);
}

function handleScroll() {
  scheduleVisibleWindowUpdate();
}

function handleResize() {
  if (!pdfDoc) {
    return;
  }
  fitScaleToContainer({ suppressWatcher: true });
  rebuildPageLayouts();
  updateVisibleWindow({ force: true });
}

watch(
  () => [sourceUrl.value, JSON.stringify(props.headers || {}), props.data?.byteLength || 0],
  async () => {
    await loadDocument();
  },
  { immediate: true },
);

watch(scale, () => {
  if (suppressScaleWatcher) {
    suppressScaleWatcher = false;
    return;
  }
  if (!pdfDoc) {
    return;
  }
  rebuildPageLayouts();
  paintedPages.value = {};
  updateVisibleWindow({ force: true });
});

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  void cleanupDocument();
});
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-toolbar">
      <div class="toolbar-spacer">{{ pages ? `${pages} 页` : "" }}</div>
      <div class="toolbar-right">
        <el-button circle size="small" :icon="Minus" @click="zoomOut" />
        <div class="zoom-indicator">{{ zoomText }}</div>
        <el-button circle size="small" :icon="Plus" @click="zoomIn" />
      </div>
    </div>

    <div ref="scrollWrapRef" class="pdf-stage" v-loading="loading" @scroll.passive="handleScroll">
      <div v-if="!canRender" class="pdf-empty">{{ emptyText }}</div>
      <div v-else-if="errorText" class="pdf-empty">{{ errorText }}</div>
      <div v-else class="pdf-canvas-wrap" :style="{ height: `${totalContentHeight}px` }">
        <section
          v-for="page in visiblePages"
          :key="page.pageNo"
          class="pdf-page-card"
          :style="{ top: `${page.top}px` }"
        >
          <div
            class="pdf-page-shell"
            :style="{ width: `${page.displayWidth}px`, height: `${page.displayHeight}px` }"
          >
            <div v-if="!isPagePainted(page.pageNo)" class="pdf-page-placeholder">
              <span>第 {{ page.pageNo }} 页</span>
            </div>
            <canvas :ref="(el) => setCanvasRef(page.pageNo, el as HTMLCanvasElement | null)" class="pdf-canvas" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  height: 100%;
  min-height: 0;
  position: relative;
  background: #ffffff;
  overflow: hidden;
}

.pdf-toolbar {
  position: absolute;
  top: 6px;
  left: 8px;
  right: 8px;
  z-index: 2;
  min-height: 40px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 1px solid rgba(103, 80, 164, 0.08);
  border-radius: 14px;
  pointer-events: auto;
}

.toolbar-spacer,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-indicator {
  min-width: 56px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(4px);
  color: var(--text-900);
  font-size: 12px;
  border: 1px solid rgba(103, 80, 164, 0.1);
}

.pdf-stage {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 52px 8px 10px;
  background: transparent;
}

.pdf-canvas-wrap {
  position: relative;
  min-height: 100%;
  padding-bottom: 4px;
}

.pdf-page-card {
  position: absolute;
  left: 0;
  width: 100%;
  display: grid;
  justify-items: center;
}

.pdf-page-shell {
  position: relative;
  background: #fff;
  box-shadow: 0 8px 24px rgba(69, 52, 132, 0.08);
}

.pdf-page-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-500);
  font-size: 13px;
  border: 1px dashed rgba(103, 80, 164, 0.14);
  background:
    linear-gradient(180deg, rgba(245, 247, 255, 0.9), rgba(255, 255, 255, 0.96));
}

.pdf-canvas {
  background: #fff;
  max-width: 100%;
  position: relative;
  z-index: 1;
}

.pdf-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-500);
  font-size: 14px;
}
</style>
