# Dual Table A4 Print Implementation Plan

> **For agentic workers:** Execute inline in this session. Steps use checkbox syntax.

**Goal:** Vue3 页面：左右并排相同结构表格、中间缝隙、数据均分、按实测行高分页，避免 A4 半行截断。

**Architecture:** `printDualTable.ts` 负责 mock/均分/装页纯逻辑；页面负责 DOM 测量、预览与 `window.print()`。

**Tech Stack:** Vue 3 + TypeScript + ant-design-vue + 浏览器打印 CSS

## Global Constraints

- 不引入 html2canvas / jsPDF
- 默认 A4 纵向，可切横向并重测
- 每表 3 列：序号 / 名称 / 备注

### Task 1: Utils + Page + Router

- Create: `src/utils/printDualTable.ts`
- Create: `src/views/PrintDualTablePage.vue`
- Modify: `src/router/index.ts`, `src/App.vue`
- Verify: `npm run build`
