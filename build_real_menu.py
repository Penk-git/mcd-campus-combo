#!/usr/bin/env python3
"""拉取真实麦当劳菜单+营养，按名称合并，导出 real_menu.json（方案A：真数据快照）。

用法:
  python build_real_menu.py            # 普通拉取（覆盖旧快照）
  python build_real_menu.py --union    # 与已有 real_menu.json 合并（按 code 去重），
                                       # 用于分时段拉取后汇总成 早/午/晚 全菜单

说明: query-meals 只返回门店【当前在售时段】餐品，所以早/午/晚需在不同时段各拉一次再 union。
"""
import json
import sys
import collections
from mcd_mcp_client import McdMcpClient, _text_of

UNION = "--union" in sys.argv

cli = McdMcpClient()
cli.initialize()


def extract_json(text):
    i = text.find("## Original Response")
    chunk = text[i:] if i != -1 else text
    s = chunk.find("{")
    e = chunk.rfind("}")
    return json.loads(chunk[s:e + 1])


# 0) 列出兰州附近门店，逐个试 query-meals，收集【所有营业中】门店的餐品（union，最大化覆盖）
near = extract_json(_text_of(cli.call_tool("query-nearby-stores",
    {"beType": 1, "searchType": 2, "latitude": 36.0611, "longitude": 103.8339, "city": "兰州", "keyword": "兰州"})))
stores = near.get("data") or []
code_tags = {}
items_by_code = {}
store_meta = []
for st in stores:
    sc = st.get("storeCode")
    if not sc:
        continue
    print(f"试门店 {st.get('storeName')} (code={sc}, 营业中={st.get('businessStatus')}) ...")
    try:
        m = extract_json(_text_of(cli.call_tool("query-meals", {"orderType": 1, "storeCode": sc, "beType": 1})))
    except Exception as e:
        print("  解析失败:", repr(e))
        continue
    d = m.get("data") or {}
    n = len(d.get("meals") or {}) if isinstance(d.get("meals"), dict) else 0
    if not (m.get("success") and n > 0):
        print("  ❌", m.get("message"))
        continue
    print(f"  ✅ 命中菜单，餐品数={n}")
    store_meta.append({"code": sc, "name": st.get("storeName", "")})
    for c in (d.get("categories") or []):
        for mm in (c.get("meals") or []):
            code_tags[mm.get("code")] = mm.get("tags") or []
    for code, detail in (d.get("meals") or {}).items():
        if not isinstance(detail, dict):
            continue
        price_raw = detail.get("currentPrice")
        try:
            price = float(str(price_raw).replace(",", "")) if price_raw not in (None, "") else None
        except Exception:
            price = None
        prev = items_by_code.get(code)
        if prev is None:
            items_by_code[code] = {
                "code": code,
                "name": detail.get("name"),
                "price": price,
                "tags": list(code_tags.get(code, [])),
                "image": detail.get("image"),
                "discountType": detail.get("discountType"),
            }
        else:
            # 合并：保留非空价格、补全标签
            if prev["price"] is None and price is not None:
                prev["price"] = price
            for t in (code_tags.get(code) or []):
                if t not in prev["tags"]:
                    prev["tags"].append(t)
            if prev.get("name") is None:
                prev["name"] = detail.get("name")
items = list(items_by_code.values())
if not items:
    raise SystemExit("没有营业中且能返回菜单的门店，请营业时间再跑（或换城市坐标）")
primary = store_meta[0]
print(f"汇总门店数: {len(store_meta)}；合并后餐品数: {len(items)}；有价格的: {sum(1 for x in items if x['price'] is not None)}")

# 1) 营养（能量kcal/蛋白质）
nut_text = _text_of(cli.call_tool("list-nutrition-foods", {}))
nut_json = extract_json(nut_text)
nut_csv = nut_json.get("data", "")
lines = [ln.strip() for ln in nut_csv.splitlines() if ln.strip() and not ln.strip().startswith("[")]
nutrition = {}
for ln in lines:
    parts = [p.strip() for p in ln.split(",")]
    if len(parts) < 5:
        continue
    try:
        kcal = float(parts[3]) if parts[3] not in ("", "null") else 0
        protein = float(parts[4]) if parts[4] not in ("", "null") else 0
    except Exception:
        continue
    nutrition[parts[0]] = {"energy": kcal, "protein": protein}
print(f"营养表餐品数: {len(nutrition)}")


def norm(s):
    return (s or "").replace(" ", "").replace("（", "(").replace("）", ")")


nut_norm = {norm(k): v for k, v in nutrition.items()}


def match(name):
    n = norm(name)
    if n in nut_norm:
        return nut_norm[n]
    for kn, v in nut_norm.items():
        if n and (n in kn or kn in n):
            return v
    return None


