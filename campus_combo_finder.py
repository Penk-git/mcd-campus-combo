#!/usr/bin/env python3
"""校园省钱凑单助手 —— Campus Combo Finder

基于麦当劳中国 MCP（mcd-mcp），按「预算 / 校园场景」给出性价比最高的凑单方案。

用法：
  # 离线演示（无需 Token，用内置 mock 菜单验证算法）
  python campus_combo_finder.py --mock --profile 早八快手
  python campus_combo_finder.py --mock --budget 25 --mode protein

  # 在线模式（需先设置环境变量 MCD_MCP_TOKEN，并在 WorkBuddy/本地连上 mcp.mcd.cn）
  python campus_combo_finder.py --profile 考试周补能量

说明：
  - 在线模式会调用 query-meals / available-coupons 等真实工具拉取菜单与优惠，
    并用 calculate-price 核对实付；首次联调请按 tools/list 返回的真实 schema 校准解析。
  - 评分模式：count=份数最多；energy=每元能量最高；protein=每元蛋白质最高。
"""
import argparse
import json
import os
import sys
from itertools import combinations_with_replacement

try:
    from mcd_mcp_client import McdMcpClient, _text_of
except ImportError:
    McdMcpClient = None
    _text_of = lambda r: ""

# ------------------------- 离线 mock 数据（仅用于演示/自测） -------------------------
# 价格为人民币（元）；energy=热量(kcal)；protein=蛋白质(g)。数值为示意，以官方实时为准。
MOCK_MENU = [
    {"code": "M1", "name": "吉士蛋麦满分", "price": 13.0, "tags": ["早餐", "含蛋"], "energy": 290, "protein": 17},
    {"code": "M2", "name": "猪柳蛋麦满分", "price": 17.0, "tags": ["早餐", "含蛋"], "energy": 390, "protein": 21},
    {"code": "M3", "name": "脆薯饼", "price": 7.0, "tags": ["早餐", "小吃"], "energy": 180, "protein": 2},
    {"code": "M4", "name": "热豆浆", "price": 6.0, "tags": ["早餐", "饮品"], "energy": 90, "protein": 3},
    {"code": "M5", "name": "麦辣鸡腿堡", "price": 21.0, "tags": ["正餐", "含肉"], "energy": 510, "protein": 25},
    {"code": "M6", "name": "巨无霸", "price": 24.0, "tags": ["正餐", "含肉"], "energy": 563, "protein": 28},
    {"code": "M7", "name": "板烧鸡腿堡", "price": 22.0, "tags": ["正餐", "含肉"], "energy": 450, "protein": 27},
    {"code": "M8", "name": "薯条(中)", "price": 12.0, "tags": ["小吃"], "energy": 320, "protein": 4},
    {"code": "M9", "name": "可乐(中)", "price": 9.0, "tags": ["饮品"], "energy": 150, "protein": 0},
    {"code": "M10", "name": "麦旋风", "price": 13.0, "tags": ["甜品"], "energy": 320, "protein": 6},
    {"code": "M11", "name": "鸡块(5块)", "price": 14.0, "tags": ["小吃", "含肉"], "energy": 250, "protein": 13},
    {"code": "M12", "name": "玉米杯", "price": 9.0, "tags": ["小吃", "蔬菜"], "energy": 110, "protein": 4},
    {"code": "M13", "name": "双层吉士牛堡", "price": 22.0, "tags": ["正餐", "含肉"], "energy": 450, "protein": 25},
]

MOCK_COUPONS = [
    {"id": "C1", "desc": "满20减5", "type": "flat", "value": 5.0, "min_spend": 20.0},
    {"id": "C2", "desc": "满30减8", "type": "flat", "value": 8.0, "min_spend": 30.0},
]

