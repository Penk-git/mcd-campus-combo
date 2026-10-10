#!/usr/bin/env python3
"""拉取真实麦当劳菜单+营养，按名称合并，导出 real_menu.json（方案A：真数据快照）。"""
import json
from mcd_mcp_client import McdMcpClient, _text_of

cli = McdMcpClient()
cli.initialize()

def extract_json(text):
    i = text.find("## Original Response")
    chunk = text[i:] if i != -1 else text
    s = chunk.find("{")
    e = chunk.rfind("}")
    return json.loads(chunk[s:e + 1])

# 0) 列出兰州附近门店，逐个试 query-meals，挑一家营业中且能返回菜单的
near = extract_json(_text_of(cli.call_tool("query-nearby-stores",
    {"beType": 1, "searchType": 2, "latitude": 36.0611, "longitude": 103.8339, "city": "兰州", "keyword": "兰州"})))
stores = near.get("data") or []
store_code, store_name, menu = None, "", None
for st in stores:
    sc = st.get("storeCode")
    if not sc:
        continue
    print(f"试门店 {st.get('storeName')} (code={sc}, 营业中={st.get('businessStatus')}) ...")
    try:
        m = extract_json(_text_of(cli.call_tool("query-meals", {"orderType": 1, "storeCode": sc, "beType": 1})))
    except Exception as e:
        print("  解析失败:", repr(e)); continue
    d = (m.get("data") or {})
    n = len(d.get("meals") or {}) if isinstance(d.get("meals"), dict) else 0
    if m.get("success") and n > 0:
        store_code, store_name, menu = sc, st.get("storeName", ""), m
        print(f"  ✅ 命中菜单，餐品数={n}")
        break
    else:
        print("  ❌", m.get("message"))
if not menu:
    raise SystemExit("没有营业中且能返回菜单的门店，请营业时间再跑（或换城市坐标）")
print(f"选用门店: {store_name} (storeCode={store_code})")
cats = menu.get("data", {}).get("categories", []) or []
meals_map = menu.get("data", {}).get("meals", {}) or {}
code_tags = {}
for c in cats:
    for m in (c.get("meals") or []):
        code_tags[m.get("code")] = m.get("tags") or []
items = []
for code, detail in meals_map.items():
    if not isinstance(detail, dict):
        continue
    price_raw = detail.get("currentPrice")
    try:
        price = float(str(price_raw).replace(",", "")) if price_raw not in (None, "") else None
    except Exception:
        price = None
    items.append({
        "code": code,
        "name": detail.get("name"),
        "price": price,
        "tags": code_tags.get(code, []),
        "image": detail.get("image"),
        "discountType": detail.get("discountType"),
    })
print(f"菜单餐品数: {len(items)}；有价格的: {sum(1 for x in items if x['price'] is not None)}")

# 2) 营养（能量kcal/蛋白质）
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
    if any(k in n for k in BREAKFAST): add.append("早餐")
    if "蛋" in n: add.append("含蛋")
    if any(k in n for k in MAIN) or "套餐" in tags or "100%纯牛肉" in tags or "100%安格斯牛肉" in tags or "麦金卡" in tags:
        add.append("正餐")
    if any(k in n for k in MEAT): add.append("含肉")
    if "小食" in tags or any(k in n for k in SNACK): add.append("小吃")
    if "冷饮" in tags or any(k in n for k in DRINK): add.append("饮品")
    if any(k in n for k in DESSERT): add.append("甜品")
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

# 统计派生标签覆盖
import collections
dc = collections.Counter()
for it in items:
    for t in it["tags"]:
        if t in ("早餐", "正餐", "含肉", "小吃", "饮品", "甜品", "含蛋"):
            dc[t] += 1
print("派生校园标签覆盖:", dict(dc))

# 3) 优惠券（best-effort，失败则留空，算法降级为“无可用券”）
coupons = []
for cparams in [{}, {"storeCode": store_code, "orderType": 1, "beType": 1}]:
    try:
        ctext = _text_of(cli.call_tool("query-store-coupons", cparams))
        cj = extract_json(ctext)
        raw = cj.get("data") or []
        if isinstance(raw, list) and raw:
            for c in raw:
                if isinstance(c, dict):
                    coupons.append({"id": c.get("couponId") or c.get("id"),
                                    "desc": c.get("couponName") or c.get("name") or c.get("desc"),
                                    "raw": c})
            break
    except Exception:
        continue
print(f"门店可用券: {len(coupons)} 条")

out = {
    "source": "McDonald's China MCP (query-nearby-stores + query-meals + list-nutrition-foods + query-store-coupons)",
    "store": {"code": store_code, "name": store_name},
    "order_type": 1,
    "items": items,
    "coupons": coupons,
}
with open("real_menu.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
# 同时导出 JS 版，避免 GitHub Pages 的 fetch/CORS 限制，file:// 也能直接用
with open("real_menu.js", "w", encoding="utf-8") as f:
    f.write("// 自动生成：真实麦当劳菜单快照（来自官方 MCP）。不要手改，跑 build_real_menu.py 重新生成。\n")
    f.write("window.REAL_MENU = ")
    json.dump(out, f, ensure_ascii=False)
    f.write(";\n")
print("已写出 real_menu.json + real_menu.js")
for it in items[:8]:
    if it["price"] is not None:
        print(f"  {it['code']} {it['name']} ¥{it['price']} 能量={it.get('energy')} 蛋白={it.get('protein')} tags={it['tags']}")
