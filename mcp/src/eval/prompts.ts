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

/**
 * What a composed brief left off its pages, from the generator's own summary:
 * a poster's content with no place (unused) and lines or cells beyond what it
 * draws (unplaced), a deck's data drawings that found no room. Words the
 * generator moved to a free slot are on the page, so they don't count.
 */
export function droppedFrom(summary: unknown): string[] {
  if (typeof summary !== 'object' || summary === null) return []
  const record = summary as { unused?: unknown; unplaced?: unknown }
  const unused = Array.isArray(record.unused) ? record.unused.map((key) => `unused:${String(key)}`) : []
  const unplaced = Array.isArray(record.unplaced)
    ? record.unplaced.map((entry) => (typeof entry === 'string' ? `unplaced:${entry}` : `unplaced:${String((entry as { kind?: unknown }).kind)}`))
    : []
  return [...unused, ...unplaced]
}

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
    id: 'deck-night-flight-table',
    kind: 'deck',
    templateId: 'night-flight-freeform',
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
    id: 'deck-checklist-progress',
    kind: 'deck',
    templateId: 'checklist-freeform',
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
    id: 'deck-brutalist-long-body',
    kind: 'deck',
    templateId: 'brutalist-freeform',
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
    id: 'poster-data-radar',
    kind: 'poster',
    templateId: 'data-roundup-freeform',
    content: { title: '全栈技能自测', subtitle: '补齐运维，就是明年目标。', tag: '2026', chart: { kind: 'radar', labels: ['前端', '后端', '数据库', '运维', '设计', '沟通'], series: [{ name: '熟练度', values: [85, 70, 60, 45, 55, 90] }] } },
  },
  {
    id: 'poster-exhibition',
    kind: 'poster',
    templateId: 'exhibition-poster-freeform',
    content: { title: '纸上的山水', body: '六十件宋元山水画的高清复制品，第一次在城市里集中展出。', details: ['展期：2026.12.01 — 2027.02.28', '地点：东湖美术馆 一层', '票价：免费，需预约'], brand: '东湖美术馆', tag: 'No.08' },
  },
  {
    id: 'poster-launch',
    kind: 'poster',
    templateId: 'launch-poster-freeform',
    content: { title: '新一代降噪耳机', subtitle: '预约开启', body: '轻了 20%，续航 40 小时。预约用户首发价立减 200 元。', details: ['12 月 12 日 10:00 正式开售'], cta: '立即预约', tag: '12.12', brand: 'HUSH AUDIO' },
  },
  {
    id: 'poster-dessert-menu',
    kind: 'poster',
    templateId: 'dessert-menu-freeform',
    content: { title: '冬日热饮', subtitle: '每天下午两点开始供应', details: ['热可可：28', '姜汁撞奶：22', '桂花酒酿：18', '红枣桂圆茶：20', '抹茶拿铁：32'], body: '所有热饮都可以换燕麦奶。', brand: '巷口小馆 · 每日 14:00 – 22:00' },
  },
  {
    id: 'poster-wedding',
    kind: 'poster',
    templateId: 'wedding-invitation-freeform',
    content: { title: '周舟 & 林夏', subtitle: '我们要结婚了', details: ['2027.05.20', '星期四 · 中午十二点', '西湖国宾馆 · 紫薇厅'], body: '诚邀您来喝一杯喜酒', cta: '敬请回复', brand: '周家 · 林家 敬邀' },
  },
  {
    id: 'poster-solar-term',
    kind: 'poster',
    templateId: 'solar-term-freeform',
    content: { title: '立冬', subtitle: '水始冰　地始冻', details: ['11 月 7 日', '冬天从今天开始。'], tag: '节气', brand: '山间书房 · 二十四节气' },
  },
  {
    id: 'poster-pitch',
    kind: 'poster',
    templateId: 'pitch-cover-freeform',
    content: { title: '出海计划', subtitle: '2027 战略汇报\nStrategy Review', details: ['汇报人：周舟', '2027 年 1 月 · 管理层会议'], brand: 'HUSH AUDIO' },
  },
  {
    id: 'poster-birthday',
    kind: 'poster',
    templateId: 'birthday-card-freeform',
    content: { title: '生日快乐', recipient: '阿澄', body: '新的一岁，愿望都灵。', brand: '爱你的大家' },
  },
  {
    id: 'poster-magazine',
    kind: 'poster',
    templateId: 'magazine-cover-freeform',
    content: { title: '在山里住一个月', subtitle: '2026 冬季号 · 乡村与远方', body: '我们找了五个愿意离开城市的人，听他们讲山里的日子', tag: 'VOL.13', details: ['¥ 52'], brand: '旅行 · 自然 · 人物', image: '/templates/art-ink-mountains.svg' },
  },
  {
    id: 'poster-book-list',
    kind: 'poster',
    templateId: 'book-list-freeform',
    content: { title: '年度书单', subtitle: '今年反复读了好几遍的书', details: ['小王子：圣埃克苏佩里 · 写给大人的童话', '活着：余华 · 一口气读完的那种', '人间食粮：纪德 · 适合夏天读', '瓦尔登湖：梭罗 · 慢慢读'], brand: '@阿澄的读书笔记' },
  },
  {
    id: 'poster-word-of-year',
    kind: 'poster',
    templateId: 'word-of-year-freeform',
    content: { title: '勇', subtitle: '2026 年度汉字', body: '勇，是今年做得最多的事。\n换城市、换工作，也换了一种活法。', details: ['评论区说说你的年度汉字'], tag: '年度', brand: '阿澄 · 年终总结' },
  },
  {
    id: 'poster-music-festival',
    kind: 'poster',
    templateId: 'music-festival-freeform',
    content: { title: '海边音乐节', details: ['周六：浪花乐队 · 南风 · 青年旅社', '周日：月亮河 · 夏日漫游 · 盐', '地点：东海岸沙滩 · 5 月 1 — 2 日'], cta: '立即购票', tag: 'VOL.05', brand: 'SEASIDE MUSIC' },
  },
  {
    id: 'poster-postcard',
    kind: 'poster',
    templateId: 'travel-postcard-freeform',
    content: { title: '从大理寄来的信', body: '洱海边的风很大，云走得很快。\n我在古城的院子里住下了，每天晒太阳、喝茶。\n下次一起来。', recipient: '亲爱的你', details: ['上海市徐汇区 · 梧桐树下的那栋楼'], tag: '大理\n2026.12.01', brand: '—— 阿澄，于大理' },
  },
  {
    id: 'poster-design-week',
    kind: 'poster',
    templateId: 'design-week-freeform',
    content: { title: '设计与城市论坛', subtitle: 'URBAN FORUM 2027', body: '二十位建筑师和设计师，聊聊城市的下一个十年。', details: ['时间：03.20 — 03.22\n09:30 — 18:00', '地点：滨江会展中心\n三号馆', '票价：早鸟 99 元\n现场 199 元'], tag: '27', brand: '主办：城市更新研究会' },
  },
  // Picture templates given no picture: each is set on its text-only page.
  {
    id: 'poster-photo-cover',
    kind: 'poster',
    templateId: 'photo-cover-freeform',
    content: { title: '城郊三条徒步线', subtitle: '新手友好，半天来回', tag: '收藏', brand: '@山野周末' },
  },
  {
    id: 'poster-portfolio',
    kind: 'poster',
    templateId: 'portfolio-cover-freeform',
    content: { title: '十年设计作品集', subtitle: '品牌 · 包装 · 书籍', tag: '2026', brand: '陈一  CHEN YI' },
  },
  {
    id: 'poster-flyer',
    kind: 'poster',
    templateId: 'flyer-freeform',
    content: { title: '社区读书角开张', subtitle: '每周三晚上，一起读一本书', details: ['时间：每周三 19:30', '地点：社区活动中心二楼', '费用：免费，自带水杯'], cta: '扫码进群', tag: '免费', brand: '城南社区' },
  },
  // Holidays: a sale, a card, a calendar page and a red envelope.
  {
    id: 'poster-double-eleven',
    kind: 'poster',
    templateId: 'double-eleven-freeform',
    content: { title: '双十一囤货节', subtitle: '全场 5 折起 · 跨店每满 200 减 30', tag: '¥30', details: ['时间：11 月 10 日 20:00 — 11 月 11 日 24:00', '方式：小程序下单，门店自提'], cta: '立即领券', brand: '山野咖啡 · 双十一特惠' },
  },
  {
    id: 'poster-christmas',
    kind: 'poster',
    templateId: 'christmas-card-freeform',
    content: { title: '圣诞快乐', recipient: '致 小满', body: '今年也谢谢你，\n陪我把日子过得热热闹闹。', details: ['平安夜 · 12 月 24 日'], brand: '—— 阿澄' },
  },
  {
    id: 'poster-new-year',
    kind: 'poster',
    templateId: 'new-year-calendar-freeform',
    content: { title: '新年第一天', subtitle: '元旦 · 星期五', tag: '2027', details: ['宜：出门看日出', '忌：赖床'], brand: '阿澄的新年日历' },
  },
  {
    id: 'poster-spring-festival',
    kind: 'poster',
    templateId: 'spring-festival-freeform',
    content: { title: '恭喜发财', subtitle: '羊年大吉 · 阖家欢乐', body: '感谢一年来的支持，\n祝新春快乐，万事如意。', details: ['放假：2 月 5 日 — 2 月 11 日', '营业：2 月 12 日（正月初七）照常营业'], brand: '山野咖啡 全体同仁' },
  },
  // The sizes that had few templates: WeChat headers, landscape key visuals, A4 sheets and squares.
  {
    id: 'poster-listicle-cover',
    kind: 'poster',
    templateId: 'listicle-cover-freeform',
    content: { title: '新手做咖啡最容易踩的坑', subtitle: '从磨豆到萃取，一篇讲清', tag: '05', brand: '山野咖啡 · 第 12 期' },
  },
  {
    id: 'poster-ridge-cover',
    kind: 'poster',
    templateId: 'ridge-cover-freeform',
    content: { title: '在大理慢下来', subtitle: '洱海边住了一周，我学会了什么都不做', tag: '旅居手记', brand: '阿澄的周末' },
  },
  {
    id: 'poster-summit-visual',
    kind: 'poster',
    templateId: 'summit-visual-freeform',
    content: { title: '开源的下一站', subtitle: '第三届 · 开发者大会', tag: '2027', details: ['时间：3 月 21 — 22 日', '地点：杭州国际博览中心'], brand: 'OPEN DEV CONF' },
  },
  {
    id: 'poster-gala-backdrop',
    kind: 'poster',
    templateId: 'gala-backdrop-freeform',
    content: { title: '星光之夜', subtitle: '感恩同行 · 共赴新程', tag: '2027', details: ['时间：1 月 23 日 18:00', '地点：杭州西湖国宾馆'], brand: '山野咖啡 年度盛典' },
  },
  {
    id: 'poster-agenda-sheet',
    kind: 'poster',
    templateId: 'agenda-sheet-freeform',
    content: { title: '咖啡行业年会', subtitle: '第三届 · 产业论坛', body: '12 月 6 日 · 星期六\n杭州国际博览中心 3 号厅', details: ['09:00：签到入场', '09:30：开幕致辞', '10:30：圆桌：精品咖啡还能火几年', '14:00：工作坊：门店菜单设计'], brand: 'COFFEE FORUM' },
  },
  {
    id: 'poster-annual-report',
    kind: 'poster',
    templateId: 'annual-report-freeform',
    content: { title: '社会责任报告', subtitle: '每一杯咖啡都更可持续', tag: '2026', details: ['2027 年 4 月发布'], brand: '山野咖啡集团' },
  },
  {
    id: 'poster-stat-card',
    kind: 'poster',
    templateId: 'stat-card-freeform',
    content: { title: '的人每天至少喝一杯咖啡', subtitle: '城市白领的咖啡习惯', tag: '64%', brand: '数据来源：2026 城市咖啡消费调查' },
  },
  {
    id: 'poster-countdown',
    kind: 'poster',
    templateId: 'countdown-freeform',
    content: { title: '冬季限定饮品上市', subtitle: '距离新品开售还有', tag: '7', details: ['12 月 1 日 10:00 · 全国门店同步'], brand: '山野咖啡' },
  },
  // Twenty more: Xiaohongshu covers first.
  {
    id: 'poster-versus-cover',
    kind: 'poster',
    templateId: 'versus-cover-freeform',
    content: { title: '机械键盘还是薄膜键盘？', subtitle: '打字三个月后的真实感受', tag: '测评 · 第 8 期', details: ['机械键盘：手感清脆，声音偏大', '薄膜键盘：安静便宜，适合办公室'], brand: '数码小站' },
  },
  {
    id: 'poster-habit-tracker',
    kind: 'poster',
    templateId: 'habit-tracker-freeform',
    content: { title: '21 天读书计划', subtitle: '每天睡前读 20 页', tag: '第 9 天', body: '读完一本，就在格子里多涂一个。', brand: '阿澄的读书本' },
  },
  {
    id: 'poster-fun-fact',
    kind: 'poster',
    templateId: 'fun-fact-freeform',
    content: { title: '为什么天空是蓝色的？', tag: '冷知识 No.12', body: '阳光穿过大气时，蓝光被空气分子散射得最厉害，所以抬头看到的是蓝色。', brand: '每天一个为什么' },
  },
  {
    id: 'poster-trip-route',
    kind: 'poster',
    templateId: 'trip-route-freeform',
    content: { title: '成都三日游', subtitle: '吃喝玩乐不走回头路', details: ['第一天：宽窄巷子 · 人民公园', '第二天：大熊猫基地', '第三天：都江堰 · 青城山'], brand: '阿澄去旅行' },
  },
  {
    id: 'poster-ranking-cover',
    kind: 'poster',
    templateId: 'ranking-cover-freeform',
    content: { title: '年度最爱 App', subtitle: '每天打开超过十次的五个', tag: '2026', details: ['记账本', '天气预报', '读书', '健身', '地图'], brand: '效率工具控' },
  },
  // Story posters for a shop, a race, a live show and two festivals.
  {
    id: 'poster-grand-opening',
    kind: 'poster',
    templateId: 'grand-opening-freeform',
    content: { title: '新店开业', subtitle: '阿澄面包 · 南门店', details: ['开业首周，面包买二送一', '前 50 位到店，送手作果酱', '每周三会员日，全场九折'], body: '11 月 8 日上午 9 点开门\n南门路 26 号，地铁 B 口出来就到', cta: '领取开业券', brand: 'ACHENG BAKERY' },
  },
  {
    id: 'poster-race-bib',
    kind: 'poster',
    templateId: 'race-bib-freeform',
    content: { title: '城市夜跑节', subtitle: '10 KM · 夏季站', tag: '0618', details: ['时间：6 月 18 日 19:30 出发', '起点：湖滨体育中心', '报名：小程序搜索“夜跑节”'], brand: '湖滨跑团' },
  },
  {
    id: 'poster-live-show',
    kind: 'poster',
    templateId: 'live-show-freeform',
    content: { title: '年货节直播专场', subtitle: '工厂直发 · 全场三折起', details: ['开播：1 月 18 日 19:00', '直播间：抖音 · 视频号'], cta: '预约提醒', brand: 'NEW YEAR LIVE' },
  },
  {
    id: 'poster-qixi-stars',
    kind: 'poster',
    templateId: 'qixi-stars-freeform',
    content: { title: '星河有约', subtitle: '七夕晚上，一起去看星星', details: ['8 月 19 日 20:00 · 天文台观星坪'], brand: '城市天文社' },
  },
  {
    id: 'poster-dragon-boat',
    kind: 'poster',
    templateId: 'dragon-boat-freeform',
    content: { title: '粽情端午', subtitle: '吃粽子　看龙舟　挂艾草', tag: '安康', details: ['农历五月初五', '端午假期：6 月 19 日至 21 日', '粽子礼盒全店八折'], brand: '阿澄面包' },
  },
  // Square posts and WeChat covers: a playlist, an introduction, a daily card, a front page and an interview.
  {
    id: 'poster-vinyl-cover',
    kind: 'poster',
    templateId: 'vinyl-cover-freeform',
    content: { title: '周末早晨歌单', subtitle: '煮咖啡时听的十首歌', tag: 'VOL.09', details: ['阳光照进厨房', '慢慢醒来的猫', '面包刚出炉'], brand: '周末电台' },
  },
  {
    id: 'poster-intro-card',
    kind: 'poster',
    templateId: 'intro-card-freeform',
    content: { title: '小鹿', tag: '新人报到', details: ['坐标：成都', '职业：产品经理', '爱好：徒步和咖啡'], brand: '@小鹿在成都' },
  },
  {
    id: 'poster-daily-quote',
    kind: 'poster',
    templateId: 'daily-quote-freeform',
    content: { title: '今天也要好好吃饭。', subtitle: '星期一 · 农历九月十七', tag: '10.26', brand: '每日一签' },
  },
  {
    id: 'poster-masthead-cover',
    kind: 'poster',
    templateId: 'masthead-cover-freeform',
    content: { title: '城市里最后一家胶片冲印店', subtitle: '老板守了二十年，说还想再守二十年', body: '我们在一个下雨的周三下午走进这家店，听他讲胶片、相机和那些来取照片的老顾客。', tag: '第 36 期 · 2026 年 11 月 2 日', brand: '街角周刊' },
  },
  {
    id: 'poster-interview-cover',
    kind: 'poster',
    templateId: 'interview-cover-freeform',
    content: { title: '把一件小事做二十年，它就成了手艺。', subtitle: '对话 老周 · 手工皮具师', body: '他在老城区的巷子里开了一间小作坊，一个包要做三天。', tag: '人物访谈 · 第 8 期', brand: '手艺人' },
  },
  // Office and everyday pages: a résumé, a notice, a food review and a course cover.
  {
    id: 'poster-resume',
    kind: 'poster',
    templateId: 'resume-freeform',
    content: { title: '周以安', subtitle: '前端工程师 · 五年经验', tag: '139 0000 0000\nyian.zhou@example.com\n上海', body: '五年前端开发，做过电商和在线文档，喜欢把页面做快、把代码写清楚。', details: ['2023 — 至今：云笔记 · 高级前端工程师，负责编辑器性能', '2021 — 2023：好物商城 · 前端工程师，重做了下单流程', '2017 — 2021：同济大学 · 软件工程 本科'], brand: 'GitHub  github.com/yian' },
  },
  {
    id: 'poster-notice',
    kind: 'poster',
    templateId: 'notice-freeform',
    content: { title: '关于开展秋季消防演练的通知', brand: '城南物业服务中心', tag: '城南物〔2026〕7 号', recipient: '各位业主、住户：', body: '为提高大家的消防安全意识，物业将于本月组织一次消防演练，具体安排如下：', details: ['一、演练时间：11 月 12 日（星期四）下午 3 点', '二、集合地点：小区中心花园', '三、演练期间请听从工作人员指挥，有序撤离。'], subtitle: '城南物业服务中心\n2026 年 11 月 2 日' },
  },
  {
    id: 'poster-food-review',
    kind: 'poster',
    templateId: 'food-review-freeform',
    content: { title: '菜市场旁边的馄饨铺', subtitle: '一碗鲜肉馄饨，吃了十年', tag: '8.8', details: ['人均：¥ 22', '推荐：鲜肉馄饨、葱油拌面', '地址：东门菜市场 3 号'], brand: '@周末去哪吃' },
  },
  {
    id: 'poster-course-cover',
    kind: 'poster',
    templateId: 'course-cover-freeform',
    content: { title: '三十分钟学会做表格', subtitle: '从录入到透视表，一节课讲完', tag: '07', details: ['讲师：林老师', '时长：30 分钟', '难度：零基础'], brand: '办公技能课' },
  },
  // A 16:9 deck read off a screen: a quarterly review, and a course outline.
  {
    id: 'deck-spotlight-review',
    kind: 'deck',
    templateId: 'spotlight-freeform',
    content: {
      title: '第三季度业务回顾',
      subtitle: '增长、问题和下季度的三件事',
      pages: [
        { title: '一句话结论', body: '用户数翻了两番，但留存还没跟上。下季度只做一件事：把新用户留下来。' },
        { title: '增长来自推荐', body: '六成新用户来自老用户推荐，投放带来的不到两成。', chart: { kind: 'bar', labels: ['七月', '八月', '九月'], series: [{ name: '新用户', values: [3200, 5100, 8400] }] } },
        { title: '留存的三个问题', points: ['新手引导太长：第一天流失四成', '推送太多：每周关闭通知的人在涨', '缺少回访理由：老用户一周只来一次'], quote: '先修漏水的桶，再往里倒水。' },
        { title: '下季度做这五件事', points: ['引导缩到三步', '推送减半', '每周一个新玩法', '老带新奖励改成双向', '每月一次用户访谈'] },
      ],
      ending: { title: '谢谢大家', body: '有问题会后随时找我。', points: ['周五前定下引导方案', '下周一排好开发计划', '十月底上线新版引导'] },
    },
  },
  {
    id: 'outline-spotlight-course',
    kind: 'outline',
    templateId: 'spotlight-freeform',
    outline: `# 写作课第一讲
把一件事讲清楚

## 先想清楚再写
- 一句话说出你的观点：写不出来，说明还没想清楚
- 读者是谁：他已经知道什么
- 读完要他做什么

## 结构
> 金字塔原理：结论先行，以上统下。
先结论，后理由，最后是例子。

## 结尾：下次课
带一篇你写过的文章来。`,
  },
  // A defense: chapters, a finding, a chart and what comes next; and a proposal from an outline.
  {
    id: 'deck-thesis-defense',
    kind: 'deck',
    templateId: 'thesis-freeform',
    content: {
      title: '社区团购对小区便利店经营的影响',
      subtitle: '答辩人 周以安 · 指导教师 陈老师',
      pages: [
        { title: '研究背景', body: '三年里，社区团购覆盖了全市七成小区，便利店的客流明显下降。' },
        { title: '研究方法', points: ['问卷：调查 40 家便利店店主', '访谈：深度访谈 12 位店主', '数据：对比团购进入前后的流水'], quote: '数据说明发生了什么，访谈说明为什么。' },
        { title: '流水下降了多少', body: '团购进入后半年，便利店日均流水平均下降 23%。', chart: { kind: 'bar', labels: ['进入前', '三个月后', '半年后'], series: [{ name: '日均流水（元）', values: [4200, 3600, 3230] }] } },
        { title: '四个发现', points: ['生鲜受冲击最大', '烟酒饮料几乎不受影响', '提供自提点的店流水反升', '店主普遍缺少线上经营能力'] },
      ],
      ending: { title: '恳请各位老师批评指正', body: '谢谢！后续研究打算：', points: ['扩大到三个城市', '跟踪两年的经营数据', '研究自提点的长期效果'] },
    },
  },
  {
    id: 'outline-thesis-proposal',
    kind: 'outline',
    templateId: 'thesis-freeform',
    outline: `# 开题报告：短视频对大学生阅读习惯的影响
答辩人 林澄 · 指导教师 王老师

## 为什么做这个题目
每天刷短视频超过两小时的大学生越来越多，它和阅读的关系还没有定论。

## 研究问题
- 短视频使用时长和纸质阅读时长有没有关系
- 哪类短视频对阅读影响最大
- 有没有同学用短视频找书

## 研究计划
| 阶段 | 时间 | 内容 |
| --- | --- | --- |
| 问卷 | 3 月 | 发放 500 份问卷 |
| 访谈 | 4 月 | 访谈 20 位同学 |
| 写作 | 5 月 | 完成论文初稿 |

## 结尾
恳请各位老师批评指正。`,
  },
]
