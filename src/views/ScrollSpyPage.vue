<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface TocItem {
  id: string
  title: string
  children?: { id: string; title: string }[]
}

const HEADER_HEIGHT = 56

const toc: TocItem[] = [
  {
    id: 'intro',
    title: '1. 概述',
    children: [
      { id: 'intro-goal', title: '1.1 目标' },
      { id: 'intro-scene', title: '1.2 适用场景' },
    ],
  },
  {
    id: 'layout',
    title: '2. 布局结构',
    children: [
      { id: 'layout-header', title: '2.1 顶部 Header' },
      { id: 'layout-aside', title: '2.2 左侧目录' },
      { id: 'layout-main', title: '2.3 右侧内容' },
    ],
  },
  {
    id: 'scroll',
    title: '3. 滚动联动',
    children: [
      { id: 'scroll-click', title: '3.1 点击目录定位' },
      { id: 'scroll-spy', title: '3.2 滚动高亮目录' },
      { id: 'scroll-toc-into-view', title: '3.3 目录滚入可视区' },
    ],
  },
  {
    id: 'offset',
    title: '4. 顶部遮挡处理',
  },
  {
    id: 'api',
    title: '5. 实现要点',
    children: [
      { id: 'api-observer', title: '5.1 IntersectionObserver' },
      { id: 'api-flag', title: '5.2 点击锁' },
      { id: 'api-smooth', title: '5.3 平滑滚动' },
    ],
  },
  {
    id: 'faq',
    title: '6. 常见问题',
  },
  {
    id: 'checklist',
    title: '7. 验收清单',
    children: [
      { id: 'checklist-click', title: '7.1 点击定位' },
      { id: 'checklist-spy', title: '7.2 滚动高亮' },
      { id: 'checklist-bottom', title: '7.3 滚到底部' },
    ],
  },
  {
    id: 'end',
    title: '8. 总结',
  },
]

const flatIds = toc.flatMap((item) => [
  item.id,
  ...(item.children?.map((c) => c.id) ?? []),
])
const lastId = flatIds[flatIds.length - 1]

const activeId = ref(flatIds[0])
const tocRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const tocItemRefs = new Map<string, HTMLElement>()

let observer: IntersectionObserver | null = null
let lockFromClick = false
let lockTimer: ReturnType<typeof setTimeout> | null = null

function setTocItemRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) tocItemRefs.set(id, el)
  else tocItemRefs.delete(id)
}

function scrollTocIntoView(id: string) {
  const tocEl = tocRef.value
  const itemEl = tocItemRefs.get(id)
  if (!tocEl || !itemEl) return

  // 最后一项：滚到目录底部，保证可见（已在底部则不再重复滚动）
  if (id === lastId) {
    const maxScroll = tocEl.scrollHeight - tocEl.clientHeight
    if (maxScroll > 0 && Math.abs(tocEl.scrollTop - maxScroll) > 2) {
      tocEl.scrollTo({ top: maxScroll, behavior: 'smooth' })
    }
    return
  }

  const tocRect = tocEl.getBoundingClientRect()
  const itemRect = itemEl.getBoundingClientRect()
  const padding = 8

  if (itemRect.top < tocRect.top + padding) {
    tocEl.scrollBy({ top: itemRect.top - tocRect.top - padding, behavior: 'smooth' })
    return
  }
  if (itemRect.bottom > tocRect.bottom - padding) {
    tocEl.scrollBy({ top: itemRect.bottom - tocRect.bottom + padding, behavior: 'smooth' })
  }
}

function setActive(id: string) {
  if (activeId.value === id) return
  activeId.value = id
  nextTick(() => scrollTocIntoView(id))
}

/** 点击目录：右侧滚到对应区块顶部，且不被 Header 遮挡 */
function onTocClick(id: string) {
  const content = contentRef.value
  const section = content?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!content || !section) return

  lockFromClick = true
  if (lockTimer) clearTimeout(lockTimer)

  setActive(id)

  const sectionTop = section.getBoundingClientRect().top
  const contentTop = content.getBoundingClientRect().top
  const targetTop = content.scrollTop + (sectionTop - contentTop) - HEADER_HEIGHT

  content.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth',
  })

  lockTimer = setTimeout(() => {
    lockFromClick = false
  }, 600)
}

