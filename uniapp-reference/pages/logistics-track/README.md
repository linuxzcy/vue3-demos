# UniApp 物流轨迹页（参考）

可复制到真实 UniApp 工程使用。布局：**上地图轨迹，下物流时间轴（最新在上）**。

## 地图语义

| 元素 | 含义 |
|------|------|
| 蓝色实线 + 箭头 | 已行驶（起点 → 当前） |
| 橙色虚线 | 未行驶（当前 → 终点） |
| 标记 | 起点 / 终点 / 当前位置 |

## 接入步骤

1. 复制 `logistics-track.vue` 到项目 `pages/logistics-track/logistics-track.vue`
2. 在根目录 `pages.json` 的 `pages` 数组中加入 `pages.json.snippet` 里的配置
3. 微信小程序：后台开通位置/地图相关能力；坐标使用 **gcj02**
4. 真实业务：用接口返回的 `path` + `currentIndex` + `timeline` 替换页面内 mock

## 与 Web 演示的关系

本仓库 Vue 页路由：`/logistics-track`（高德 JSAPI）。  
共享数据结构见：`src/utils/logisticsTrack.ts`。
