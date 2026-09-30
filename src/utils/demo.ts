// 树形
const tree = [
  {
    id: "1",
    name: "前端组",
    children: [
      {
        id: "2",
        name: "开发组",
        children: [
          { id: "4", name: "张三" },
          { id: "5", name: "李四" },
        ],
      },
      {
        id: "3",
        name: "测试组",
        children: [
          { id: "6", name: "王五" },
          { id: "7", name: "赵六" },
        ],
      },
    ],
  },
];
function depClone(list: any, target: any) {
  let arr1: any = [];
  let fn = (arr: any) => {
    for (let item of arr) {
      arr1.push(item);
      if (item.id == target) {
        return true;
      }
      if (item.children) {
        return fn(item.children);
      }
      arr1.pop();
    }
  };
  fn(list);
  return arr1;
}
// console.log(depClone(tree, 5));
function findNode(list: any, targetId: any, pids: any[] = []) {
  for (const node of list) {
    let p = [...pids, node.id];
    if (node.id == targetId) {
      return {
        ...node,
        pids: p,
      };
    }
    if (node.children && node.children.length) {
      const res: any = findNode(node.children, targetId, p);
      if (res) return res;
    }
  }
  return null;
}

console.log(findNode(tree, "5"));