function setupObserver() {
  const content = contentRef.value
  if (!content) return

  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      if (lockFromClick) return

      // 已滚到底时，Observer 不必抢高亮（由 scroll 兜底锁定最后一项）
      const atBottom =
        content.scrollTop + content.clientHeight >= content.scrollHeight - 4
      if (atBottom) return

      const visible = entries
        .filter((e) => e.isIntersecting)
        .map((e) => ({
          id: (e.target as HTMLElement).id,
          top: e.boundingClientRect.top,
        }))
        .sort((a, b) => a.top - b.top)

      if (!visible.length) return

      const contentTop = content.getBoundingClientRect().top + HEADER_HEIGHT
      const best =
        visible.find((v) => v.top >= contentTop - 8) ?? visible[visible.length - 1]

      if (best?.id) setActive(best.id)
    },
    {
      root: content,
      rootMargin: `-${HEADER_HEIGHT + 8}px 0px -55% 0px`,
      threshold: [0, 0.1, 0.25, 0.5, 1],
    },
  )

  for (const id of flatIds) {
    const el = content.querySelector(`#${CSS.escape(id)}`)
    if (el) observer.observe(el)
  }
}

/** 滚动兜底：含「滚到底 → 高亮并滚到最后一个目录」 */
function onContentScroll() {
  if (lockFromClick) return
  const content = contentRef.value
  if (!content) return

  const atBottom =
    content.scrollTop + content.clientHeight >= content.scrollHeight - 4
  if (atBottom) {
    // 右侧到底：强制最后一项高亮，并确保左侧目录滚到最后
    if (activeId.value !== lastId) setActive(lastId)
    else scrollTocIntoView(lastId)
    return
  }

  const scrollTop = content.scrollTop + HEADER_HEIGHT + 12
  let current = flatIds[0]

  for (const id of flatIds) {
    const el = content.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!el) continue
    if (el.offsetTop <= scrollTop) current = id
    else break
  }

  setActive(current)
}

