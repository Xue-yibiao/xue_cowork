<script setup lang="ts">
import { computed } from "vue";

type Dict = Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    text?: string | null;
    blockType?: string | null;
    loc?: Dict | null;
    active?: boolean;
    dirty?: boolean;
    editable?: boolean;
    showMeta?: boolean;
    blockId?: string;
  }>(),
  {
    text: "",
    blockType: "",
    loc: null,
    active: false,
    dirty: false,
    editable: false,
    showMeta: false,
    blockId: "",
  },
);

const emit = defineEmits<{
  activate: [];
}>();

const normalizedText = computed(() => String(props.text || "").trim());
const locContainer = computed(() => String((props.loc || {}).container || "").trim().toLowerCase());

function isHeadingText(text: string) {
  if (!text) {
    return false;
  }
  if (text.length > 90) {
    return false;
  }
  if (/^[A-Z0-9\s\-–—:()]+$/.test(text) && text.length <= 60) {
    return true;
  }
  if (/^(chapter|section|annex|appendix|article)\b/i.test(text)) {
    return true;
  }
  if (/^[一二三四五六七八九十]+[、.]/.test(text)) {
    return true;
  }
  if (/^\d+(\.\d+){0,2}\s+\S+/.test(text) && text.length <= 80) {
    return true;
  }
  return false;
}

function isListLine(text: string) {
  return /^(\d+[\.\)]|[A-Za-z][\.\)]|[-*•])\s+/.test(text);
}

const lines = computed(() =>
  normalizedText.value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
);

const renderMode = computed(() => {
  const text = normalizedText.value;
  if (!text) {
    return "paragraph";
  }
  if (props.blockType === "cell_paragraph" || locContainer.value === "table") {
    return "table-cell";
  }
  if (isHeadingText(text)) {
    return "heading";
  }
  if (lines.value.length > 1 && lines.value.every(isListLine)) {
    return "list";
  }
  return "paragraph";
});
</script>

<template>
  <div
    :class="[
      'review-html-block',
      `is-${renderMode}`,
      {
        'is-active': active,
        'is-dirty': dirty,
        'is-editable': editable,
      },
    ]"
    @click="emit('activate')"
  >
    <div v-if="showMeta && blockId" class="block-meta">{{ blockId }}</div>

    <h3 v-if="renderMode === 'heading'" class="block-heading">{{ normalizedText || "-" }}</h3>

    <div v-else-if="renderMode === 'list'" class="block-list">
      <p v-for="(line, index) in lines" :key="`${blockId || 'line'}-${index}`" class="block-list-item">
        {{ line }}
      </p>
    </div>

    <div v-else-if="renderMode === 'table-cell'" class="block-table-cell">
      <p v-for="(line, index) in lines.length ? lines : ['-']" :key="`${blockId || 'cell'}-${index}`" class="block-cell-line">
        {{ line }}
      </p>
    </div>

    <div v-else class="block-paragraph">
      <p v-for="(line, index) in lines.length ? lines : ['-']" :key="`${blockId || 'p'}-${index}`" class="block-paragraph-line">
        {{ line }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.review-html-block {
  min-height: 100%;
  border-radius: 12px;
  transition: background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.review-html-block.is-editable {
  cursor: text;
}

.review-html-block.is-active {
  background: rgba(98, 105, 214, 0.05);
}

.review-html-block.is-dirty {
  background: rgba(63, 161, 95, 0.05);
}

.block-meta {
  margin-bottom: 10px;
  font-size: 10px;
  color: #9a96aa;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.block-heading {
  margin: 0;
  font-size: 1.18rem;
  line-height: 1.45;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #27233a;
}

.block-list,
.block-paragraph,
.block-table-cell {
  display: grid;
  gap: 8px;
}

.block-list-item,
.block-paragraph-line,
.block-cell-line {
  margin: 0;
  color: #363243;
  line-height: 1.85;
}

.block-list-item {
  padding-left: 0.2rem;
}

.block-table-cell {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(103, 80, 164, 0.1);
  background: rgba(248, 249, 255, 0.72);
}
</style>