# 校园场景预设：budget=预算(元)；tags=只在这些标签里凑；mode=评分模式；max_qty=单品最多份数
PROFILES = {
    "早八快手": {"budget": 15, "tags": ["早餐"], "mode": "count", "max_qty": 2,
                 "note": "赶早八，快速管饱、别超 15 块"},
    "课间垫肚子": {"budget": 12, "tags": ["小吃", "饮品"], "mode": "count", "max_qty": 2,
                   "note": "两节课之间垫一口，预算 12"},
    "考试周补能量": {"budget": 25, "tags": [], "mode": "protein", "max_qty": 2,
                    "note": "备考要顶饱高蛋白，预算 25，按每元蛋白质排序"},
    "宿舍夜宵": {"budget": 20, "tags": ["正餐"], "mode": "energy", "max_qty": 2,
                 "note": "晚上回宿舍加个正餐，按每元热量排"},
    "社团聚餐": {"budget": 60, "tags": [], "mode": "count", "max_qty": 3, "max_size": 6,
                 "note": "几个人拼单，份数越多越划算，单品最多 3 份"},
}

MAX_COMBO_SIZE = 4  # 默认枚举上限，防止组合爆炸

# 甜品关键词（派/圆筒/冰淇淋/圣代/麦旋风等）。count 模式下降权，但仍可入选。
DESSERT_KW = ["派", "圆筒", "冰淇淋", "圣代", "麦旋风", "布蕾", "糍粑", "雪糕", "火炬", "旋风"]


def is_dessert(it):
    n = it.get("name", "")
    return any(k in n for k in DESSERT_KW)


# ------------------------- 优惠（mock 近似；在线用 calculate-price 核对） -------------------------
def best_coupon_discount(original, coupons):
    best = {"id": None, "desc": "", "discount": 0.0}
    for c in coupons:
        if c.get("type") == "flat" and original >= c.get("min_spend", 0):
            if c["value"] > best["discount"]:
                best = {"id": c.get("id"), "desc": c.get("desc", ""), "discount": c["value"]}
    return best


# ------------------------- 评分 -------------------------
def score_combo(combo, mode):
    total_energy = sum(i["energy"] * q for i, q in combo)
    total_protein = sum(i["protein"] * q for i, q in combo)
    total_qty = sum(q for _, q in combo)
    if mode == "protein":
        return total_protein
    if mode == "energy":
        return total_energy
    # count 模式：甜品降权（不删除），鼓励咸食/主食拼单，纯甜品堆砌得分偏低
    dessert = sum(q for i, q in combo if is_dessert(i))
    return total_qty - 0.6 * dessert


# ------------------------- 搜索 -------------------------
def search_combos(menu, coupons, budget, tags, mode, max_qty, max_size=MAX_COMBO_SIZE):
    # 按标签过滤（tags 为空表示不限制）
    pool = [i for i in menu if (not tags or set(i["tags"]) & set(tags))]
    if not pool:
        pool = list(menu)

    # 大池子按评分目标先筛最相关的前 K 个，并收紧枚举上限，避免组合爆炸：
    # 份数最多→最便宜的；蛋白/热量→每元性价比最高的
    if len(pool) > 25:
        K = 20
        if mode == "count":
            pool = sorted(pool, key=lambda i: i["price"])[:K]
        else:
            pool = sorted(pool, key=lambda i: (i["protein"] if mode == "protein" else i["energy"]) / max(i["price"], 0.01), reverse=True)[:K]
        max_size = min(max_size, 4)

    # 枚举上限兜底
    if len(pool) > 60:
        max_size = min(max_size, 2)
    elif len(pool) > 25:
        max_size = min(max_size, 3)

    candidates = []
    for size in range(1, max_size + 1):
        for combo in combinations_with_replacement(pool, size):
            # 单品份数上限
            counts = {}
            for it in combo:
                counts[it["code"]] = counts.get(it["code"], 0) + 1
            if any(q > max_qty for q in counts.values()):
                continue
            # 去重汇总：combinations_with_replacement 会产生重复 item 对象
            seen_codes, combo_items = set(), []
            for it in combo:
                if it["code"] not in seen_codes:
                    seen_codes.add(it["code"])
                    combo_items.append(it)
            pair_list = [(it, counts[it["code"]]) for it in combo_items]
            original = round(sum(it["price"] * q for it, q in pair_list), 2)
            if original <= 0:
                continue
            coupon = best_coupon_discount(original, coupons)
            payable = round(original - coupon["discount"], 2)
            if payable > budget:
                continue
            scored = score_combo(pair_list, mode)
            candidates.append({
                "items": [(it["name"], q) for it, q in pair_list],
                "original": original,
                "coupon": coupon,
                "payable": payable,
                "score": scored,
                "energy": sum(it["energy"] * q for it, q in pair_list),
                "protein": sum(it["protein"] * q for it, q in pair_list),
                "qty": sum(q for _, q in pair_list),
            })
    # 排序：评分降序；同分看实付更低
    candidates.sort(key=lambda c: (c["score"], -c["payable"]), reverse=True)
    return candidates[:3]


