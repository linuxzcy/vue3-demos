/**
 * 前端面试高频手写题四连(treeAlgorithms.ts 同风格)
 *
 *  1. 菜单权限树过滤(递归 + 剪枝,不可变异原树)
 *  2. 柯里化 curry(支持任意分组传参)
 *  3. 千分位格式化(正则版 + while 手工版,处理负数/小数)
 *  4. 大数相加(字符串模拟竖式,支持负数)
 *
 * 直接运行看演示: npx tsx src/utils/interviewAlgorithms.ts
 */

// ─── 1. 菜单权限树过滤 ───────────────────────────────────────
/**
 * 场景:后端返回全量菜单树,前端按用户权限 code 集合裁剪。
 * 规则(业界通用语义):
 *  - 叶子节点:自身 code 在允许集合里才保留
 *  - 分支节点:只要裁剪后还有存活孩子就保留(目录自动跟着显示)
 *  - 分支节点自身 code 命中允许集合 → 视为"整个子树放行"(全选快捷语义)
 * 面试坑点:
 *  - 不能改变原树 → 全程返回新对象(map+filter 不可变裁剪)
 *  - filter 的类型收窄要写类型谓词,否则 TS 推不出非 null
 */
export interface MenuNode {
  id: string;
  name: string;
  code?: string;
  children?: MenuNode[];
}

export function filterMenuTree(
  tree: MenuNode[],
  allowedCodes: Set<string>,
): MenuNode[] {
  const walk = (node: MenuNode): MenuNode | null => {
    // 非叶且自身被放行 → 整棵子树原样拷贝保留
    if (node.children?.length && node.code && allowedCodes.has(node.code)) {
      return { ...node, children: deepCloneMenu(node.children) };
    }
    if (node.children?.length) {
      const kept = node.children
        .map(walk) // 递归裁剪孩子
        .filter((n): n is MenuNode => n !== null); // 类型谓词收窄
      // 有存活孩子才保留父级,并挂上裁剪后的孩子
      return kept.length ? { ...node, children: kept } : null;
    }
    // 叶子:看自己有没有权限
    return node.code && allowedCodes.has(node.code) ? { ...node } : null;
  };
  return tree.map(walk).filter((n): n is MenuNode => n !== null);
}

function deepCloneMenu(nodes: MenuNode[]): MenuNode[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children ? deepCloneMenu(n.children) : undefined,
  }));
}

// ─── 2. 柯里化 ───────────────────────────────────────────────
/**
 * curry(sum3)(1)(2)(3) === curry(sum3)(1,2)(3) === 6
 * 原理:每层调用收集参数,凑够原函数声明的形参个数(fn.length)才真正执行。
 * 面试追问点:
 *  - fn.length 对 rest 参数/默认值失效 → 需显式传 arity
 *  - 占位符版本(_, curry(sum3)(_, 2)(1)(3))属于加分项,这里不展开
 */
export function curry(
  fn: (...args: any[]) => unknown,
  arity: number = fn.length,
): (...args: any[]) => any {
  const collect =
    (acc: unknown[]) =>
    (...args: unknown[]): any => {
      const next = [...acc, ...args];
      // 没喂饱就继续返回收集函数,喂饱了才执行
      return next.length >= arity ? fn(...next) : collect(next);
    };
  return collect([]);
}

// ─── 3. 千分位格式化 ─────────────────────────────────────────
/**
 * 要求:整数部分每 3 位插逗号;负号、小数部分不参与分组。
 * '1234567.89' → '1,234,567.89'   '-1000' → '-1,000'
 */

/** 正则版:\B(非单词边界) + 后行断言"右边是整数个 3 位组" */
export function toThousands(input: number | string): string {
  const s = String(input).trim();
  const matched = s.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!matched) return s; // 非法输入原样返回(也可抛错,面试先问清需求)
  const [, sign, intPart, decPart = ""] = matched;
  return sign + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + decPart;
}

/** 手工版:从个位往前 while 数 3 个插一个逗号(考察指针思维) */
export function toThousandsLoop(input: number | string): string {
  const s = String(input).trim();
  const matched = s.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!matched) return s;
  const [, sign, intPart, decPart = ""] = matched;

  const out: string[] = [];
  let count = 0;
  // 倒着遍历整数部分;够 3 位且后面还有数字(不是最高位前导)才插逗号
  for (let i = intPart.length - 1; i >= 0; i--) {
    out.push(intPart[i]);
    count++;
    if (count === 3 && i !== 0) {
      out.push(",");
      count = 0;
    }
  }
  return sign + out.reverse().join("") + decPart;
}

// ─── 4. 大数相加(字符串竖式,支持负数) ──────────────────────
/**
 * 背景:0.1+0.2 !== 0.3,Number.MAX_SAFE_INTEGER = 2^53-1,
 * 超过安全整数必须逐位模拟加法。核心就是小学竖式:对齐个位、逐位相加、处理进位。
 * while 条件必须写成 (i >= 0 || j >= 0 || carry):最高位进位单独占一轮。
 */