matched = 0
for it in items:
    if it["price"] is None:
        continue
    nv = match(it["name"])
    if nv:
        it["energy"] = nv["energy"]
        it["protein"] = nv["protein"]
        matched += 1
    else:
        it["energy"] = 0
        it["protein"] = 0
print(f"菜单×营养 匹配: {matched}/{sum(1 for x in items if x['price'] is not None)}")

# 2.5) 派生校园场景标签（真实菜单只有营销标签，无 早餐/正餐/饮品 等，供 PROFILES 筛选用）
BREAKFAST = ["麦满分", "薯饼", "豆浆", "粥", "炒蛋", "早餐"]
MAIN = ["堡", "鸡", "牛", "猪", "鱼", "饭", "面", "卷", "盒", "虾", "排"]
MEAT = ["堡", "鸡", "牛", "猪", "鱼", "肉", "腿", "虾", "排", "羊"]
SNACK = ["薯条", "鸡块", "鸡翅", "芝士", "薯", "鸡柳", "鸡米", "派", "条", "圈", "小食"]
DRINK = ["可乐", "雪碧", "咖啡", "茶", "果汁", "牛奶", "新地", "冰淇淋", "奶昔", "圣代", "饮", "汽水", "柠檬", "麦旋"]
DESSERT = ["新地", "冰淇淋", "麦旋风", "派", "圣代", "糖", "甜", "芝士棒"]


def derive(name, tags):
    n = name or ""
    add = []
    if any(k in n for k in BREAKFAST):
        add.append("早餐")
    if "蛋" in n:
        add.append("含蛋")
    if any(k in n for k in MAIN) or "套餐" in tags or "100%纯牛肉" in tags or "100%安格斯牛肉" in tags or "麦金卡" in tags:
        add.append("正餐")
    if any(k in n for k in MEAT):
        add.append("含肉")
    if "小食" in tags or any(k in n for k in SNACK):
        add.append("小吃")
    if "冷饮" in tags or any(k in n for k in DRINK):
        add.append("饮品")
    if any(k in n for k in DESSERT):
        add.append("甜品")
    return add


for it in items:
    extra = derive(it["name"], it.get("tags") or [])
    merged = list(it.get("tags") or [])
    for t in extra:
        if t not in merged:
            merged.append(t)
    it["tags"] = merged

# 2.6) 过滤周边/非餐品（如“薯条脆卜卜毛绒周边”），不进套餐凑单
MERCH_KW = ["周边", "玩具", "公仔", "挂件", "徽章", "毛绒", "玩偶", "盲盒", "手办", "模型", "服饰", "衬衫", "帽子"]
before = len(items)
items = [it for it in items if not any(k in (it.get("name") or "") for k in MERCH_KW)]
print(f"过滤周边非餐品: {before} -> {len(items)} 个真实餐品")

# 2.7) 过滤蘸酱/调料 SKU（如“韩式烟熏芝士风味酱”“牧场酱”），它们按份计价会被“份数最多”误当主体
SAUCE_KW = ["蘸酱", "风味酱", "牧场酱", "山葵酱", "番茄酱", "辣椒酱", "芥末酱", "沙拉酱", "蜂蜜酱", "糖浆", "酱料"]
before2 = len(items)
items = [it for it in items if not any(k in (it.get("name") or "") for k in SAUCE_KW)]
print(f"过滤蘸酱调料: {before2} -> {len(items)} 个真实餐品")

# 2.8) 与已有快照合并（--union）：保留早餐等非当前时段餐品
if UNION:
    try:
        old = json.load(open("real_menu.json", encoding="utf-8"))
        old_items = {it["code"]: it for it in old.get("items", [])}
        seen = set()
        merged = []
        for it in items:
            seen.add(it["code"])
            merged.append(it)
        # 旧快照里当前时段没有的餐品（如早餐）补回来
        added = 0
        for it in old.get("items", []):
            if it["code"] not in seen:
                merged.append(it)
                seen.add(it["code"])
                added += 1
        items = merged
        print(f"--union：并入旧快照 {added} 个非当前时段餐品，合计 {len(items)}")
    except FileNotFoundError:
        print("--union：未发现旧快照，视为普通拉取")

# 统计派生标签覆盖
dc = collections.Counter()
for it in items:
    for t in it["tags"]:
        if t in ("早餐", "正餐", "含肉", "小吃", "饮品", "甜品", "含蛋"):
            dc[t] += 1
print("派生校园标签覆盖:", dict(dc))

# 3) 真实优惠券与限时活动（消除 mock 券硬伤：全部来自官方 MCP 真实返回）
import re


# 券/活动标题里常见的装饰前缀，匹配餐品名时要剥掉，否则匹配不到真实餐品
DECOR_PREFIX = ["人气", "经典", "招牌", "全新", "限时", "超值", "必点", "甄选", "热销", "上新",
                "隆重", "全新上市", "重磅", "明星", "网红"]


