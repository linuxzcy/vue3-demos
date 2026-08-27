export interface TreeNode {
  code: string
  title: string
  children?: TreeNode[]
}

export interface TreeCheckKeys {
  checked: string[]
  halfChecked: string[]
}
