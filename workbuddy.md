# WorkBuddy 对话上下文

> 本文件用于核验你是否**真实使用腾讯 WorkBuddy 智能体**开发本 Skill，参与 WorkBuddy 专项奖励（进榜前 100 名 + 提交本文件 → 3000 积分；前 3 名无论是否用 WorkBuddy 均得 10240 积分）。
> 请将你与 WorkBuddy 开发本 Skill 的关键对话 / 上下文导出整理后粘贴在此。**文件名不可改。**

## 开发过程记录

本项目由参赛者（兰州财经大学在校生）与腾讯 WorkBuddy 智能体**全程结对开发**：WorkBuddy 以 Agent 模式直接读写仓库文件、执行命令、部署云函数、提交 Git；关键决策点由参赛者拍板。以下是按时间的真实开发记录：

### Day 1（2026-10-09 晚）· 选题与方向
- 与 WorkBuddy 讨论参赛方向：对比多个创意后确定「校园省钱凑单助手」选题——切入点是学生党的真实痛点（预算有限、场景固定：早八/课间/夜宵）。
- 与 WorkBuddy 确立两条总原则：**① 全部数据来自麦当劳中国 MCP 真实接口、零编造；② 任何环境都能演示（失败自动回退本地快照）**。

### Day 2（2026-10-10）· Demo 网页 + 真实 MCP 数据接入
- 让 WorkBuddy 生成单页 demo（index.html）与核心凑单算法（combo.js）：预算内枚举组合，支持「份数最多 / 每元热量最高 / 每元蛋白质最高」三种评分模式。
- 迭代四套视觉主题（麦当劳黄红 / 浅色 / 手账 / 暗色），最终采用麦麦食品风。
- 深夜接入真实 MCP：WorkBuddy 编写 `mcd_mcp_client.py`（Streamable HTTP JSON-RPC 客户端）与 `build_real_menu.py` 快照生成器，调用 `query-meals` / `list-nutrition-foods` / `available-coupons` / `campaign-calendar` 生成 `real_menu.json`（127 个真实餐品，含价格/热量/蛋白/官方商品图）。
- 调试记录：MCP 返回的 Markdown 文本需解析成结构化 JSON；WorkBuddy 处理了商品图片去重、衍生品过滤（周边/蘸酱不入菜单池）等脏数据问题。

### Day 3（2026-10-11）· 云函数后端 + 真实券 + 营养叙事 + 门店选择
- WorkBuddy 协助将后端部署为 **CloudBase 云函数 mcd-proxy**（Node.js，MCP Token 存环境变量，不进仓库），按用户 GPS 或所选城市返回当地营业门店的实时菜单，并开启 CORS。
- 端到端验证：`?city=兰州` 返回 200 / 真实兰州门店菜单。
- 让 WorkBuddy 接入**真实优惠券**：解析 `available-coupons` / `campaign-calendar` / `query-store-coupons`，前端新增🎟️真实优惠面板 + 点击详情弹窗，组合推荐自动匹配券（免费券/买一送一/立减）。
- WorkBuddy 设计**营养叙事层**：按国家 NRV（2000kcal/60g 蛋白）计算每日参考占比、蛋白密度（g/kcal）、场景化标签与一句话解读（如「考试周：770kcal/48g 蛋白 ≈ 8 个鸡蛋，达每日参考 80%」）。
- 新增**门店选择**：WorkBuddy 为后端新增 `listStores` 接口（附近 20 家门店含距离地址）+ `storeCode` 指定门店直拉菜单；前端城市/定位后自动填充门店下拉框。
- 调试记录：「实时拉取失败」偶发报错，WorkBuddy 通过带 Origin 的 CORS 三连测排除跨域问题，最终定位为**腾讯云网关双 IP 轮询中单 IP 故障**（实测一个 IP 200、另一个连不通），以自动重试 2 次 + 可点击重试缓解。

### Day 4（2026-10-12）· 打磨与参赛材料
- WorkBuddy 完成移动端自适应（@media 断点、iOS 输入防缩放、弹窗底部吸附）、README 界面实拍截图（桌面/移动双图）、文案一致性修正。
- 用 WorkBuddy 实测 MCP `tools/list`（返回 35 个真实工具），逐项核对 SKILL.md 引用的工具名均真实存在。

## 与 WorkBuddy 的关键协作方式
- 全程在 WorkBuddy 对话中以「老大 / 小弟」工位搭子方式推进：用户描述需求/贴截图反馈 bug，WorkBuddy 直接改代码 → 无头浏览器验证 → 部署双端 → git 提交推送，闭环交付。
- 所有对外动作（部署、提 Issue、推送公开仓库）由用户确认后执行。

## 导出方式
在 WorkBuddy 对话中，将本项目开发相关的上下文整理后填入本文件即可。（本文件即由 WorkBuddy 根据开发工作日志整理生成，经参赛者确认。）
