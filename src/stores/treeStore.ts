import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import type { TreeNode, TreeCheckKeys } from '../types/tree'
import {
  addChildNode,
  checkNode,
  collectAllCodes,
  computeCheckKeys,
  invertSelection,
  selectAll,
  uncheckNode,
} from '../utils/treeCheck'

const initialTreeData: TreeNode[] = [
  {
    code: 'dept-1',
    title: '研发部',
    children: [
      { code: 'dept-1-1', title: '前端组' },
      { code: 'dept-1-2', title: '后端组' },
    ],
  },
  {
    code: 'dept-2',
    title: '产品部',
    children: [
      { code: 'dept-2-1', title: '产品设计' },
      { code: 'dept-2-2', title: '用户研究' },
    ],
  },
]

export const useTreeStore = defineStore('tree', () => {
  const treeData = shallowRef<TreeNode[]>(structuredClone(initialTreeData))
  const checkedCodes = ref<Set<string>>(new Set())

  // 初始全选
  selectAll(treeData.value, checkedCodes.value)

  const checkKeys = computed<TreeCheckKeys>(() =>
    computeCheckKeys(treeData.value, checkedCodes.value),
  )

  const checkedKeysModel = computed({
    get: () => ({
      checked: checkKeys.value.checked,
      halfChecked: checkKeys.value.halfChecked,
    }),
    set: () => {
      // 由 onCheck 处理，避免 v-model 双向绑定冲突
    },
  })

  const selectedCodesList = computed(() => [...checkedCodes.value])

  function triggerUpdate() {
    triggerRef(treeData)
    checkedCodes.value = new Set(checkedCodes.value)
  }

  function handleCheck(checked: boolean, code: string) {
    if (checked) {
      checkNode(treeData.value, checkedCodes.value, code)
    } else {
      uncheckNode(treeData.value, checkedCodes.value, code)
    }
    triggerUpdate()
  }

  function handleSelectAll() {
    selectAll(treeData.value, checkedCodes.value)
    triggerUpdate()
  }

  function handleInvert() {
    invertSelection(treeData.value, checkedCodes.value)
    triggerUpdate()
  }

  function handleAddChild(parentCode: string, title: string) {
    const id = `${parentCode}-${Date.now()}`
    const child: TreeNode = { code: id, title }
    if (addChildNode(treeData.value, parentCode, child)) {
      triggerUpdate()
    }
  }

  function handleDrop(info: {
    dragNode: { code: string }
    node: { code: string }
    dropPosition: number
    dropToGap: boolean
  }) {
    const dragCode = info.dragNode.code
    const targetCode = info.node.code

    const dragNode = extractNode(treeData.value, dragCode)
    if (!dragNode) return

    const dropOnTarget = !info.dropToGap && info.dropPosition === 0
    if (dropOnTarget) {
      const target = findInTree(treeData.value, targetCode)
      if (target) {
        if (!target.children) target.children = []
        target.children.push(dragNode)
        triggerUpdate()
      }
      return
    }

    const { siblings, index } = findSiblingsAndIndex(treeData.value, targetCode)
    if (!siblings) return

    const insertIndex = info.dropPosition <= 0 ? index : index + 1
    siblings.splice(insertIndex, 0, dragNode)
    triggerUpdate()
  }

  return {
    treeData,
    checkedCodes,
    checkKeys,
    checkedKeysModel,
    selectedCodesList,
    handleCheck,
    handleSelectAll,
    handleInvert,
    handleAddChild,
    handleDrop,
    allCodes: computed(() => collectAllCodes(treeData.value)),
  }
})

function findInTree(nodes: TreeNode[], code: string): TreeNode | null {
  for (const node of nodes) {
    if (node.code === code) return node
    if (node.children?.length) {
      const found = findInTree(node.children, code)
      if (found) return found
    }
  }
  return null
}

function extractNode(nodes: TreeNode[], code: string): TreeNode | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].code === code) {
      return nodes.splice(i, 1)[0]
    }
    const children = nodes[i].children
    if (children?.length) {
      const extracted = extractNode(children, code)
      if (extracted) return extracted
    }
  }
  return null
}

function findSiblingsAndIndex(
  nodes: TreeNode[],
  code: string,
): { siblings: TreeNode[] | null; index: number } {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].code === code) return { siblings: nodes, index: i }
    const children = nodes[i].children
    if (children?.length) {
      const result = findSiblingsAndIndex(children, code)
      if (result.siblings) return result
    }
  }
  return { siblings: null, index: -1 }
}
