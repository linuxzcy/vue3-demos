<script>
/**
 * UniApp 物流轨迹页参考实现
 *
 * 使用方式：
 * 1. 将本目录复制到你的 UniApp 项目 `pages/logistics-track/`
 * 2. 在 pages.json 注册页面（见同目录 pages.json.snippet）
 * 3. 微信小程序需在后台开通「地图」相关权限；坐标为 gcj02
 *
 * 说明：小程序 <map> 的 polyline 可画多段；已行驶 / 未行驶用两条线不同颜色。
 */

const FULL_PATH = [
  { longitude: 121.473701, latitude: 31.230416 },
  { longitude: 121.352, latitude: 31.221 },
  { longitude: 121.18, latitude: 31.25 },
  { longitude: 121.05, latitude: 31.3 },
  { longitude: 120.985, latitude: 31.3 },
  { longitude: 120.62, latitude: 31.32 },
  { longitude: 120.35, latitude: 31.48 },
  { longitude: 120.31, latitude: 31.57 }, // 当前：无锡
  { longitude: 119.95, latitude: 31.78 },
  { longitude: 119.45, latitude: 32.05 },
  { longitude: 118.796877, latitude: 32.060255 },
]

const CURRENT_INDEX = 7

const TIMELINE = [
  {
    id: '6',
    time: '2026-09-08 16:10',
    title: '【无锡市】已到达无锡枢纽',
    desc: '快件已到达无锡转运中心，正在发往南京方向',
    active: true,
  },
  {
    id: '5',
    time: '2026-09-08 13:40',
    title: '【苏州市】已离开苏州中转',
    desc: '快件已发出，下一站无锡枢纽',
    active: false,
  },
  {
    id: '4',
    time: '2026-09-08 11:05',
    title: '【昆山市】已到达昆山分拨',
    desc: '快件已到达昆山分拨中心',
    active: false,
  },
  {
    id: '3',
    time: '2026-09-08 09:30',
    title: '【上海市】运输中',
    desc: '快件正发往昆山分拨中心',
    active: false,
  },
  {
    id: '2',
    time: '2026-09-08 08:20',
    title: '【上海市】已揽收',
    desc: '快递员已取件，快件到达上海转运中心',
    active: false,
  },
  {
    id: '1',
    time: '2026-09-08 07:55',
    title: '运单已创建',
    desc: '商家已下单，等待揽收',
    active: false,
  },
]

function splitPath(path, index) {
  const idx = Math.max(0, Math.min(index, path.length - 1))
  return {
    traveled: path.slice(0, idx + 1),
    remaining: path.slice(idx),
    current: path[idx],
  }
}

export default {
  data() {
    const { traveled, remaining, current } = splitPath(FULL_PATH, CURRENT_INDEX)
    const start = FULL_PATH[0]
    const end = FULL_PATH[FULL_PATH.length - 1]

    return {
      trackingNo: 'SF1234567890',
      carrier: '顺丰速运',
      statusText: '运输中',
      startName: '上海转运中心',
      endName: '南京派送站',
      remainKm: '168.0',
      progressPct: Math.round((CURRENT_INDEX / (FULL_PATH.length - 1)) * 100),
      timeline: TIMELINE,
      // 地图中心
      latitude: current.latitude,
      longitude: current.longitude,
      scale: 8,
      // 覆盖全程以便自动视野（部分端用 include-points）
      includePoints: FULL_PATH,
      markers: [
        {
          id: 1,
          latitude: start.latitude,
          longitude: start.longitude,
          width: 28,
          height: 28,
          callout: { content: '起点', display: 'ALWAYS', padding: 4, borderRadius: 4 },
        },
        {
          id: 2,
          latitude: end.latitude,
          longitude: end.longitude,
          width: 28,
          height: 28,
          callout: { content: '终点', display: 'ALWAYS', padding: 4, borderRadius: 4 },
        },
        {
          id: 3,
          latitude: current.latitude,
          longitude: current.longitude,
          width: 32,
          height: 32,
          callout: { content: '当前位置', display: 'ALWAYS', padding: 4, borderRadius: 4, color: '#1677ff' },
        },
      ],
      // 已行驶蓝线 + 未行驶橙虚线（微信小程序 dotted 支持视基础库）
      polylines: [
        {
          points: traveled,
          color: '#1677FF',
          width: 6,
          arrowLine: true,
        },
        {
          points: remaining,
          color: '#FA8C16',
          width: 6,
          dottedLine: true,
        },
      ],
    }
  },
}
</script>

