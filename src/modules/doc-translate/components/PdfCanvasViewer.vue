<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, ArrowRight, Minus, Plus } from "@element-plus/icons-vue";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const props = withDefaults(
  defineProps<{
    src?: string;
    emptyText?: string;
  }>(),
  {
    src: "",
    emptyText: "PDF 暂不可用",
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollWrapRef = ref<HTMLDivElement | null>(null);
const viewerRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const page = ref(1);
const pages = ref(0);
const scale = ref(1);
const manualScale = ref(false);

let pdfDoc: any = null;
let loadingTask: any = null;
let renderTask: any = null;
let renderToken = 0;
let loadToken = 0;

const canRender = computed(() => Boolean(props.src));
const zoomText = computed(() => `${Math.round(scale.value * 100)}%`);

async function cleanupDocument() {
  renderToken += 1;
  loadToken += 1;

  if (renderTask) {
    try {
      renderTask.cancel();
      await renderTask.promise.catch(() => undefined);
    } catch {
      // noop
    }
    renderTask = null;
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
  pages.value = 0;
  page.value = 1;
}

async function renderPage() {
  if (!pdfDoc || !canvasRef.value || !canRender.value || !viewerRef.value) {
    return;
  }

  const token = ++renderToken;
  loading.value = true;
  try {
    const pdfPage = await pdfDoc.getPage(page.value);
    if (token !== renderToken) {
      return;
    }

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    let nextScale = scale.value;
    if (!manualScale.value) {
      const availableWidth = Math.max(viewerRef.value.clientWidth - 24, 320);
      nextScale = Math.max(availableWidth / baseViewport.width, 0.35);
      scale.value = Number(nextScale.toFixed(3));
    }

    const viewport = pdfPage.getViewport({ scale: nextScale });
    const canvas = canvasRef.value;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
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
    renderTask = task;
    await task.promise.catch((error: { name?: string }) => {
      if (error?.name !== "RenderingCancelledException") {
        throw error;
      }
    });
    if (renderTask === task) {
      renderTask = null;
    }

    if (token !== renderToken) {
      return;
    }

    await nextTick();
    scrollWrapRef.value?.scrollTo({ top: 0, left: 0 });
  } finally {
    if (token === renderToken) {
      loading.value = false;
    }
  }
}

async function loadDocument() {
  await cleanupDocument();
  if (!props.src) {
    return;
  }

  const token = ++loadToken;
  loading.value = true;
  try {
    const task = pdfjsLib.getDocument(props.src);
    loadingTask = task;
    const doc = await task.promise;
    if (token !== loadToken) {
      await doc.destroy();
      return;
    }

    loadingTask = null;
    pdfDoc = doc;
    pages.value = Number(pdfDoc.numPages || 0);
    page.value = 1;
    await renderPage();
  } catch (error) {
    console.error(error);
    await cleanupDocument();
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

function prevPage() {
  if (page.value > 1) {
    page.value -= 1;
  }
}

function nextPage() {
  if (page.value < pages.value) {
    page.value += 1;
  }
}

watch(
  () => props.src,
  async () => {
    await loadDocument();
  },
  { immediate: true },
);

watch([page, scale], async () => {
  if (pdfDoc) {
    await renderPage();
  }
});

onBeforeUnmount(() => {
  void cleanupDocument();
});

onMounted(() => {
  window.addEventListener("resize", renderPage);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", renderPage);
});
</script>

<template>
  <div ref="viewerRef" class="pdf-viewer">
    <div class="pdf-toolbar">
      <div class="toolbar-left">
        <el-button circle size="small" :icon="ArrowLeft" :disabled="page <= 1" @click="prevPage" />
        <div class="page-indicator">{{ page }} / {{ pages || 1 }}</div>
        <el-button circle size="small" :icon="ArrowRight" :disabled="page >= pages" @click="nextPage" />
      </div>

      <div class="toolbar-right">
        <el-button circle size="small" :icon="Minus" @click="zoomOut" />
        <div class="zoom-indicator">{{ zoomText }}</div>
        <el-button circle size="small" :icon="Plus" @click="zoomIn" />
      </div>
    </div>

    <div ref="scrollWrapRef" class="pdf-stage" v-loading="loading">
      <div v-if="!canRender" class="pdf-empty">{{ emptyText }}</div>
      <div v-else class="pdf-canvas-wrap">
        <canvas ref="canvasRef" class="pdf-canvas" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
  background: #ffffff;
}

.pdf-toolbar {
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f7fc;
  border-bottom: 1px solid rgba(103, 80, 164, 0.12);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-indicator,
.zoom-indicator {
  min-width: 64px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #ffffff;
  color: var(--text-900);
  font-size: 13px;
  border: 1px solid rgba(103, 80, 164, 0.12);
}

.pdf-stage {
  min-height: 0;
  overflow: auto;
  padding: 8px 10px 14px;
  background: #ffffff;
}

.pdf-canvas-wrap {
  min-height: 100%;
  display: grid;
  place-items: start stretch;
}

.pdf-canvas {
  background: #fff;
  width: 100%;
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
