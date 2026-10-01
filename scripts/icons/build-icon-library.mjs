// Regenerate src/freeform/iconLibrary.ts from lucide-static (ISC):
//
//   npm pack lucide-static && tar -xzf lucide-static-*.tgz
//   node scripts/icons/build-icon-library.mjs ./package
//
// Every Lucide element (path, circle, rect, line, polyline, polygon, ellipse)
// becomes one SVG path, so an icon is a single freeform path node.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/icons/build-icon-library.mjs <lucide-static package dir>')
  process.exit(1)
}
const nodes = JSON.parse(readFileSync(path.join(source, 'icon-nodes.json'), 'utf8'))
const version = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')).version

// [Lucide name, 中文名, English name, extra search words]
const ICONS = [
  ['check', '对勾', 'Check', '勾 正确 完成 done tick'],
  ['x', '叉', 'Cross', '错误 关闭 close wrong'],
  ['plus', '加号', 'Plus', '添加 add'],
  ['minus', '减号', 'Minus', 'remove'],
  ['circle-check', '圆圈对勾', 'Check circle', '完成 正确 success'],
  ['circle-x', '圆圈叉', 'Cross circle', '错误 失败 error'],
  ['circle-alert', '提醒', 'Alert', '注意 警告 感叹号 warning'],
  ['triangle-alert', '警告', 'Warning', '注意 危险 caution'],
  ['info', '信息', 'Info', '说明 提示'],
  ['circle-question-mark', '问号', 'Question', '疑问 帮助 help'],
  ['arrow-right', '右箭头', 'Arrow right', '向右 下一步 next'],
  ['arrow-left', '左箭头', 'Arrow left', '向左 返回 back'],
  ['arrow-up', '上箭头', 'Arrow up', '向上 增长'],
  ['arrow-down', '下箭头', 'Arrow down', '向下 下降'],
  ['arrow-up-right', '右上箭头', 'Arrow up right', '外链 增长 trend'],
  ['chevron-right', '右尖角', 'Chevron right', '更多 next'],
  ['chevron-down', '下尖角', 'Chevron down', '展开 more'],
  ['refresh-cw', '循环', 'Refresh', '刷新 重复 loop'],
  ['star', '星星', 'Star', '收藏 评分 favorite'],
  ['heart', '爱心', 'Heart', '喜欢 心 love like'],
  ['thumbs-up', '点赞', 'Thumbs up', '赞 好评 like'],
  ['flame', '火焰', 'Flame', '热门 火 hot fire'],
  ['zap', '闪电', 'Lightning', '能量 快 flash'],
  ['lightbulb', '灯泡', 'Light bulb', '想法 灵感 idea tip'],
  ['sparkles', '闪光', 'Sparkles', '亮点 新 magic new'],
  ['crown', '皇冠', 'Crown', '第一 会员 vip'],
  ['trophy', '奖杯', 'Trophy', '冠军 获奖 win'],
  ['award', '奖章', 'Award', '认证 荣誉 badge'],
  ['target', '目标', 'Target', '靶心 定位 goal'],
  ['rocket', '火箭', 'Rocket', '启动 增长 launch'],
  ['gem', '钻石', 'Gem', '宝石 精选 premium'],
  ['sun', '太阳', 'Sun', '晴天 白天 day'],
  ['moon', '月亮', 'Moon', '夜晚 晚安 night'],
  ['cloud', '云', 'Cloud', '天气 云端 weather'],
  ['umbrella', '雨伞', 'Umbrella', '下雨 保护 rain'],
  ['leaf', '叶子', 'Leaf', '自然 环保 nature eco'],
  ['flower-2', '花', 'Flower', '花朵 春天 spring'],
  ['tree-pine', '树', 'Tree', '松树 森林 forest'],
  ['snowflake', '雪花', 'Snowflake', '冬天 冷 winter'],
  ['droplet', '水滴', 'Drop', '水 液体 water'],
  ['coffee', '咖啡', 'Coffee', '饮品 休息 drink'],
  ['utensils', '餐具', 'Utensils', '吃饭 美食 餐厅 food'],
  ['cake', '蛋糕', 'Cake', '生日 甜点 birthday'],
  ['gift', '礼物', 'Gift', '礼品 福利 present'],
  ['shopping-bag', '购物袋', 'Shopping bag', '购物 买 shop'],
  ['shopping-cart', '购物车', 'Cart', '购物 下单 shop'],
  ['tag', '标签', 'Tag', '价格 分类 price label'],
  ['bookmark', '书签', 'Bookmark', '收藏 保存 save'],
  ['flag', '旗帜', 'Flag', '目标 里程碑 milestone'],
  ['map-pin', '定位', 'Location', '地点 地图 位置 place'],
  ['globe', '地球', 'Globe', '世界 国际 网络 world web'],
  ['house', '房子', 'Home', '家 首页 house'],
  ['building', '大楼', 'Building', '公司 办公 office'],
  ['calendar', '日历', 'Calendar', '日期 日程 date'],
  ['clock', '时钟', 'Clock', '时间 time'],
  ['timer', '计时', 'Timer', '倒计时 秒表 countdown'],
  ['bell', '铃铛', 'Bell', '通知 提醒 notification'],
  ['mail', '邮件', 'Mail', '信封 email'],
  ['phone', '电话', 'Phone', '联系 call'],
  ['message-circle', '对话', 'Chat', '消息 评论 聊天 comment'],
  ['quote', '引号', 'Quote', '引用 名言'],
  ['camera', '相机', 'Camera', '拍照 摄影 photo'],
  ['image', '图片', 'Image', '照片 picture'],
  ['music', '音乐', 'Music', '音符 歌 song'],
  ['video', '视频', 'Video', '录像 影片 film'],
  ['play', '播放', 'Play', '开始 start'],
  ['pause', '暂停', 'Pause', '停止'],
  ['headphones', '耳机', 'Headphones', '听 音频 audio'],
  ['user', '人物', 'User', '用户 个人 person'],
  ['users', '人群', 'Users', '团队 用户 team people'],
  ['face-slightly-smiling', '笑脸', 'Smile', '开心 微笑 happy'],
  ['briefcase', '公文包', 'Briefcase', '工作 职场 work'],
  ['graduation-cap', '学士帽', 'Graduation cap', '学习 教育 毕业 school'],
  ['book-open', '书本', 'Book', '阅读 学习 read'],
  ['pencil', '铅笔', 'Pencil', '写 编辑 edit write'],
  ['clipboard-list', '清单', 'Checklist', '列表 待办 todo list'],
  ['list-checks', '勾选列表', 'Checked list', '待办 完成 todo'],
  ['trending-up', '上升趋势', 'Trending up', '增长 数据 growth'],
  ['chart-column', '柱状图', 'Bar chart', '数据 统计 chart'],
  ['chart-pie', '饼图', 'Pie chart', '数据 占比 chart'],
  ['dollar-sign', '美元', 'Dollar', '钱 价格 money'],
  ['percent', '百分号', 'Percent', '折扣 比例 discount'],
  ['lock', '锁', 'Lock', '安全 隐私 secure'],
  ['key-round', '钥匙', 'Key', '密码 关键 password'],
  ['shield-check', '盾牌', 'Shield', '安全 保障 protect'],
  ['settings', '设置', 'Settings', '齿轮 配置 gear'],
  ['search', '搜索', 'Search', '放大镜 查找 find'],
  ['link', '链接', 'Link', '网址 关联 url'],
  ['download', '下载', 'Download', '保存 save'],
  ['upload', '上传', 'Upload', '发布'],
  ['share-2', '分享', 'Share', '转发'],
  ['send', '发送', 'Send', '纸飞机 投递'],
  ['wifi', '无线网', 'Wi-Fi', '网络 信号 wireless'],
  ['car', '汽车', 'Car', '出行 开车 drive'],
  ['plane', '飞机', 'Plane', '旅行 出差 travel flight'],
  ['train-front', '火车', 'Train', '高铁 出行 rail'],
  ['bike', '自行车', 'Bike', '骑行 运动 cycle'],
]

