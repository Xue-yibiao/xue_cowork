<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import TranslateReviewWorkspace from "../components/TranslateReviewWorkspace.vue";

const route = useRoute();
const workflowId = computed(() => String(route.params.workflowId || "").trim());
</script>

<template>
  <div class="review-page">
    <TranslateReviewWorkspace :workflow-id="workflowId" />
  </div>
</template>

<style scoped>
.review-page {
  min-height: calc(100vh - 132px);
  border: 1px solid rgba(103, 80, 164, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}
</style>
