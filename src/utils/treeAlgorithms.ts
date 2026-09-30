/**
 * 前端常见树形算法合集(TypeScript)
 *
 * 覆盖面试题与业务高频场景:
 *  1. 扁平数组 → 树(拼接父级)
 *  2. 树 → 扁平数组(拍平)
 *  3. 查找节点:递归 / while+显式栈(非递归 DFS) / while+队列(BFS 层序)
 *  4. 向上查找:父指针链 while 拼接祖先路径(含环检测)
 *  4+. 纯 children 树(无父指针):给子节点 id 向上找父级/祖先链
 *     (递归找父 / 路径回溯 / parentMap+while 三种递进写法)
 *  5. 向下查找:收集某节点全部后代
 *  6. 根→目标节点 的完整路径递归回溯
 *  7. 最近公共祖先 LCA
 *  8. 树深度 / 叶子节点收集 / 条件搜索多结果
 *
 * 每种写法都标注了递归版与 while 版,方便对比记忆。
 * 直接运行本文件可看演示输出: npx tsx src/utils/treeAlgorithms.ts
 */

// ─── 类型定义 ────────────────────────────────────────────────

/** 树节点:children 可选,叶子节点通常没有该字段 */
export interface TreeNode<T = string> {
  id: string;
  name: string;
  /** 业务负载,任意泛型 */
  payload?: T;
  children?: TreeNode<T>[];
}

/** 扁平节点:靠 parentId 指认父级,parentId 为 null 表示根 */
export interface FlatNode {
  id: string;
  name: string;
  parentId: string | null;
}

/** 带父指针的节点(模拟后端直接返回 parent 引用的场景,如 Element 的 parent) */
export interface NodeWithParent {
  id: string;
  name: string;
  parent: NodeWithParent | null;
}

// ─── 1. 扁平数组 → 树(拼接父级) ─────────────────────────────
/**
 * 经典两步:先建 id→node 映射,再一次遍历挂接 children。
 * 复杂度 O(n),对比双重循环 find 父级的 O(n²) 写法是面试加分点。
 * 多个 parentId 找不到父级的节点会被视为根(兼容森林)。
 */
export function flatToTree(flat: FlatNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const f of flat) map.set(f.id, { id: f.id, name: f.name });

  const roots: TreeNode[] = [];
  for (const f of flat) {
    const node = map.get(f.id)!;
    const parent = f.parentId === null ? undefined : map.get(f.parentId);
    if (parent) {
      (parent.children ??= []).push(node); // 拼接父级:挂到父亲的 children 上
    } else {
      roots.push(node); // 无父或父不存在 → 自己是根
    }
  }
  return roots;
}

// ─── 2. 树 → 扁平数组(拍平) ─────────────────────────────────
/** 递归版:DFS 顺带记录 parentId/depth */
export function treeToFlat(
  tree: TreeNode[],
  parentId: string | null = null,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TreeNode[], pid: string | null) => {
    for (const n of nodes) {
      out.push({ id: n.id, name: n.name, parentId: pid });
      if (n.children) walk(n.children, n.id); // 递归下探
    }
  };
  walk(tree, parentId);
  return out;
}

// ─── 3. 查找单个节点:三种遍历写法 ────────────────────────────

/** 写法一:递归 DFS,命中即短路返回 */
export function findNodeDFS(
  tree: TreeNode[],
  targetId: string,
): TreeNode | null {
  for (const node of tree) {
    if (node.id === targetId) return node; // 命中
    if (node.children) {
      const hit = findNodeDFS(node.children, targetId); // 递归进子树
      if (hit) return hit; // 短路:子树找到了就逐层返回
    }
  }
  return null;
}

/** 写法二:while + 显式栈(非递归 DFS),防止深树爆调用栈 */
export function findNodeIterative(
  tree: TreeNode[],
  targetId: string,
): TreeNode | null {
  const stack: TreeNode[] = [...tree]; // 栈:先进后出 → 深度优先
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === targetId) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/** 写法三:while + 队列(BFS 层序),浅层目标更快命中 */
export function findNodeBFS(
  tree: TreeNode[],
  targetId: string,
): TreeNode | null {
  const queue: TreeNode[] = [...tree]; // 队列:先进先出 → 层序遍历
  while (queue.length) {
    const node = queue.shift()!;
    if (node.id === targetId) return node;
    if (node.children) queue.push(...node.children);
  }
  return null;
}

