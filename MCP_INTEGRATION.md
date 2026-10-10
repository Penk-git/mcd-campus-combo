# MCP 集成说明

## 使用的麦当劳 MCP Server
- 名称：麦当劳中国 MCP（mcd-mcp）
- 接入地址：`https://mcp.mcd.cn`
- 接入方式：Streamable HTTP（Bearer Token 鉴权）
- 官方指南：https://github.com/M-China/mcd-mcp-server

## 实际调用的 Tool（来自官方 37 个工具清单）
| Tool | 在本项目中的用途 | 调用时机 |
|---|---|---|
| `query-meals` | 拉取当前门店可售餐品（名称/价格/分类/标签） | 每次凑单前获取实时菜单 |
| `available-coupons` | 麦麦省可领券列表 | 估算优惠、核对可用券 |
| `query-store-coupons` | 当前门店可用优惠券 | 更精准地按门店算价 |
| `campaign-calendar` | 当月营销活动日历 | 提示当前进行中的活动/折扣 |
| `calculate-price` | 按商品+券计算实付（金额/配送费/优惠） | 每个候选组合核对真实应付 |
| `list-nutrition-foods` | 餐品营养（能量/蛋白/脂肪…） | 考试周(蛋白)、夜宵(热量)场景排序 |
| `query-nearby-stores` | 附近可用门店 | 定位校园店（可选） |
| `now-time-info` | 当前时间 | 早餐类场景仅在对应时段推荐 |

> 调用前用 `tools/list` 确认真实 Tool 名与入参 schema（以麦当劳 MCP 实时返回为准，勿凭记忆硬编码）。

## 调用流程
1. 用户给出**预算**与**校园场景**（早八/课间/考试周/夜宵/社团聚餐）。
2. 调用 `query-meals` 拿到菜单；`available-coupons`/`query-store-coupons` 拿到优惠；考试周/夜宵额外调 `list-nutrition-foods` 取营养。
3. 在预算内枚举组合（按场景标签过滤、单品份数上限），对每个候选调 `calculate-price` 核实实付。
4. 按场景评分模式排序：份数最多(count) / 每元热量(energy) / 每元蛋白质(protein)，输出 Top 3。
5. 呈现组合、原价、所用优惠、实付、份数、营养与性价比。

## 业务价值
学生党在麦当劳点单常面临「预算有限 + 优惠太多不会凑」的痛点。本项目把分散的菜单、优惠、营养数据聚到一起，按真实价格（`calculate-price`）算出预算内最优组合，比人工逐条比对省时、且不会算错价。既省钱，也顺手帮麦当劳把优惠/活动用起来。

## 在线接入实现
- `mcd_mcp_client.py`：纯标准库实现的 Streamable HTTP MCP 客户端（`initialize` → `tools/list` → `tools/call`），处理 `Mcp-Session-Id` 与 401/429 错误码。
- `campus_combo_finder.py`：凑单核心算法；`--mock` 离线演示（内置 mock 菜单验证算法），在线模式读取 `MCD_MCP_TOKEN` 后拉真实数据。
- 限流：每 Token 每分钟 600 次（429），调用已做容错提示。
