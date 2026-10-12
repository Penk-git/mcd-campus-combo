# 麦门校园省钱凑单助手（mcd-campus-combo-saver）

> 麦当劳程序员创意开发大赛参赛作品 · 基于麦当劳中国 MCP 构建
> 官方赛事仓库：https://github.com/M-China/mcd-developer-innovation-challenge

## 项目介绍
一个面向**学生党**的麦当劳凑单助手：按你的**预算**和**校园场景**（早八快手 / 课间垫肚子 / 考试周补能量 / 宿舍夜宵 / 社团聚餐），调用麦当劳中国 MCP 拉取实时菜单与优惠，在预算内算出**性价比最高的凑单方案**（份数最多 / 每元热量最高 / 每元蛋白质最高），并给出**场景化营养叙事**（每日参考占比、蛋白密度 g/kcal、一句话解读「为什么这份适合你」）。

不靠拍脑袋编价格——餐品、营养、优惠券全部来自麦当劳 MCP 真实接口（available-coupons / query-store-coupons / campaign-calendar），以官方实时返回为准。

## 在线体验（无需安装，10 秒试玩）
打开 👉 **https://penk-git.github.io/mcd-campus-combo/** 即可在浏览器里选场景、调预算，实时看到 Top3 凑单方案。
（手机也能开，适合发到社团群让同学一起凑。菜单与营养数据来自麦当劳中国官方 MCP 实时快照 `real_menu.json`，优惠券/活动来自官方 MCP 真实接口，以官方实时为准。）

## 界面实拍

| 桌面端（含真实优惠面板） | 移动端（自适应布局） |
| :---: | :---: |
| ![桌面端](docs/shot-desktop.png) | ![移动端](docs/shot-mobile.png) |

还有 🖼️ **一键生成分享图**：算完方案点一下，canvas 生成带 Top3 方案 + 营养解读 + 项目地址的卡片图，手机上直接调起系统分享发群。

> 启用方法：本仓库已含 `index.html`（单页 demo）。在仓库 **Settings → Pages → Source 选 `main` / `root`** 即可上线上面的地址。

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
verify_demo.js           # Node 校验脚本（5 场景对比 Python 输出）
verify_real.js           # Node 校验脚本（真实数据下 5 场景跑通 + 性能）
```

> ⚠️ 本作品为参赛者独立开发，非麦当劳官方产品。餐品信息、价格及供应状态以麦当劳官方渠道实时结果为准。