onMounted(() => {
  setupObserver()
  contentRef.value?.addEventListener('scroll', onContentScroll, { passive: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  contentRef.value?.removeEventListener('scroll', onContentScroll)
  if (lockTimer) clearTimeout(lockTimer)
})
</script>

<template>
  <div class="doc-page">
    <header class="doc-header">
      <div class="doc-header-inner">
        <strong>文档目录联动</strong>
        <span class="sub">点击目录定位 · 滚动高亮 · 目录自动滚入可视区</span>
      </div>
    </header>

    <div class="doc-body">
      <aside ref="tocRef" class="doc-toc">
        <div class="toc-caption">目录</div>
        <nav>
          <template v-for="item in toc" :key="item.id">
            <a
              :ref="(el) => setTocItemRef(item.id, el)"
              href="javascript:;"
              class="toc-link"
              :class="{ active: activeId === item.id, level1: true }"
              @click.prevent="onTocClick(item.id)"
            >
              {{ item.title }}
            </a>
            <a
              v-for="child in item.children"
              :key="child.id"
              :ref="(el) => setTocItemRef(child.id, el)"
              href="javascript:;"
              class="toc-link level2"
              :class="{ active: activeId === child.id }"
              @click.prevent="onTocClick(child.id)"
            >
              {{ child.title }}
            </a>
          </template>
        </nav>
      </aside>

      <main ref="contentRef" class="doc-content">
        <section id="intro" class="section">
          <h2>1. 概述</h2>
          <p>
            本页演示「顶部 Header + 左侧目录 + 右侧内容」的经典文档布局，以及目录与内容的双向滚动联动。
          </p>
          <div id="intro-goal" class="subsection">
            <h3>1.1 目标</h3>
            <ul>
              <li>点击目录，右侧对应章节滚到可视区顶部，且不被 Header 遮挡</li>
              <li>右侧滚动时，左侧目录同步高亮当前章节</li>
              <li>当前目录项若不在左侧可视区，自动滚入可视区</li>
            </ul>
            <p v-for="n in 4" :key="'g' + n" class="filler">
              目标说明补充段落 {{ n }}：用于拉长页面，方便测试滚动与高亮切换。
            </p>
          </div>
          <div id="intro-scene" class="subsection">
            <h3>1.2 适用场景</h3>
            <p>帮助文档、协议正文、商品详情锚点、后台配置说明书等长文结构。</p>
            <p v-for="n in 5" :key="'s' + n" class="filler">
              场景示例段落 {{ n }}。你可以继续向下滚动，观察左侧目录高亮变化。
            </p>
          </div>
        </section>

        <section id="layout" class="section">
          <h2>2. 布局结构</h2>
          <p>整体分为 Header、Aside（目录）、Main（内容）三块，内容区独立滚动。</p>
          <div id="layout-header" class="subsection">
            <h3>2.1 顶部 Header</h3>
            <p>固定高度，内容滚动时用 <code>scroll-margin</code> / 手动偏移避免标题被挡住。</p>
            <p v-for="n in 4" :key="'h' + n" class="filler">Header 相关说明 {{ n }}。</p>
          </div>
          <div id="layout-aside" class="subsection">
            <h3>2.2 左侧目录</h3>
            <p>目录自身也可滚动。高亮项若在视口外，调用 <code>scrollIntoView({ block: 'nearest' })</code>。</p>
            <p v-for="n in 5" :key="'a' + n" class="filler">目录区说明 {{ n }}。</p>
          </div>
          <div id="layout-main" class="subsection">
            <h3>2.3 右侧内容</h3>
            <p>每个章节设置稳定 <code>id</code>，供点击定位与滚动监听使用。</p>
            <p v-for="n in 5" :key="'m' + n" class="filler">内容区说明 {{ n }}。</p>
          </div>
        </section>

        <section id="scroll" class="section">
          <h2>3. 滚动联动</h2>
          <div id="scroll-click" class="subsection">
            <h3>3.1 点击目录定位</h3>
            <p>
              计算目标 <code>offsetTop - HEADER_HEIGHT</code> 后
              <code>scrollTo</code>，保证标题出现在 Header 下方。
            </p>
            <p v-for="n in 6" :key="'c' + n" class="filler">点击定位说明 {{ n }}。</p>
          </div>
          <div id="scroll-spy" class="subsection">
            <h3>3.2 滚动高亮目录</h3>
            <p>
              使用 IntersectionObserver（root 为内容容器）+ scroll 兜底，确定当前章节 id。
            </p>
            <p v-for="n in 6" :key="'sp' + n" class="filler">滚动高亮说明 {{ n }}。</p>
          </div>
          <div id="scroll-toc-into-view" class="subsection">
            <h3>3.3 目录滚入可视区</h3>
            <p>
              高亮变化后，判断目录项是否完全落在 aside 可视区内；否则 nearest 滚入。
            </p>
            <p v-for="n in 6" :key="'tv' + n" class="filler">可视区说明 {{ n }}。</p>
          </div>
        </section>

        <section id="offset" class="section">
          <h2>4. 顶部遮挡处理</h2>
          <p>
            关键是给每个 section 设置 <code>scroll-margin-top: 56px</code>，
            或在程序滚动时减去 Header 高度。本页两种都用了，避免原生锚点/平滑滚动顶到遮挡区。
          </p>
          <p v-for="n in 8" :key="'o' + n" class="filler">遮挡处理说明段落 {{ n }}。</p>
        </section>

        <section id="api" class="section">
          <h2>5. 实现要点</h2>
          <div id="api-observer" class="subsection">
            <h3>5.1 IntersectionObserver</h3>
            <p><code>rootMargin</code> 顶部扣除 Header，底部收缩，使“当前章”更符合阅读位置。</p>
            <p v-for="n in 5" :key="'ob' + n" class="filler">Observer 说明 {{ n }}。</p>
          </div>
          <div id="api-flag" class="subsection">
            <h3>5.2 点击锁</h3>
            <p>
              点击触发的平滑滚动期间加锁，避免 scroll spy 中途抢高亮，造成目录闪烁。
            </p>
            <p v-for="n in 5" :key="'f' + n" class="filler">点击锁说明 {{ n }}。</p>
          </div>
          <div id="api-smooth" class="subsection">
            <h3>5.3 平滑滚动</h3>
            <p><code>behavior: 'smooth'</code> 提升体验；锁超时约 600ms 后恢复监听。</p>
            <p v-for="n in 5" :key="'sm' + n" class="filler">平滑滚动说明 {{ n }}。</p>
          </div>
        </section>

        <section id="faq" class="section">
          <h2>6. 常见问题</h2>
          <p><strong>Q: 为什么还要 scroll 兜底？</strong></p>
          <p>A: 快速惯性滚动或极短章节时，Observer 回调可能不够及时，用 offsetTop 扫描更稳。</p>
          <p v-for="n in 10" :key="'q' + n" class="filler">FAQ 填充段落 {{ n }}。</p>
        </section>

        <section id="checklist" class="section">
          <h2>7. 验收清单</h2>
          <div id="checklist-click" class="subsection">
            <h3>7.1 点击定位</h3>
            <p>点击任意目录，右侧标题应出现在 Header 下方，不被遮挡。</p>
            <p v-for="n in 5" :key="'cc' + n" class="filler">点击验收 {{ n }}。</p>
          </div>
          <div id="checklist-spy" class="subsection">
            <h3>7.2 滚动高亮</h3>
            <p>右侧滚动时左侧高亮跟随；目录可视区较小时，高亮项应自动滚入。</p>
            <p v-for="n in 5" :key="'cs' + n" class="filler">高亮验收 {{ n }}。</p>
          </div>
          <div id="checklist-bottom" class="subsection">
            <h3>7.3 滚到底部</h3>
            <p>
              右侧滚到底时，必须高亮最后一项「8. 总结」，并且左侧目录滚动到最底部，确保最后一项可见。
            </p>
            <p v-for="n in 6" :key="'cb' + n" class="filler">底部验收 {{ n }}。</p>
          </div>
        </section>

        <section id="end" class="section">
          <h2>8. 总结</h2>
          <p>
            点击 → 带偏移滚动；滚动 → 高亮目录；高亮 → 目录滚入可视区；
            <strong>滚到底 → 强制最后一项高亮并滚入</strong>。
          </p>
          <p v-for="n in 8" :key="'e' + n" class="filler">总结填充段落 {{ n }}。</p>
          <p class="end-tip">—— 已经到底（此时左侧应高亮「8. 总结」） ——</p>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.doc-page {
  --header-h: 56px;
  --toc-w: 240px;
  height: calc(100vh - 64px - 24px);
  min-height: 480px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #f0f0f0;
}

.doc-header {
  height: var(--header-h);
  flex-shrink: 0;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(90deg, #f7f9fc, #fff);
}

.doc-header-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
}

.doc-header .sub {
  color: #8c8c8c;
  font-size: 13px;
}

.doc-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.doc-toc {
  width: var(--toc-w);
  flex-shrink: 0;
  /* 目录可视高度小于右侧，制造「目录要自己滚」的场景 */
  max-height: min(360px, calc(100% - 16px));
  align-self: flex-start;
  overflow-y: auto;
  border-right: 1px solid #f0f0f0;
  margin: 8px 0 8px 8px;
  border-radius: 8px;
  padding: 8px 6px 16px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
}

.toc-caption {
  font-size: 12px;
  color: #999;
  padding: 4px 10px 8px;
  position: sticky;
  top: 0;
  background: #fafafa;
  z-index: 1;
}

.doc-toc nav {
  padding-bottom: 8px;
}

.toc-link {
  display: block;
  padding: 9px 10px;
  margin-bottom: 4px;
  border-radius: 6px;
  color: #595959;
  text-decoration: none;
  font-size: 13px;
  line-height: 1.4;
  border-left: 2px solid transparent;
  transition: background 0.15s, color 0.15s;
}

.toc-link.level2 {
  padding-left: 22px;
  font-size: 12px;
  color: #8c8c8c;
}

.toc-link:hover {
  background: #f0f5ff;
  color: #1677ff;
}

.toc-link.active {
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 600;
  border-left-color: #1677ff;
}

.doc-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0 28px 80px;
  scroll-behavior: auto;
}

.section,
.subsection {
  scroll-margin-top: var(--header-h);
}

.section {
  padding-top: 28px;
}

.subsection {
  padding-top: 20px;
  margin-top: 8px;
}

h2 {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.35;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

p,
li {
  line-height: 1.75;
  color: #434343;
}

.filler {
  color: #8c8c8c;
  font-size: 13px;
}

.end-tip {
  text-align: center;
  color: #bbb;
  margin-top: 40px;
}

code {
  background: #f5f5f5;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

@media (max-width: 768px) {
  .doc-page {
    height: auto;
    max-height: none;
  }

  .doc-body {
    flex-direction: column;
  }

  .doc-toc {
    width: 100%;
    max-height: 180px;
    border-right: none;
    border-bottom: 1px solid #f0f0f0;
  }

  .doc-content {
    max-height: 60vh;
  }
}
</style>
