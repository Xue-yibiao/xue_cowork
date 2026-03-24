<script setup lang="ts">
const toolCards = [
  {
    title: "结果对比",
    desc: "后续将接入原文 / 译文双栏对比、页码跳转与局部检索。",
  },
  {
    title: "修订回放",
    desc: "衔接现有 review / apply-patch 能力，沉淀已修订记录与重新生成译文流程。",
  },
  {
    title: "导出助手",
    desc: "用于统一导出当前任务的 PDF / DOCX / 修订摘要等交付物。",
  },
];
</script>

<template>
  <div class="tools-page">
    <section class="tools-hero">
      <div>
        <h2>工具箱</h2>
        <p>为后续的对比、修订、导出和交付能力预留统一入口，先和 simplifyai 的产品结构保持一致。</p>
      </div>
      <el-tag type="info">第一阶段占位页</el-tag>
    </section>

    <section class="tool-grid">
      <article v-for="card in toolCards" :key="card.title" class="tool-card">
        <h3>{{ card.title }}</h3>
        <p>{{ card.desc }}</p>
        <el-button disabled>即将支持</el-button>
      </article>
    </section>
  </div>
</template>

<style scoped>
.tools-page {
  display: grid;
  gap: 18px;
}

.tools-hero,
.tool-card {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.tools-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.tools-hero h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.tools-hero p,
.tool-card p {
  margin: 0;
  color: var(--text-500);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.tool-card h3 {
  margin: 0 0 12px;
}

.tool-card {
  display: grid;
  gap: 18px;
}

@media (max-width: 960px) {
  .tools-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .tool-grid {
    grid-template-columns: 1fr;
  }
}
</style>