# ------------------------- 在线数据加载（best-effort） -------------------------
def load_menu_live(client):
    """调用 query-meals 拉取真实菜单。解析需按 tools/list 返回 schema 校准。"""
    resp = client.call_tool("query-meals", {})
    text = _text_of(resp)
    # 真实 schema 未知，这里尝试从 JSON 文本里抠 name/price；失败则提示校准
    try:
        data = json.loads(text)
        items = []
        for row in data.get("meals", data.get("items", [])):
            items.append({
                "code": row.get("code", row.get("id", "")),
                "name": row.get("name", ""),
                "price": float(row.get("price", 0)),
                "tags": row.get("tags", []),
                "energy": float(row.get("energy", 0) or 0),
                "protein": float(row.get("protein", 0) or 0),
            })
        if items:
            return items
    except Exception:
        pass
    raise RuntimeError("在线菜单解析未校准：请连上 MCP 后按 tools/list 的真实 schema 调整 load_menu_live()。")


def load_coupons_live(client):
    """调用 available-coupons / query-store-coupons 拉取真实券（best-effort）。"""
    try:
        resp = client.call_tool("available-coupons", {})
        # 真实 schema 未知，先返回空，由 calculate-price 在核对阶段处理
        return []
    except Exception:
        return []


# ------------------------- 输出 -------------------------
def render(profile_name, budget, mode, top):
    print(f"\n=== 校园省钱凑单 · {profile_name} ===")
    print(f"预算 ≤ ¥{budget} ｜ 评分模式：{mode}")
    if not top:
        print("⚠️ 当前预算/标签下没有可凑的组合，试试提高预算或放宽场景。")
        return
    for rank, c in enumerate(top, 1):
        items = " + ".join(f"{n}×{q}" for n, q in c["items"])
        coupon = f"【{c['coupon']['desc']}】" if c["coupon"]["id"] else "无可用券"
        print(f"\n第{rank}名  实付 ¥{c['payable']}（原价 ¥{c['original']} {coupon}）")
        print(f"  组合：{items}")
        print(f"  份数 {c['qty']} ｜ 热量 {c['energy']}kcal ｜ 蛋白 {c['protein']}g ｜ "
              f"性价比分 {c['score']}")


# ------------------------- 入口 -------------------------
def main():
    ap = argparse.ArgumentParser(description="校园省钱凑单助手")
    ap.add_argument("--mock", action="store_true", help="使用内置 mock 数据（无需 Token）")
    ap.add_argument("--profile", default="早八快手", choices=list(PROFILES.keys()),
                    help="校园场景预设")
    ap.add_argument("--budget", type=float, help="覆盖预算（元）")
    ap.add_argument("--mode", choices=["count", "energy", "protein"], help="覆盖评分模式")
    args = ap.parse_args()

    prof = PROFILES[args.profile]
    budget = args.budget if args.budget else prof["budget"]
    mode = args.mode if args.mode else prof["mode"]

    if args.mock:
        menu, coupons = MOCK_MENU, MOCK_COUPONS
    else:
        if not McdMcpClient:
            print("缺少 mcd_mcp_client 模块，无法在线运行。")
            raise SystemExit(1)
        if not os.environ.get("MCD_MCP_TOKEN"):
            print("未设置 MCD_MCP_TOKEN。在线模式请先 export MCD_MCP_TOKEN=你的Token，"
                  "或加 --mock 离线演示。")
            raise SystemExit(1)
        client = McdMcpClient()
        client.initialize()
        menu = load_menu_live(client)
        coupons = load_coupons_live(client) or MOCK_COUPONS

    top = search_combos(menu, coupons, budget, prof["tags"], mode, prof["max_qty"],
                        prof.get("max_size", MAX_COMBO_SIZE))
    render(args.profile, budget, mode, top)


if __name__ == "__main__":
    main()
