<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Minus, Plus } from "@element-plus/icons-vue";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const props = withDefaults(
  defineProps<{
    data?: Uint8Array | null;
    emptyText?: string;
  }>(),
  {
    data: null,
    emptyText: "PDF 暂不可用",
  },
);

const canvasRefs = ref<(HTMLCanvasElement | null)[]>([]);
const scrollWrapRef = ref<HTMLDivElement | null>(null);
const viewerRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const pages = ref(0);
const scale = ref(1);
const manualScale = ref(false);
const errorText = ref("");
const pageNumbers = ref<number[]>([]);

let pdfDoc: any = null;
let loadingTask: any = null;
const renderTasks = new Set<any>();
let renderToken = 0;
let loadToken = 0;

const canRender = computed(() => Boolean(props.data?.length));
const zoomText = computed(() => `${Math.round(scale.value * 100)}%`);
function setCanvasRef(index: number, el: HTMLCanvasElement | null) {
  canvasRefs.value[index] = el;
}

async function cleanupDocument(options?: { keepError?: boolean }) {
  renderToken += 1;
  loadToken += 1;

  const pendingTasks = Array.from(renderTasks);
  renderTasks.clear();
  for (const task of pendingTasks) {
    try {
      task.cancel?.();
      await task.promise?.catch(() => undefined);
    } catch {
      // noop
    }
  }

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
  if (!options?.keepError) {
    errorText.value = "";
  }
  pages.value = 0;
  pageNumbers.value = [];
  canvasRefs.value = [];
}

async function renderAllPages() {
  if (!pdfDoc || !canRender.value || !viewerRef.value || !scrollWrapRef.value || !pageNumbers.value.length) {
    return;
  }

  const token = ++renderToken;
  loading.value = true;
  errorText.value = "";
  try {
    const firstPage = await pdfDoc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    let nextScale = scale.value;
    if (!manualScale.value) {
      const availableWidth = Math.max(scrollWrapRef.value.clientWidth - 28, 320);
      nextScale = Math.max(availableWidth / baseViewport.width, 0.35);
      scale.value = Number(nextScale.toFixed(3));
    }

    await nextTick();

    for (const [index, pageNo] of pageNumbers.value.entries()) {
      if (token !== renderToken) {
        return;
      }

      const canvas = canvasRefs.value[index];
      if (!canvas) {
        continue;
      }

      const pdfPage = await pdfDoc.getPage(pageNo);
      const viewport = pdfPage.getViewport({ scale: nextScale });
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }

      const ratio = window.devicePixelRatio || 1;
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
      renderTasks.add(task);
      await task.promise.catch((error: { name?: string }) => {
        if (error?.name !== "RenderingCancelledException") {
          throw error;
        }
      });
      renderTasks.delete(task);
    }
  } catch (error) {
    console.error(error);
    errorText.value = "当前环境暂时无法完成 PDF 预览，请下载文件查看。";
  } finally {
    if (token === renderToken) {
      loading.value = false;
    }
  }
}

async function loadDocument() {
  await cleanupDocument();
  if (!props.data?.length) {
    return;
  }

  const token = ++loadToken;
  loading.value = true;
  try {
    const task = pdfjsLib.getDocument({
      data: props.data,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    loadingTask = task;
    const doc = await task.promise;
    if (token !== loadToken) {
      await doc.destroy();
      return;
    }

    loadingTask = null;
    pdfDoc = doc;
    pages.value = Number(pdfDoc.numPages || 0);
    pageNumbers.value = Array.from({ length: pages.value }, (_, index) => index + 1);
    canvasRefs.value = Array.from({ length: pages.value }, () => null);
    await nextTick();
    await renderAllPages();
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

watch(
  () => props.data,
  async () => {
    await loadDocument();
  },
  { immediate: true },
);

watch(scale, async () => {
  if (pdfDoc) {
    await renderAllPages();
  }
});

function handleResize() {
  if (!pdfDoc || manualScale.value) {
    return;
  }
  void renderAllPages();
}

onBeforeUnmount(() => {
  void cleanupDocument();
});

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<template>
  <div ref="viewerRef" class="pdf-viewer">
    <div class="pdf-toolbar">
      <div class="toolbar-spacer" />
      <div class="toolbar-right">
        <el-button circle size="small" :icon="Minus" @click="zoomOut" />
        <div class="zoom-indicator">{{ zoomText }}</div>
        <el-button circle size="small" :icon="Plus" @click="zoomIn" />
      </div>
    </div>

    <div ref="scrollWrapRef" class="pdf-stage" v-loading="loading">
      <div v-if="!canRender" class="pdf-empty">{{ emptyText }}</div>
      <div v-else-if="errorText" class="pdf-empty">{{ errorText }}</div>
      <div v-else class="pdf-canvas-wrap">
        <section v-for="(pageNo, index) in pageNumbers" :key="pageNo" class="pdf-page-card">
          <canvas :ref="(el) => setCanvasRef(index, el as HTMLCanvasElement | null)" class="pdf-canvas" />
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
  display: grid;
  gap: 16px;
  padding-bottom: 4px;
}

.pdf-page-card {
  display: grid;
  justify-items: center;
}

.pdf-canvas {
  background: #fff;
  max-width: 100%;
  box-shadow: 0 8px 24px rgba(69, 52, 132, 0.08);
}

.pdf-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-500);
  font-size: 14px;
}
</style>