// ─── 4. 向上查找:父指针链 while 拼接祖先路径 ─────────────────
/**
 * 场景:评论楼层、组织架构、分类目录…节点自带 parent 引用。
 * 从当前节点一路 while 向上走,把沿途节点"拼接"进路径数组。
 * 面试坑点:必须做环检测(脏数据里 a→b→a 会死循环),
 * 这里用 Set 记录已访问 id,等价于链表判环思路。
 */
export function getAncestorsByParentPointer(node: NodeWithParent): {
  path: NodeWithParent[];
  hasCycle: boolean;
} {
  const path: NodeWithParent[] = [];
  const visited = new Set<string>();
  let cursor: NodeWithParent | null = node;

  while (cursor) {
    if (visited.has(cursor.id)) return { path, hasCycle: true }; // 成环!立即停止
    visited.add(cursor.id);
    path.push(cursor); // 向上拼接
    cursor = cursor.parent;
  }
  return { path, hasCycle: false }; // path 顺序:自己 → … → 根
}

/** 场景变体:数据是扁平 + parentId 的,用 Map 加速向上 while */
export function getAncestorIdsByFlatParentId(
  flat: FlatNode[],
  targetId: string,
): string[] {
  const map = new Map(flat.map((f) => [f.id, f]));
  const ids: string[] = [];
  let cursor = map.get(targetId);
  while (cursor && cursor.parentId !== null) {
    if (ids.includes(cursor.parentId)) break; // 简易防环
    ids.push(cursor.parentId); // 拼接父级 id
    cursor = map.get(cursor.parentId);
  }
  return ids; // 最近祖先在前
}

// ─── 4+. 纯 children 树:给子节点 id 向上找父级(无父指针场景) ───
/**
 * 关键矛盾:树只存了父亲→孩子的单向引用(children 向下),
 * 拿着子节点是无法直接“向上”的,必须先通过遍历建立反向关系。
 * 下面三种写法由浅入深,面试常递进追问。
 */

/** 写法一:递归向下找“谁的孩子是被查目标”,命中即父节点 */
export function getParentInTree(
  tree: TreeNode[],
  childId: string,
): TreeNode | null {
  const dfs = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (!node.children) continue;
      // 在本层 children 里直接命中 → 自己就是父节点
      if (node.children.some((c) => c.id === childId)) return node;
      const hit = dfs(node.children); // 否则继续往更深层找
      if (hit) return hit;
    }
    return null;
  };
  // 注意:根节点没有父级,直接排除 childId 是根的情况
  if (tree.some((r) => r.id === childId)) return null;
  return dfs(tree);
}

/** 写法二:递归时顺手把路径压栈,栈里就是 根→…→自己,反转为“向上拼接” */
export function getAncestorChainInTree(
  tree: TreeNode[],
  childId: string,
): TreeNode[] {
  const path: TreeNode[] = [];
  const dfs = (node: TreeNode): boolean => {
    path.push(node);
    if (node.id === childId) return true;
    for (const child of node.children ?? []) {
      if (dfs(child)) return true;
    }
    path.pop(); // 回溯:这条路不通就退出来
    return false;
  };
  for (const root of tree) {
    if (dfs(root)) return path.slice().reverse(); // 反转为:自己→父→…→根
  }
  return []; // 目标不存在
}

/** 预处理:一次性遍历建立 id→父节点 的反向索引(多次查询必需,O(n) 建表) */
export function buildParentMap(tree: TreeNode[]): Map<string, TreeNode | null> {
  const parentMap = new Map<string, TreeNode | null>();
  const walk = (nodes: TreeNode[], parent: TreeNode | null) => {
    for (const n of nodes) {
      parentMap.set(n.id, parent); // 记录每个节点的父级
      if (n.children) walk(n.children, n); // 递归下探,父级变成 n
    }
  };
  walk(tree, null); // 根的父级是 null
  return parentMap;
}

/** 写法三(推荐):有了 parentMap 后,就是真正的 while 向上拼接,单次 O(深度)
 *  注意:parentMap 的 value 全是“父级”,叶子节点不会出现在里面,
 *  所以“自己”必须回树里找,不能从 values 里拼 */
