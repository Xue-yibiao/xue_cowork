<script setup lang="ts">
import { ElMessage } from "element-plus";
import { Plus, RefreshRight, Upload } from "@element-plus/icons-vue";

function showComingSoon() {
  ElMessage.info("记忆库页面已预留，当前阶段先对齐产品体验，后端记忆 CRUD 将在下一阶段接入。");
}
</script>

<template>
  <div class="memory-page">
    <section class="memory-header">
      <div>
        <h2>记忆库</h2>
        <p>沉淀高频确认译文、表达偏好和格式习惯，形成更稳定的个人翻译记忆。</p>
      </div>

      <div class="header-actions">
        <el-button :icon="Plus" @click="showComingSoon">新建记忆</el-button>
        <el-button :icon="Upload" @click="showComingSoon">从修订添加</el-button>
        <el-button circle :icon="RefreshRight" @click="showComingSoon" />
      </div>
    </section>

    <section class="memory-body">
      <div class="memory-hero">记</div>
      <h3>开始使用记忆库</h3>
      <div class="memory-copy">
        <p>个性化翻译记忆：沉淀你确认过的高质量译文，逐步形成稳定风格。</p>
        <p>智能参考：后续在翻译新文档时，系统可以检索相似语句作为建议。</p>
        <p>多种添加方式：既可以手工录入，也可以从修订记录中择优加入。</p>
        <p>支持多语言：后续会与词库一起，形成完整的语言资产工作台。</p>
      </div>

      <div class="hero-actions">
        <el-button type="primary" @click="showComingSoon">新建记忆</el-button>
        <el-button @click="showComingSoon">从修订添加</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.memory-page {
  display: grid;
  gap: 18px;
}

.memory-header,
.memory-body {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.memory-header h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.memory-header p {
  margin: 0;
  color: var(--text-500);
}

.header-actions,
.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.memory-body {
  min-height: 560px;
  display: grid;
  place-items: center;
  text-align: center;
}

.memory-hero {
  width: 100px;
  height: 100px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #f2efff, #fbfaff);
  color: var(--brand-500);
  font-size: 42px;
  font-weight: 700;
}

.memory-body h3 {
  margin: 12px 0 0;
  font-size: 30px;
}

.memory-copy {
  width: min(680px, 100%);
  padding: 22px 24px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(248, 247, 255, 0.9), rgba(255, 255, 255, 0.94));
  text-align: left;
}

.memory-copy p {
  margin: 0 0 14px;
  color: var(--text-700);
}

.memory-copy p:last-child {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .memory-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions,
  .hero-actions {
    flex-wrap: wrap;
  }
}
</style>
