import type { TreeNode, TreeCheckKeys } from '../types/tree'

/** 收集树中所有节点 code */
export function collectAllCodes(nodes: TreeNode[]): string[] {
  const codes: string[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      codes.push(node.code)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return codes
}

/** 收集所有叶子节点 */
export function collectLeaves(nodes: TreeNode[]): TreeNode[] {
  const leaves: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (!node.children?.length) leaves.push(node)
      else walk(node.children)
    }
  }
  walk(nodes)
  return leaves
}

/** 查找节点 */
export function findNode(nodes: TreeNode[], code: string): TreeNode | null {
  for (const node of nodes) {
    if (node.code === code) return node
    if (node.children?.length) {
      const found = findNode(node.children, code)
      if (found) return found
    }
  }
  return null
}

/** 收集某节点所有后代 code */
export function collectDescendantCodes(node: TreeNode): string[] {
  const codes: string[] = []
  const walk = (n: TreeNode) => {
    if (n.children?.length) {
      for (const child of n.children) {
        codes.push(child.code)
        walk(child)
      }
    }
  }
  walk(node)
  return codes
}

/** 获取从根到父节点的祖先链（不含自身） */
export function getAncestors(nodes: TreeNode[], code: string): TreeNode[] {
  const path: TreeNode[] = []
  const dfs = (list: TreeNode[], ancestors: TreeNode[]): boolean => {
    for (const node of list) {
      if (node.code === code) {
        path.push(...ancestors)
        return true
      }
      if (node.children?.length && dfs(node.children, [...ancestors, node])) {
        return true
      }
    }
    return false
  }
  dfs(nodes, [])
  return path
}

/**
 * 根据 checkedCodes 计算 Tree 组件所需的 checked / halfChecked
 * - 子节点全选 → 父节点显示选中
 * - 子节点部分选中 → 父节点半选
 * - 父节点 code 在 checkedCodes 中但子节点未全选 → 父节点半选
 */
export function computeCheckKeys(
  nodes: TreeNode[],
  checkedCodes: Set<string>,
): TreeCheckKeys {
  const checked: string[] = []
  const halfChecked: string[] = []

  const walk = (node: TreeNode): { allChecked: boolean; anyChecked: boolean } => {
    if (!node.children?.length) {
      const isChecked = checkedCodes.has(node.code)
      if (isChecked) checked.push(node.code)
      return { allChecked: isChecked, anyChecked: isChecked }
    }

    const childResults = node.children.map(walk)
    const allChildrenChecked = childResults.every((r) => r.allChecked)
    const anyChildActive = childResults.some((r) => r.anyChecked)
    const parentExplicit = checkedCodes.has(node.code)

    if (allChildrenChecked) {
      checked.push(node.code)
      return { allChecked: true, anyChecked: true }
    }

    if (anyChildActive || parentExplicit) {
      halfChecked.push(node.code)
      return { allChecked: false, anyChecked: true }
    }

    return { allChecked: false, anyChecked: false }
  }

  for (const node of nodes) walk(node)
  return { checked, halfChecked }
}

/** 勾选节点：父节点联动所有现有子节点 */
export function checkNode(
  nodes: TreeNode[],
  checkedCodes: Set<string>,
  code: string,
): void {
  const node = findNode(nodes, code)
  if (!node) return

  checkedCodes.add(code)
  for (const desc of collectDescendantCodes(node)) {
    checkedCodes.add(desc)
  }
}

/** 取消勾选节点：父节点联动移除所有后代，并清除祖先的显式勾选 */
export function uncheckNode(
  nodes: TreeNode[],
  checkedCodes: Set<string>,
  code: string,
): void {
  const node = findNode(nodes, code)
  if (!node) return

  checkedCodes.delete(code)
  for (const desc of collectDescendantCodes(node)) {
    checkedCodes.delete(desc)
  }

  for (const ancestor of getAncestors(nodes, code)) {
    checkedCodes.delete(ancestor.code)
  }
}

/** 全选 */
export function selectAll(nodes: TreeNode[], checkedCodes: Set<string>): void {
  for (const code of collectAllCodes(nodes)) {
    checkedCodes.add(code)
  }
}

/** 反选：按当前展示状态翻转每个叶子，父节点由计算得出 */
export function invertSelection(
  nodes: TreeNode[],
  checkedCodes: Set<string>,
): void {
  const { checked } = computeCheckKeys(nodes, checkedCodes)
  const displayChecked = new Set([...checked])

  const leaves = collectLeaves(nodes)
  for (const leaf of leaves) {
    if (displayChecked.has(leaf.code)) {
      checkedCodes.delete(leaf.code)
    } else {
      checkedCodes.add(leaf.code)
    }
  }

  // 清除父节点的显式勾选，由子节点状态重新推导
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.children?.length) {
        checkedCodes.delete(node.code)
        walk(node.children)
      }
    }
  }
  walk(nodes)
}

/** 动态添加子节点：不自动选中，即使父节点已勾选 */
export function addChildNode(
  nodes: TreeNode[],
  parentCode: string,
  child: TreeNode,
): boolean {
  const parent = findNode(nodes, parentCode)
  if (!parent) return false
  if (!parent.children) parent.children = []
  parent.children.push(child)
  return true
}