export function getAncestorsViaParentMap(
  tree: TreeNode[],
  parentMap: Map<string, TreeNode | null>,
  childId: string,
): TreeNode[] {
  const chain: TreeNode[] = [];
  const self = findNodeDFS(tree, childId);
  if (!self) return chain; // 目标不存在
  chain.push(self); // 从自己开始
  let cursor = parentMap.get(childId) ?? null;
  while (cursor) {
    chain.push(cursor); // 向上拼接父级
    cursor = parentMap.get(cursor.id) ?? null;
  }
  return chain; // 自己→父→祖父→…→根
}

// ─── 5. 向下查找:收集某节点全部后代(递归 / while 双版本) ────
/** 递归版 */
export function collectDescendants(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  for (const child of node.children ?? []) {
    out.push(child);
    out.push(...collectDescendants(child)); // 递归收集孙级
  }
  return out;
}

/** while + 栈版,行为一致 */
export function collectDescendantsIterative(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const stack: TreeNode[] = [...(node.children ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    if (cur.children) stack.push(...cur.children);
  }
  return out;
}

// ─── 6. 根 → 目标节点 的完整路径(递归回溯) ──────────────────
/**
 * 经典回溯:做选择(压入 path)→ 递归子树 → 撤销选择(弹出)。
 * 面包屑导航、Tree 组件 defaultExpandedKeys 都靠它。
 * 返回 null 表示目标不存在。
 */
export function findPathFromRoot(
  tree: TreeNode[],
  targetId: string,
): TreeNode[] | null {
  const path: TreeNode[] = [];

  const dfs = (node: TreeNode): boolean => {
    path.push(node); // 做选择
    if (node.id === targetId) return true; // 命中,路径已完整
    for (const child of node.children ?? []) {
      if (dfs(child)) return true; // 子树里有答案,逐层确认
    }
    path.pop(); // 撤销选择(回溯):这条路不通
    return false;
  };

  for (const root of tree) {
    if (dfs(root)) return [...path];
  }
  return null;
}

// ─── 7. 最近公共祖先 LCA ─────────────────────────────────────
/**
 * 思路:分别求出根到 p、q 的两条路径,从头比对,最后一个公共节点即 LCA。
 * (LeetCode 235/236 的"多叉树 + 无父指针"版本,前端业务里问"两部门共同上级"同款)
 */
export function lowestCommonAncestor(
  tree: TreeNode[],
  idA: string,
  idB: string,
): TreeNode | null {
  const pathA = findPathFromRoot(tree, idA);
  const pathB = findPathFromRoot(tree, idB);
  if (!pathA || !pathB) return null;

  let lca: TreeNode | null = null;
  const min = Math.min(pathA.length, pathB.length);
  for (let i = 0; i < min; i++) {
    if (pathA[i].id !== pathB[i].id) break; // 从这里开始分叉
    lca = pathA[i]; // 持续向下覆盖,留下最深公共节点
  }
  return lca;
}

/** 递归版 LCA(单遍 DFS):面试进阶写法 */
export function lcaRecursive(
  tree: TreeNode[],
  idA: string,
  idB: string,
): TreeNode | null {
  const dfs = (node: TreeNode): TreeNode | null => {
    if (node.id === idA || node.id === idB) return node;
    const hits: TreeNode[] = [];
    for (const child of node.children ?? []) {
      const hit = dfs(child);
      if (hit) hits.push(hit);
    }
    // 左右(多)子树各命中一个 a/b → 自己就是分叉点即 LCA
    if (hits.length === 2) return node;
    return hits[0] ?? null;
  };
  for (const root of tree) {
    const r = dfs(root);
    if (r) return r;
  }
  return null;
}

// ─── 8. 杂项高频:深度 / 叶子 / 条件搜索 / 祖先判断 ────────────

/** 树的最大深度(递归,Math.max 各子树) */
export function maxDepth(tree: TreeNode[]): number {
  let depth = 0;
  for (const node of tree) {
    const childDepth = node.children ? maxDepth(node.children) : 0;
    depth = Math.max(depth, childDepth + 1);
  }
  return depth;
}

/** 收集所有叶子节点(children 为空即叶子) */
export function collectLeaves(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (!n.children || n.children.length === 0) out.push(n);
      else walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/** 按条件搜索多个结果(如勾选 Tree 的过滤),命中后不再深入其子树可按需改 */
export function searchNodes(
  tree: TreeNode[],
  predicate: (node: TreeNode) => boolean,
): TreeNode[] {
  const out: TreeNode[] = [];
  const stack: TreeNode[] = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (predicate(node)) out.push(node);
    if (node.children) stack.push(...node.children);
  }
  return out;
}

/** ancestorId 是否为 descendantId 的祖先(勾选父节点自动联动子节点的前提判断) */
export function isAncestorOf(
  tree: TreeNode[],
  ancestorId: string,
  descendantId: string,
): boolean {
  const ancestor = findNodeDFS(tree, ancestorId);
  if (!ancestor) return false;
  return collectDescendants(ancestor).some((n) => n.id === descendantId);
}

// ─── 演示数据与入口 ──────────────────────────────────────────

const demoFlat: FlatNode[] = [
  { id: "1", name: "总公司", parentId: null },
  { id: "2", name: "研发部", parentId: "1" },
  { id: "3", name: "市场部", parentId: "1" },
  { id: "4", name: "前端组", parentId: "2" },
  { id: "5", name: "后端组", parentId: "2" },
  { id: "6", name: "Vue 小分队", parentId: "4" },
];

function buildDemoTree(): TreeNode[] {
  return flatToTree(demoFlat);
}

export function runTreeDemos() {
  const tree = buildDemoTree();
  console.log("1. flatToTree 结果:", JSON.stringify(tree, null, 2));

  console.log("2. treeToFlat:", treeToFlat(tree));

  console.log("3. 三种查找 '6'(DFS/迭代/BFS)都命中:", [
    findNodeDFS(tree, "6")?.name,
    findNodeIterative(tree, "6")?.name,
    findNodeBFS(tree, "6")?.name,
  ]);

  // 父指针向上拼接:手动构造 6→4→2→1 的引用链
  const n1: NodeWithParent = { id: "1", name: "总公司", parent: null };
  const n2: NodeWithParent = { id: "2", name: "研发部", parent: n1 };
  const n4: NodeWithParent = { id: "4", name: "前端组", parent: n2 };
  const n6: NodeWithParent = { id: "6", name: "Vue 小分队", parent: n4 };
  console.log(
    "4a. 父指针向上路径:",
    getAncestorsByParentPointer(n6).path.map((p) => p.name),
  );
  console.log(
    "4b. 扁平 parentId 向上:",
    getAncestorIdsByFlatParentId(demoFlat, "6"),
  );

  // 4+. 纯 children 树(无父指针)给子节点向上找父级
  console.log(
    "4c. 树中直接父节点 getParentInTree('6'):",
    getParentInTree(tree, "6")?.name,
  );
  console.log(
    "4c. 根节点无父级 getParentInTree('1'):",
    getParentInTree(tree, "1"),
  );
  console.log(
    "4d. 递归链 getAncestorChainInTree('6'):",
    getAncestorChainInTree(tree, "6").map((n) => n.name),
  );
  const parentMap = buildParentMap(tree);
  console.log(
    "4e. parentMap 向上 while:",
    getAncestorsViaParentMap(tree, parentMap, "6").map((n) => n.name),
  );

  const node4 = findNodeDFS(tree, "4")!;
  console.log(
    "5. '前端组' 的全部后代:",
    collectDescendants(node4).map((n) => n.name),
  );

  console.log(
    "6. 根→'6' 完整路径:",
    findPathFromRoot(tree, "6")?.map((n) => n.name),
  );

  console.log(
    "7. LCA('6','5') 路径法:",
    lowestCommonAncestor(tree, "6", "5")?.name,
  );
  console.log("7. LCA('6','5') 递归法:", lcaRecursive(tree, "6", "5")?.name);

  console.log(
    "8. 树深度:",
    maxDepth(tree),
    "| 叶子:",
    collectLeaves(tree).map((n) => n.name),
  );
  console.log(
    "8. 搜索 name 含 '组':",
    searchNodes(tree, (n) => n.name.includes("组")).map((n) => n.name),
  );
  console.log("8. '2' 是 '6' 的祖先?", isAncestorOf(tree, "2", "6"));
}

// 非浏览器环境(tsx/node 直接运行本文件)时执行演示
if (typeof window === "undefined") {
  runTreeDemos();
}