/** 去掉前导零与符号,归一化为纯数字串 */
function normalize(intStr: string): { sign: 1 | -1; digits: string } {
  const s = intStr.trim();
  const matched = s.match(/^(-?)(\d+)$/);
  if (!matched) throw new Error(`大数格式非法: ${s}`);
  const digits = matched[2].replace(/^0+(?=\d)/, ""); // 保留至少一位
  return { sign: matched[1] === "-" ? -1 : 1, digits };
}

/** 比较两个纯数字串绝对值:先比长度再比字典序 */
function compareAbs(a: string, b: string): 1 | -1 | 0 {
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/** 绝对值相加:双指针从个位扫,carry 进位 */
function addAbs(a: string, b: string): string {
  let i = a.length - 1;
  let j = b.length - 1;
  let carry = 0;
  const out: string[] = [];
  while (i >= 0 || j >= 0 || carry) {
    const x = i >= 0 ? Number(a[i--]) : 0;
    const y = j >= 0 ? Number(b[j--]) : 0;
    const sum = x + y + carry;
    out.push(String(sum % 10));
    carry = Math.floor(sum / 10);
  }
  return out.reverse().join("");
}

/** 绝对值相减,前提 |a| >= |b|:借位版竖式 */
function subAbs(a: string, b: string): string {
  let i = a.length - 1;
  let j = b.length - 1;
  let borrow = 0;
  const out: string[] = [];
  while (i >= 0) {
    const x = Number(a[i--]) - borrow;
    const y = j >= 0 ? Number(b[j--]) : 0;
    let diff = x - y;
    if (diff < 0) {
      diff += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    out.push(String(diff));
  }
  // 结果去前导零:"0005" → "5"
  return out
    .reverse()
    .join("")
    .replace(/^0+(?=\d)/, "");
}

/** 大数加法律试:同号→绝对值相加带上公共符号;异号→大减小,符号跟大的一方 */
export function bigAdd(a: string, b: string): string {
  const A = normalize(a);
  const B = normalize(b);

  if (A.sign === B.sign) {
    const sum = addAbs(A.digits, B.digits);
    return A.sign === -1 ? `-${sum}` : sum;
  }
  const cmp = compareAbs(A.digits, B.digits);
  if (cmp === 0) return "0";
  // 谁绝对值大,结果就取谁的符号
  const [big, small] = cmp === 1 ? [A, B] : [B, A];
  const diff = subAbs(big.digits, small.digits);
  return big.sign === -1 ? `-${diff}` : diff;
}

// ─── 演示 ────────────────────────────────────────────────────

const menuDemo: MenuNode[] = [
  {
    id: "sys",
    name: "系统管理",
    children: [
      { id: "sys:user", name: "用户列表", code: "sys:user:list" },
      { id: "sys:role", name: "角色管理", code: "sys:role:list" },
    ],
  },
  {
    id: "order",
    name: "订单中心",
    code: "order:all", // 命中即整棵子树放行
    children: [
      { id: "order:list", name: "订单列表", code: "order:list" },
      {
        id: "order:after",
        name: "售后",
        children: [
          { id: "order:refund", name: "退款审批", code: "order:refund" },
        ],
      },
    ],
  },
  {
    id: "report",
    name: "报表",
    children: [{ id: "report:fin", name: "财务报表", code: "report:fin" }],
  },
];

export function runInterviewDemos() {
  // 1. 权限树:给到 sys:user:list + order:all(整棵订单子树)
  const allowed = new Set(["sys:user:list", "order:all"]);
  const filtered = filterMenuTree(menuDemo, allowed);
  console.log("1. 权限树裁剪:", JSON.stringify(filtered, null, 2));
  console.log("   原树未被污染:", menuDemo[0]!.children!.length === 2);

  // 2. 柯里化
  const sum3 = (a: number, b: number, c: number) => a + b + c;
  const curried = curry(sum3);
  console.log("2. curry:", [
    curried(1)(2)(3),
    curried(1, 2)(3),
    curried(1)(2, 3),
  ]);

  // 3. 千分位
  const cases = ["1234567.89", "-1000", "999", "1000000", "abc"];
  console.log(
    "3. 千分位:",
    cases.map((c) => `${c} → ${toThousands(c)} / ${toThousandsLoop(c)}`),
  );
  // 两版结果必须一致
  console.log(
    "   两版一致:",
    cases.every((c) => toThousands(c) === toThousandsLoop(c)),
  );

  // 4. 大数相加
  const bigCases: [string, string][] = [
    ["999", "1"], // 连续进位 → 1000
    ["9007199254740991", "1"], // 超出 MAX_SAFE_INTEGER
    ["12345678901234567890123", "98765432109876543210987"],
    ["-999", "1000"], // 异号 → 1
    ["-100", "-200"], // 同号负 → -300
    ["123", "-456"], // 异号负结果 → -333
    ["00123", "1"], // 前导零 → 124
    ["99999", "1"], // 最高位进位占一轮 → 100000
  ];
  console.log(
    "4. 大数相加:",
    bigCases.map(([a, b]) => `${a} + ${b} = ${bigAdd(a, b)}`),
  );
}

// 非浏览器环境(tsx/node 直接运行本文件)时执行演示
if (typeof window === "undefined") {
  runInterviewDemos();
}
