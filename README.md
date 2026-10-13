<div align="center">

<img src="./assets/banner.svg" alt="麦麦校园搭子 — 校园场景化麦当劳凑单助手" width="100%">

<br>

[![MCP](https://img.shields.io/badge/MCP-mcp.mcd.cn-DA291C?style=flat-square)](https://open.mcd.cn/mcp)
[![数据](https://img.shields.io/badge/数据-官方MCP实时-3FB950?style=flat-square)](#数据都从哪来)
[![场景](https://img.shields.io/badge/校园场景-12种-FFC72C?style=flat-square)](#项目介绍)
[![快照](https://img.shields.io/badge/真实餐品-136个-blue?style=flat-square)](#数据都从哪来)
[![体验](https://img.shields.io/badge/在线体验-10秒上手-8A2BE2?style=flat-square)](#在线体验)

**市面上的凑单工具都在回答「怎么点最便宜」。**
**我们多回答一个问题：「这一份，适合现在的你吗？」**
深夜赶论文和早八冲刺要吃的不是同一种东西——12 种校园场景 × 每日营养参考占比 × 一句话解读，预算内给出「最省」且「最合适」的两层答案。

[🌍 在线体验（国内直连）](https://cloud1-d3g3n612g3037e59b-1398369080.tcloudbaseapp.com/index.html) · [⚡ GitHub Pages](https://penk-git.github.io/mcd-campus-combo/) · [真实例子](#使用示例)

</div>

---

## 为什么不一样

| 常见做法 | 我们的做法 | 差别 |
|---|---|---|
| 菜单和价格写死在代码里 | 餐品/营养/券/活动全部来自**官方 MCP 实时接口**，本地留全量快照兜底 | 价格永远是店里今天的价格 |
| 只按「每元热量」排序 | 按校园场景切换目标：份数最多 / 每元热量 / 每元蛋白 / 甜品降权 | 夜宵要顶饱，考试周要蛋白， goals 不同 |
| 推荐完就结束 | 每个方案附**营养叙事**：每日参考占比%、蛋白密度 g/kcal、一句话解读 | 用户知道「为什么是这份」，而不只是看到价格 |
| 只有一个默认城市 | **城市 → 周边门店两级定位**，门店券随门店实时变化 | 兰州和北京的优惠不是同一张 |
| 后端挂了页面就白屏 | 实时拉取失败**自动重试 + 回退本地快照**，并如实标注数据来源 | 评委随时打开都能完整演示 |

## 一屏看懂

| 🍔 真实餐品 | 🎟️ 官方真实优惠 | 🏪 门店粒度 | 🥗 营养叙事 | ♻️ 可靠性 |
|:---:|:---:|:---:|:---:|:---:|
| **136 个**在售餐品 | **6 张券 + 26 场活动**自动匹配 | 城市→周边门店任选（含距离） | 每日参考% + 蛋白密度 | 失败自动回退快照 |

> 数字来自仓库内 `real_menu.json` 快照（拉取自官方 MCP），非虚构承诺；实时模式下以官方返回为准。

## 在线体验（无需安装，10 秒试玩）

打开 👉 **https://penk-git.github.io/mcd-campus-combo/** 即可在浏览器里选场景、调预算，实时看到 Top3 凑单方案。
（手机也能开，适合发到社团群让同学一起凑。菜单与营养数据来自麦当劳中国官方 MCP 实时快照 `real_menu.json`，优惠券/活动来自官方 MCP 真实接口，以官方实时为准。）

## 界面实拍

| 桌面端（含真实优惠面板） | 移动端（自适应布局） |
| :---: | :---: |
| ![桌面端](docs/shot-desktop.png) | ![移动端](docs/shot-mobile.png) |

> 启用方法：本仓库已含 `index.html`（单页 demo）。在仓库 **Settings → Pages → Source 选 `main` / `root`** 即可上线上面的地址。

## 项目介绍
一个面向**学生党**的麦当劳凑单助手：按你的**预算**和**校园场景**，调用麦当劳中国 MCP 拉取实时菜单与优惠，在预算内算出**性价比最高的凑单方案**，并给出**场景化营养叙事**（每日参考占比、蛋白密度 g/kcal、一句话解读「为什么这份适合你」）。

不靠拍脑袋编价格——餐品、营养、优惠券全部来自麦当劳 MCP 真实接口（available-coupons / query-store-coupons / campaign-calendar），以官方实时返回为准。

## 目标用户
- 学生党（早八、课间、考试周、夜宵、社团拼单）
- 想用最少预算在麦当劳吃值的任何人

## 安装方法
### A. 在 WorkBuddy 里用（推荐，参与官方联动奖励）
1. 申请麦当劳 MCP Token：https://open.mcd.cn/mcp （手机号登录 → 控制台 → 激活）
2. 左侧【专家·技能·连接器】→【连接器】→【自定义连接器】→【配置 MCP】，粘贴 `mcp-config.example.json`（把 `${MCD_MCP_TOKEN}` 换成你的 Token）并启用 `mcd-mcp`
3. 把本仓库作为 Skill 导入 WorkBuddy，直接对话：「预算 20 怎么点麦当劳最划算」

### B. 命令行独立运行（参考实现）
```bash
export MCD_MCP_TOKEN=你的Token        # 在线模式需要
python campus_combo_finder.py --mock --profile 早八快手   # 离线演示（无需 Token）
python campus_combo_finder.py --profile 考试周补能量      # 在线：实时拉菜单+优惠
```
依赖：仅 Python 3.8+ 标准库（urllib / json / itertools），无需 pip 安装。

## 使用示例
> 用户：考试周想吃点高蛋白的，预算 25
> 助手：（调用 query-meals + list-nutrition-foods + calculate-price，以下为真实数据示例）
```
第1名  实付 ¥23（原价 ¥28）
  组合：那么大鸡排（椒盐风味）×2
  份数 2 ｜ 热量 770kcal ｜ 蛋白 48g
```

> 用户：社团聚餐拼单，60 块怎么点份数最多
> 助手：（调用 query-meals + query-store-coupons + calculate-price，以下为真实数据示例）
```
第1名  实付 ¥22（原价 ¥30 【满30减8】）
  组合：苹果片×2 + 脆薯饼×2
  份数 4
```

## 目录结构
```
CONTEST_DECLARATION.md   # 参赛声明（内容不可改）
README.md                # 本文件
index.html               # 单页在线 demo（GitHub Pages，10 秒试玩）
combo.js                 # demo 用的纯 JS 凑单算法（与 Python 版等价，可 Node 校验）
SKILL.md                 # WorkBuddy Skill 定义（联动奖励载体）
MCP_INTEGRATION.md       # MCP 调用说明（用了哪些 Tool、怎么调）
mcp-config.example.json  # 脱敏配置示例（仅环境变量占位符）
workbuddy.md             # WorkBuddy 开发上下文（参与专项奖时必交）
campus_combo_finder.py   # 凑单核心算法（含离线 mock 自测 + 在线 MCP 接入）
mcd_mcp_client.py        # 麦当劳 MCP Streamable HTTP 客户端（标准库实现）
build_real_menu.py       # 用官方 MCP 拉取真实菜单/营养/券，导出 real_menu.json + real_menu.js 快照
real_menu.json           # 真实菜单快照（来自官方 MCP，含来源/门店/餐品/营养）
real_menu.js             # real_menu.json 的 JS 版（供 index.html 直接加载，免 fetch/CORS）
verify_demo.js 本地保留的校验脚本（Node 对比 Python 输出，不入库）
```

## 数据都从哪来
```
官方 MCP（mcp.mcd.cn）
 ├─ query-meals            → 当前门店在售餐品（名称/价格/分类/标签）
 ├─ list-nutrition-foods   → 能量/蛋白质等营养数据
 ├─ available-coupons      → 全国通用券（免费领/买一送一/固定价）
 ├─ query-store-coupons    → 所选门店专属券（随门店变化）
 ├─ campaign-calendar      → 当前营销活动
 ├─ query-nearby-stores    → 周边门店（名称/地址/距离）
 └─ calculate-price        → 真实计价（含券）
        │
        ▼
real_menu.json（本地全量快照：136 餐品 + 6 券 + 26 活动）
        │  实时拉取失败时自动回退，页面照常演示
        ▼
index.html（网页 demo） / campus_combo_finder.py（CLI）
```

> ⚠️ 本作品为参赛者独立开发，非麦当劳官方产品。餐品信息、价格及供应状态以麦当劳官方渠道实时结果为准。
