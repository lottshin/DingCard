// The release eval set: one realistic generation brief per item, the way an
// agent would really call the MCP. Every release runs them all (the offline
// suite proves each composes; the browser runner adds check_document counts
// and a thumbnail contact sheet) so the generators can be watched for
// getting better or worse, release over release.

export interface DeckEvalPrompt {
  id: string
  kind: 'deck'
  templateId: string
  content: unknown
}

export interface OutlineEvalPrompt {
  id: string
  kind: 'outline'
  templateId: string
  outline: string
}

export interface PosterEvalPrompt {
  id: string
  kind: 'poster'
  templateId: string
  content: unknown
}

export type EvalPrompt = DeckEvalPrompt | OutlineEvalPrompt | PosterEvalPrompt

export const EVAL_PROMPTS: EvalPrompt[] = [
  // ── Whole decks from structured content ────────────────────────────────
  {
    id: 'deck-editorial-basics',
    kind: 'deck',
    templateId: 'editorial-freeform',
    content: {
      title: '手冲咖啡入门',
      subtitle: '从豆子到一杯好喝的咖啡',
      pages: [
        { title: '选豆', body: '新鲜度比名气重要：烘焙日期在两周以内的豆子，风味最完整。', points: ['浅烘偏果酸', '中烘均衡', '深烘偏苦'] },
        { title: '研磨', body: '研磨度决定萃取速度：越细越快，也越容易过萃。', points: ['手冲中细', '像细砂糖', '现磨现冲'] },
        { title: '水温', points: ['浅烘 92–94℃', '深烘 88–90℃', '没有温度计就烧开晾一分钟'] },
      ],
      ending: { title: '开冲吧', body: '第一杯不好喝很正常，第三杯开始你会找到自己的味道。' },
    },
  },
  {
    id: 'deck-checklist-points',
    kind: 'deck',
    templateId: 'checklist-freeform',
    content: {
      title: '搬家不慌清单',
      pages: [
        { title: '提前一周', points: ['预约搬家师傅', '买纸箱和气泡膜', '给冰箱清库存', '通知房东'] },
        { title: '提前一天', points: ['打包不常用物品', '断电断水', '冰冻食品送人', '行李留出两天换洗'] },
        { title: '搬家当天', points: ['贵重物品随身带', '拍照记录水电表', '核对清单再交房'] },
      ],
    },
  },
  {
    id: 'deck-signal-chart',
    kind: 'deck',
    templateId: 'signal-freeform',
    content: {
      title: '公众号半年复盘',
      pages: [
        { title: '阅读量翻了两番', chart: { kind: 'bar', labels: ['三月', '四月', '五月', '六月'], series: [{ name: '阅读', values: [3200, 5100, 8400, 12800] }] } },
        { title: '什么内容涨粉', points: ['复盘类：留资率最高', '教程类：转发最多', '热点类：看运气'] },
        { title: '下半年的打法', body: '把复盘固定成月更栏目，教程做成系列。' },
      ],
    },
  },
  {
    id: 'deck-neon-table',
    kind: 'deck',
    templateId: 'neon-freeform',
    content: {
      title: '市集摊位价目',
      pages: [
        { title: '今日供应', table: { header: ['品名', '价格', '限量'], rows: [['手冲', '18', '50 杯'], ['冷萃', '20', '30 杯'], ['拿铁', '22', '40 杯']] } },
        { title: '找我们有礼', points: ['发笔记@我们立减 3 元', '集满三次印章送一杯'] },
      ],
    },
  },
  {
    id: 'deck-brutalist-timeline',
    kind: 'deck',
    templateId: 'brutalist-freeform',
    content: {
      title: '工作室这一年',
      pages: [
        { title: '从 0 到 1', timeline: [{ label: '1 月', text: '两个人一张桌子' }, { label: '5 月', text: '接到第一个商单' }, { label: '9 月', text: '团队凑齐五个人' }, { label: '12 月', text: '第一个自营产品上线' }] },
        { title: '踩过的坑', points: ['报价太低', '需求不写清楚', '并行项目太多'] },
      ],
    },
  },
  {
    id: 'deck-soft-progress',
    kind: 'deck',
    templateId: 'soft-freeform',
    content: {
      title: '年度读书计划',
      pages: [
        { title: '进度过半', progress: { value: 62.5, label: '读完 25 本' } },
        { title: '最推荐的三本', points: ['《置身事内》', '《如何阅读一本书》', '《夜晚的潜水艇》'], quote: '读书不求快，求留下痕迹 —— 编辑部' },
      ],
    },
  },
  {
    id: 'deck-blueprint-chart-ending',
    kind: 'deck',
    templateId: 'blueprint-freeform',
    content: {
      title: '装修预算这样分',
      pages: [
        { title: '钱的去向', chart: { kind: 'ring', labels: ['硬装', '家具', '电器', '软装'], series: [{ name: '预算', values: [40, 25, 20, 15] }] } },
        { title: '三条铁律', points: ['先定总预算再动工', '家电留 15% 余量', '软装慢慢买'] },
      ],
      ending: { title: '开工大吉', body: '预算表贴冰箱上，每一笔支出都记录。' },
    },
  },
  {
    id: 'deck-nightflight-content',
    kind: 'deck',
    templateId: 'night-flight-freeform',
    content: {
      title: '夜跑安全指南',
      pages: [
        { title: '路线', points: ['挑有路灯的固定路线', '避开没人的河边', '逆着车流跑'] },
        { title: '装备', points: ['荧光色外套', '头灯或手环灯', '手机贴身放'] },
        { title: '补水', body: '每 20 分钟补一次水，夜跑出汗比白天少但一样需要。' },
      ],
    },
  },
  {
    id: 'deck-editorial-outline-table',
    kind: 'outline',
    templateId: 'editorial-freeform',
    outline: `# 一周晚餐不重样
跟着买菜，照着做

## 周一到周三
| 日子 | 主菜 | 汤 |
| --- | --- | --- |
| 周一 | 番茄牛腩 | 紫菜蛋花 |
| 周二 | 清蒸鲈鱼 | 冬瓜排骨 |
| 周三 | 孜然羊肉 | 玉米羹 |

## 周四到周日
- 周四：麻婆豆腐
- 周五：红烧大排
> 提前腌上，下班回家十分钟出锅 —— 老王家`,
  },
  {
    id: 'deck-checklist-outline',
    kind: 'outline',
    templateId: 'checklist-freeform',
    outline: `# 露营装备自查
## 睡觉
- 帐篷和地钉
- 睡袋（看温标）
## 吃饭
1. 炉头和气罐
2. 锅碗和餐具
## 结尾：出发前最后一遍
对着清单再点一次名`,
  },
  {
    id: 'deck-soft-long-body',
    kind: 'deck',
    templateId: 'soft-freeform',
    content: {
      title: '关于耐心的三件小事',
      pages: [
        { title: '排队', body: '超市里排得最长的那一队，往往收银员最熟练；人生里看起来最慢的那条路，有时候风景最全。着急的时候先深呼吸三次，再抬头看看队伍前面的人都在买什么，也许能发现下一个想尝试的新东西。' },
        { title: '养花', points: ['浇水比施肥重要', '不见花苞也别挪盆', '枯了就剪掉'] },
      ],
    },
  },
  {
    id: 'deck-mixed-templates',
    kind: 'deck',
    templateId: 'editorial-freeform',
    content: {
      title: '年终总结模板',
      pages: [
        { title: '这一年做了什么', points: ['三场大项目', '两次团队重组', '一次重要转身'] },
        { title: '数字说话', chart: { kind: 'line', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: '营收', values: [120, 145, 190, 240] }] }, templateId: 'signal-freeform' },
      ],
      ending: { title: '明年见', body: '把节奏放慢，把标准提高。', templateId: 'checklist-freeform' },
    },
  },

  // ── Posters, one page each ──────────────────────────────────────────────
  {
    id: 'poster-menu',
    kind: 'poster',
    templateId: 'menu-freeform',
    content: { title: '巷口手作面包', subtitle: '每天下午四点出炉', details: ['全麦乡村：22', '黄油可颂：15', '碱水结：12', '当日套餐：28', '咖啡任选：减 3'], brand: '周一店休' },
  },
  {
    id: 'poster-price-list',
    kind: 'poster',
    templateId: 'price-list-freeform',
    content: { title: '理发价目表', details: ['剪发：45', '剪+吹：58', '染发：198 起', '烫发：268 起'], tag: '开业八折' },
  },
  {
    id: 'poster-certificate',
    kind: 'poster',
    templateId: 'certificate-freeform',
    content: { title: '最佳新人奖', recipient: '小林', body: '入职第一个月扛起两个项目，交付零返工。', brand: '产品部', cta: '颁奖日期：12 月 31 日' },
  },
  {
    id: 'poster-timetable',
    kind: 'poster',
    templateId: 'timetable-freeform',
    content: { title: '周六课程表', table: [['节次', '内容'], ['09:00', '开嗓练习'], ['10:00', '气息训练'], ['11:00', '合唱排练']] },
  },
  {
    id: 'poster-talk',
    kind: 'poster',
    templateId: 'talk-poster-freeform',
    content: { title: '独立开发者茶话会', subtitle: '聊聊一个人做一个产品是什么体验', details: ['时间：周六 14:00', '地点：科技园 B1 咖啡', '费用：点一杯饮料即可'], cta: '扫码报名', brand: '第 12 期' },
  },
  {
    id: 'poster-data-roundup',
    kind: 'poster',
    templateId: 'data-roundup-freeform',
    content: { title: '读书会年度数据', subtitle: '我们一起读完了 128 本书', chart: { labels: ['小说', '历史', '科普', '漫画'], series: [{ name: '借阅量', values: [520, 310, 260, 190] }] } },
  },
  {
    id: 'poster-growth-timeline',
    kind: 'poster',
    templateId: 'growth-timeline-freeform',
    content: { title: '从 0 到一万人', details: ['3 月：发出第一篇笔记', '5 月：第一次上首页', '8 月：接到第一条商单', '11 月：粉丝破万'], body: '谢谢每一个点过收藏的你。' },
  },
  {
    id: 'poster-quote',
    kind: 'poster',
    templateId: 'quote-card-freeform',
    content: { title: '慢慢来，比较快', body: '把一件事做十年，比把十件事做一年更接近成功。', brand: '—— 给焦虑的十一月' },
  },
  {
    id: 'poster-product',
    kind: 'poster',
    templateId: 'product-card-freeform',
    content: { title: '珐琅小奶锅', subtitle: '一人食的十二公分', details: ['奶白色 / 湖蓝色', '燃气电磁炉通用', '内壁不粘'], tag: '新品 9 折', brand: '厨房研究所' },
  },
  {
    id: 'poster-invitation',
    kind: 'poster',
    templateId: 'invitation-freeform',
    content: { title: '乔迁小聚', details: ['时间：11 月 16 日 12:00', '地点：南湖路 88 号 3-201', '带上你自己就好'], recipient: '老朋友们' },
  },
  {
    id: 'poster-sale',
    kind: 'poster',
    templateId: 'sale-poster-freeform',
    content: { title: '周年庆全场', subtitle: '满 300 减 80', details: ['会员双倍积分', '满额赠帆布袋', '11 月 11 日当天有效'], tag: '仅此一天', cta: '到店领取优惠' },
  },
  {
    id: 'poster-hiring',
    kind: 'poster',
    templateId: 'hiring-poster-freeform',
    content: { title: '招一位会讲故事的设计师', details: ['三年以上品牌经验', '会用 AI 工具加分', '简历投：hi@shop.com'], brand: '一家小店', cta: '附作品集优先' },
  },
  {
    id: 'poster-festival',
    kind: 'poster',
    templateId: 'festival-poster-freeform',
    content: { title: '冬至饺子局', subtitle: '自己擀皮自己包', details: ['时间：12 月 21 日 18:00', '地点：社区食堂二楼', '饺子出锅就开吃'], tag: '免费参加' },
  },
  {
    id: 'poster-video-cover',
    kind: 'poster',
    templateId: 'video-cover-freeform',
    content: { title: '我把出租屋改成了咖啡馆', subtitle: '全程记录', tag: 'VLOG·08', brand: '老白的日常' },
  },
  {
    id: 'poster-article-cover',
    kind: 'poster',
    templateId: 'article-cover-freeform',
    content: { title: '为什么你应该开始写作', subtitle: '不是成为作家，而是想清楚事情', brand: '每周一篇 · 第 40 期' },
  },
  {
    id: 'poster-compare-table',
    kind: 'poster',
    templateId: 'compare-table-freeform',
    content: { title: '两款热门奶瓶横评', table: [['维度', 'A 款', 'B 款'], ['防胀气', '优秀', '良好'], ['清洗难度', '易', '中等'], ['价格', '89', '129']], body: '按需选择，都不踩坑。' },
  },
  {
    id: 'poster-skill-radar',
    kind: 'poster',
    templateId: 'skill-radar-freeform',
    content: { title: '全栈技能自测', chart: { labels: ['前端', '后端', '数据库', '运维', '设计', '沟通'], series: [{ name: '熟练度', values: [85, 70, 60, 45, 55, 90] }] }, body: '补齐运维，就是明年目标。' },
  },
  {
    id: 'poster-birthday',
    kind: 'poster',
    templateId: 'birthday-card-freeform',
    content: { title: '生日快乐', recipient: '阿澄', body: '新的一岁，愿望都灵。', brand: '爱你的大家' },
  },
]