def _strip_decor(s):
    s = (s or "").strip()
    changed = True
    while changed:
        changed = False
        for d in DECOR_PREFIX:
            if s.startswith(d):
                s = s[len(d):]
                changed = True
    return s.strip()


def parse_available_coupons(raw):
    """available-coupons 返回 Markdown 列表，解析为结构化券（含图片、匹配关键词）。"""
    coupons = []
    for b in re.split(r"-\s*优惠券标题：", raw)[1:]:
        mt = re.match(r"(.+?)\s*\\", b, re.S)
        title = (mt.group(1).strip() if mt else b.split("\n")[0].strip()).replace("\\", "").strip()
        if not title:
            continue
        img = re.search(r'<img src="([^"]+)"', b)
        status = re.search(r"状态：([^\n\\]+)", b)
        c = {
            "title": title,
            "image": img.group(1) if img else None,
            "status": status.group(1).strip() if status else None,
            "type": "info",
            "match": None,
            "kind": "coupon",
        }
        if "免费" in title:
            c["type"] = "free"
            c["match"] = _strip_decor(title.split("免费", 1)[1])
        elif "买一送一" in title:
            c["type"] = "bogo"
            c["match"] = _strip_decor(title.split("买一送一", 1)[0])
        else:
            pm = re.search(r"(\d+(?:\.\d+)?)元(.+)$", title)
            if pm:
                c["type"] = "flat_item"
                try:
                    c["price"] = float(pm.group(1))
                except ValueError:
                    pass
                c["match"] = _strip_decor(pm.group(2))
            else:
                c["match"] = _strip_decor(title)
        if c.get("match"):
            c["match"] = c["match"].strip()
        coupons.append(c)
    seen = set(); uniq = []
    for c in coupons:
        if c["title"] not in seen:
            seen.add(c["title"]); uniq.append(c)
    return uniq


def parse_campaigns(raw):
    """campaign-calendar 返回 Markdown，解析为限时活动列表（含图片、简介）。"""
    out = []
    for b in re.split(r"\*\*活动标题\*\*：", raw)[1:]:
        m = re.search(
            r"(.+?)\n\s*\*\*活动内容介绍\*\*：(.+?)\n\s*\*\*活动图片介绍\*\*：\s*<img src=\"([^\"]+)\"",
            b, re.S,
        )
        if not m:
            continue
        out.append({
            "title": m.group(1).strip(),
            "desc": m.group(2).strip()[:240],
            "image": m.group(3),
            "type": "info",
            "kind": "campaign",
        })
    return out


coupons = parse_available_coupons(_text_of(cli.call_tool("available-coupons", {})))
print(f"真实可领券(available-coupons): {len(coupons)} 条")
for c in coupons:
    print(f"  - [{c['type']}] {c['title']}" + (f" 匹配={c['match']}" if c.get("match") else ""))

# 补拉门店专属券（部分门店有；无则忽略）
try:
    sc_text = _text_of(cli.call_tool("query-store-coupons", {"storeCode": primary["code"], "orderType": 1, "beType": 1}))
    sc_json = extract_json(sc_text)
    sc_data = sc_json.get("data") or []
    if isinstance(sc_data, list) and sc_data:
        for c in sc_data:
            if isinstance(c, dict):
                coupons.append({
                    "title": c.get("title") or c.get("couponName") or "门店券",
                    "image": c.get("image"),
                    "status": None,
                    "type": "store",
                    "match": None,
                    "kind": "coupon",
                })
        print(f"门店专属券: {len(sc_data)} 条（已并入）")
except Exception as e:
    print("门店券拉取跳过:", repr(e))

# 限时活动（campaign-calendar）
camp_text = _text_of(cli.call_tool("campaign-calendar", {}))
campaigns = parse_campaigns(camp_text)
print(f"限时活动(campaign-calendar): {len(campaigns)} 条")
for c in campaigns[:6]:
    print(f"  - {c['title']}")

out = {
    "source": "McDonald's China MCP (query-nearby-stores + query-meals + list-nutrition-foods + available-coupons + campaign-calendar + query-store-coupons)",
    "store": {"code": primary["code"], "name": primary["name"], "store_count": len(store_meta)},
    "order_type": 1,
    "items": items,
    "coupons": coupons,
    "campaigns": campaigns,
}
with open("real_menu.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
with open("real_menu.js", "w", encoding="utf-8") as f:
    f.write("// 自动生成：真实麦当劳菜单快照（来自官方 MCP）。不要手改，跑 build_real_menu.py 重新生成。\n")
    f.write("window.REAL_MENU = ")
    json.dump(out, f, ensure_ascii=False)
    f.write(";\n")
print("已写出 real_menu.json + real_menu.js")
print("早餐标签餐品数:", dc.get("早餐", 0))
for it in items[:8]:
    if it["price"] is not None:
        print(f"  {it['code']} {it['name']} ¥{it['price']} 能量={it.get('energy')} 蛋白={it.get('protein')} tags={it['tags']}")