const num = (value) => Number(value)
const fmt = (value) => String(Math.round(value * 1000) / 1000)

/**
 * A path element's first moveto is absolute even when written "m"; once the
 * elements are joined it no longer comes first, so spell it out: "m6 6 12 12"
 * becomes "M6 6l12 12" (pairs after a moveto are linetos of the same case).
 */
function absoluteStart(d) {
  const text = d.trim()
  if (text[0] !== 'm') return text
  const number = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y
  let index = 1
  const skip = () => { while (index < text.length && /[\s,]/.test(text[index])) index += 1 }
  const pair = []
  for (let count = 0; count < 2; count += 1) {
    skip()
    number.lastIndex = index
    const match = number.exec(text)
    if (!match) throw new Error(`cannot read moveto in ${d}`)
    pair.push(match[0])
    index = number.lastIndex
  }
  skip()
  const rest = text.slice(index)
  return `M${pair[0]} ${pair[1]}${/^[-+.\d]/.test(rest) ? `l${rest}` : rest}`
}

function toPath([tag, attrs]) {
  switch (tag) {
    case 'path':
      return absoluteStart(attrs.d)
    case 'circle': {
      const cx = num(attrs.cx), cy = num(attrs.cy), r = num(attrs.r)
      return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`
    }
    case 'ellipse': {
      const cx = num(attrs.cx), cy = num(attrs.cy), rx = num(attrs.rx), ry = num(attrs.ry)
      return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`
    }
    case 'rect': {
      const x = num(attrs.x ?? 0), y = num(attrs.y ?? 0), w = num(attrs.width), h = num(attrs.height)
      const rx = Math.min(num(attrs.rx ?? attrs.ry ?? 0), w / 2)
      const ry = Math.min(num(attrs.ry ?? attrs.rx ?? 0), h / 2)
      if (!rx && !ry) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}Z`
      return `M${fmt(x + rx)} ${fmt(y)}h${fmt(w - 2 * rx)}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(ry)}`
        + `v${fmt(h - 2 * ry)}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(ry)}`
        + `h${fmt(-(w - 2 * rx))}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(-rx)} ${fmt(-ry)}`
        + `v${fmt(-(h - 2 * ry))}a${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(rx)} ${fmt(-ry)}Z`
    }
    case 'line':
      return `M${fmt(num(attrs.x1))} ${fmt(num(attrs.y1))}L${fmt(num(attrs.x2))} ${fmt(num(attrs.y2))}`
    case 'polyline':
    case 'polygon': {
      const points = attrs.points.trim().split(/[\s,]+/).map(num)
      let d = `M${fmt(points[0])} ${fmt(points[1])}`
      for (let index = 2; index < points.length; index += 2) d += `L${fmt(points[index])} ${fmt(points[index + 1])}`
      return tag === 'polygon' ? `${d}Z` : d
    }
    default:
      throw new Error(`unsupported element ${tag}`)
  }
}

const entries = ICONS.map(([name, zh, en, keywords]) => {
  const icon = nodes[name]
  if (!icon) throw new Error(`no Lucide icon named ${name}`)
  return { id: name, zh, en, keywords, d: icon.map(toPath).join('') }
})

const out = `// Generated by scripts/icons/build-icon-library.mjs from lucide-static ${version}; do not edit by hand.
//
// Lucide is ISC licensed: Copyright (c) Lucide Icons and Contributors.
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// Icons derived from Feather are MIT licensed: Copyright (c) 2013-2023 Cole Bemis.

export interface IconDefinition {
  /** Lucide's name for the icon. */
  id: string
  zh: string
  en: string
  /** Extra words people search for it by, in both languages. */
  keywords: string
  /** One SVG path in the 24 × 24 icon box. */
  d: string
}

/** Icons are drawn as 2-unit outlines in a 24 × 24 box. */
export const ICON_VIEWBOX = { x: 0, y: 0, width: 24, height: 24 } as const
export const ICON_STROKE_WIDTH = 2

export const ICONS: readonly IconDefinition[] = ${JSON.stringify(entries, null, 2)}
`
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'freeform', 'iconLibrary.ts')
writeFileSync(target, out)
console.log(`wrote ${entries.length} icons to ${target}`)