<template>
  <view class="page">
    <!-- 头部摘要 -->
    <view class="head">
      <view class="head-title">物流轨迹</view>
      <view class="head-sub">{{ carrier }} · {{ trackingNo }} · {{ statusText }}</view>
      <view class="head-meta">{{ startName }} → {{ endName }}</view>
      <view class="head-meta">距目的地约 {{ remainKm }} km · 进度 {{ progressPct }}%</view>
    </view>

    <!-- 上：地图轨迹 -->
    <view class="map-wrap">
      <map
        class="map"
        :latitude="latitude"
        :longitude="longitude"
        :scale="scale"
        :markers="markers"
        :polyline="polylines"
        :include-points="includePoints"
        show-location
      />
      <view class="legend">
        <text class="lg-item">— 已行驶</text>
        <text class="lg-item orange">- - 未行驶</text>
        <text class="lg-item">当前位置</text>
      </view>
    </view>

    <!-- 下：时间轴详情（最新在上） -->
    <view class="timeline">
      <view class="tl-title">物流详情</view>
      <view
        v-for="(item, index) in timeline"
        :key="item.id"
        class="tl-row"
      >
        <view class="tl-axis">
          <view class="tl-dot" :class="{ active: item.active }" />
          <view v-if="index < timeline.length - 1" class="tl-line" />
        </view>
        <view class="tl-body" :class="{ active: item.active }">
          <text class="tl-time">{{ item.time }}</text>
          <text class="tl-name">{{ item.title }}</text>
          <text class="tl-desc">{{ item.desc }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}

.head {
  padding: 24rpx 32rpx;
  background: #fff;
}

.head-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #222;
}

.head-sub {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #1677ff;
}

.head-meta {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #666;
}

.map-wrap {
  position: relative;
  margin-top: 16rpx;
  background: #fff;
}

.map {
  width: 100%;
  height: 560rpx;
}

.legend {
  position: absolute;
  left: 16rpx;
  bottom: 16rpx;
  display: flex;
  gap: 20rpx;
  padding: 8rpx 16rpx;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8rpx;
  font-size: 22rpx;
  color: #333;
}

.lg-item.orange {
  color: #fa8c16;
}

.timeline {
  margin: 16rpx 24rpx 0;
  padding: 28rpx 28rpx 8rpx;
  background: #fff;
  border-radius: 16rpx;
}

.tl-title {
  margin-bottom: 24rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #222;
}

.tl-row {
  display: flex;
  flex-direction: row;
}

.tl-axis {
  width: 32rpx;
  align-items: center;
  margin-right: 20rpx;
}

.tl-dot {
  width: 16rpx;
  height: 16rpx;
  margin: 8rpx auto 0;
  border-radius: 50%;
  background: #d9d9d9;
}

.tl-dot.active {
  background: #1677ff;
  box-shadow: 0 0 0 6rpx rgba(22, 119, 255, 0.2);
}

.tl-line {
  width: 2rpx;
  flex: 1;
  min-height: 80rpx;
  margin: 4rpx auto 0;
  background: #e8e8e8;
}

.tl-body {
  flex: 1;
  padding-bottom: 28rpx;
}

.tl-body.active .tl-name {
  color: #1677ff;
  font-weight: 600;
}

.tl-time {
  display: block;
  font-size: 22rpx;
  color: #999;
}

.tl-name {
  display: block;
  margin-top: 4rpx;
  font-size: 28rpx;
  color: #222;
}

.tl-desc {
  display: block;
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}
</style>
