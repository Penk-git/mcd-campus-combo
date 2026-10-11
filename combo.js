/*
 * combo.js —— 校园省钱凑单算法（纯 JS 移植，与 campus_combo_finder.py 等价）
 * 同时支持浏览器 <script> 引入与 Node require（用于离线校验）。
 * 价格为人民币（元）；energy=热量(kcal)；protein=蛋白质(g)。
 * 真实数据来自麦当劳中国官方 MCP（query-meals + list-nutrition-foods），优惠来自 available-coupons / query-store-coupons。
 */
(function (root) {
  "use strict";

  var MOCK_MENU = [
    { code: "M1",  name: "吉士蛋麦满分",   price: 13.0, tags: ["早餐", "含蛋"], energy: 290, protein: 17 },
    { code: "M2",  name: "猪柳蛋麦满分",   price: 17.0, tags: ["早餐", "含蛋"], energy: 390, protein: 21 },
    { code: "M3",  name: "脆薯饼",         price: 7.0,  tags: ["早餐", "小吃"], energy: 180, protein: 2 },
    { code: "M4",  name: "热豆浆",         price: 6.0,  tags: ["早餐", "饮品"], energy: 90,  protein: 3 },
    { code: "M5",  name: "麦辣鸡腿堡",     price: 21.0, tags: ["正餐", "含肉"], energy: 510, protein: 25 },
    { code: "M6",  name: "巨无霸",         price: 24.0, tags: ["正餐", "含肉"], energy: 563, protein: 28 },
    { code: "M7",  name: "板烧鸡腿堡",     price: 22.0, tags: ["正餐", "含肉"], energy: 450, protein: 27 },
    { code: "M8",  name: "薯条(中)",       price: 12.0, tags: ["小吃"],         energy: 320, protein: 4 },
    { code: "M9",  name: "可乐(中)",       price: 9.0,  tags: ["饮品"],         energy: 150, protein: 0 },
    { code: "M10", name: "麦旋风",         price: 13.0, tags: ["甜品"],         energy: 320, protein: 6 },
    { code: "M11", name: "鸡块(5块)",      price: 14.0, tags: ["小吃", "含肉"], energy: 250, protein: 13 },
    { code: "M12", name: "玉米杯",         price: 9.0,  tags: ["小吃", "蔬菜"], energy: 110, protein: 4 },
    { code: "M13", name: "双层吉士牛堡",   price: 22.0, tags: ["正餐", "含肉"], energy: 450, protein: 25 },
  ];

  var MOCK_COUPONS = [
    { id: "C1", desc: "满20减5", type: "flat", value: 5.0, min_spend: 20.0 },
    { id: "C2", desc: "满30减8", type: "flat", value: 8.0, min_spend: 30.0 },
  ];

  var PROFILES = {
    "早八快手":     { budget: 15, tags: ["早餐"],      mode: "count",  max_qty: 2, note: "赶早八，快速管饱别迟到" },
    "课间垫肚子":   { budget: 12, tags: ["小吃", "饮品"], mode: "count", max_qty: 2, note: "两节课之间垫一口" },
    "午休赶课":     { budget: 30, tags: ["正餐"],      mode: "count",  max_qty: 2, note: "午休时间短，正经吃顿饭" },
    "下午健身后":   { budget: 28, tags: [],           mode: "protein", max_qty: 2, note: "练完要补蛋白" },
    "考试周补能量": { budget: 25, tags: [],           mode: "protein", max_qty: 2, note: "备考要顶饱高蛋白" },
    "宿舍夜宵":     { budget: 20, tags: ["正餐"],      mode: "energy",  max_qty: 2, note: "晚上回宿舍加个正餐" },
    "轻食控卡":     { budget: 20, tags: [],           mode: "ppc",    max_qty: 2, note: "控卡期要高蛋白低热量" },
    "社团聚餐":     { budget: 60, tags: [],           mode: "count",  max_qty: 3, max_size: 6, note: "几个人拼单，份数越多越划算" },
    "周末煲剧":     { budget: 25, tags: ["小吃"],      mode: "count",  max_qty: 3, note: "躺平追剧配小食" },
    "月底吃土":     { budget: 10, tags: [],           mode: "count",  max_qty: 3, note: "钱包空了也要吃饱" },
    "约会小确幸":   { budget: 40, tags: ["套餐"],      mode: "count",  max_qty: 2, note: "请客也要有仪式感" },
    "图书馆泡一天": { budget: 18, tags: ["饮品", "小吃"], mode: "count", max_qty: 2, note: "续命咖啡配小食" },
  };

  var MAX_COMBO_SIZE = 4;

  // 甜品关键词（派/圆筒/冰淇淋/圣代/麦旋风等）。count 模式下降权，但仍可入选。
  var DESSERT_KW = ["派", "圆筒", "冰淇淋", "圣代", "麦旋风", "布蕾", "糍粑", "雪糕", "火炬", "旋风"];
  function isDessert(it) {
    var n = it.name || "";
    return DESSERT_KW.some(function (k) { return n.indexOf(k) !== -1; });
  }

  function bestCouponDiscount(original, pairList, coupons) {
    var best = { id: null, desc: "", discount: 0.0 };
    if (!coupons || !coupons.length) return best;
    // 真实券（来自 available-coupons / query-store-coupons）：含 free / bogo 等类型
    if (coupons[0].type && coupons[0].type !== "flat") {
      coupons.forEach(function (c) {
        if (c.type === "free" && c.match) {
          pairList.forEach(function (p) {
            if ((p[0].name || "").indexOf(c.match) !== -1 && p[1] >= 1) {
              var d = p[0].price;
              if (d > best.discount) best = { id: c.title, desc: c.title, discount: d };
            }
          });
        } else if (c.type === "bogo" && c.match) {
          pairList.forEach(function (p) {
            if ((p[0].name || "").indexOf(c.match) !== -1 && p[1] >= 2) {
              var d = p[0].price;
              if (d > best.discount) best = { id: c.title, desc: c.title, discount: d };
            }
          });
        }
        // store / flat_item / info：不直接叠加折扣，仅作为可领信息展示
      });
      return best;
    }
    // mock 券（type: flat，含 min_spend）：仅当真实券缺失时作为回退
    coupons.forEach(function (c) {
      if (c.type === "flat" && original >= (c.min_spend || 0)) {
        if (c.value > best.discount) {
          best = { id: c.id, desc: c.desc || "", discount: c.value };
        }
      }
    });
    return best;
  }

  function scoreCombo(pairList, mode) {
    var energy = 0, protein = 0, qty = 0, dessert = 0;
    pairList.forEach(function (p) {
      var it = p[0], q = p[1];
      energy += it.energy * q;
      protein += it.protein * q;
      qty += q;
      if (isDessert(it)) dessert += q;
    });
    if (mode === "protein") return protein;
    if (mode === "energy") return energy;
    if (mode === "ppc") return protein / Math.max(energy, 1); // 每千卡蛋白质越高越优（控卡高蛋白）
    // count 模式：甜品降权（不删除），鼓励咸食/主食拼单，纯甜品堆砌得分偏低
    return qty - 0.6 * dessert;
  }

  // ---------- 营养叙事（场景化解读，让评委/用户直观看懂「为什么这份适合你」） ----------
  // 参考值取中国食品标签营养参考值 NRV：能量 2000 kcal、蛋白质 60 g（成年人一般参考）。
  var DAILY_ENERGY = 2000;
  var DAILY_PROTEIN = 60;
  var EGG_PROTEIN = 6.3; // 一个中等鸡蛋约 6.3 g 蛋白

  // 蛋白密度 = 每千卡蛋白质（g/kcal），控卡增肌的核心指标
  function ppc(c) {
    var e = c.energy || 0;
    return e > 0 ? (c.protein || 0) / e : 0;
  }
  // 占每日参考摄入百分比
  function dailyPct(energy, protein) {
    return {
      e: Math.round((energy || 0) / DAILY_ENERGY * 100),
      p: Math.round((protein || 0) / DAILY_PROTEIN * 100),
    };
  }
  // 场景化营养标签（最多 2 个，去重）
  function nutriTags(c, mode) {
    var tags = [];
    var r = ppc(c);
    if ((c.protein || 0) >= 40) tags.push("高蛋白");
    if (mode === "ppc" && r >= 0.05) tags.push("高蛋白低卡");
    if ((c.energy || 0) >= 600) tags.push("顶饱");
    if ((c.energy || 0) <= 450 && (c.protein || 0) >= 12) tags.push("轻负担");
    if ((c.energy || 0) <= 350 && (c.protein || 0) <= 9) tags.push("低卡");
    var seen = {}, out = [];
    tags.forEach(function (t) { if (!seen[t]) { seen[t] = true; out.push(t); } });
    return out.slice(0, 2);
  }
  // 一句话营养解读（场景不同说法不同，全部基于真实 energy/protein 计算）
  function nutriNarrative(c, mode) {
    var p = c.protein || 0, e = c.energy || 0;
    var pct = dailyPct(e, p);
    if (mode === "protein") {
      var eggs = Math.max(1, Math.round(p / EGG_PROTEIN));
      return "≈" + p + "g 蛋白（约 " + eggs + " 个鸡蛋，达每日参考 " + pct.p + "%），备考 / 练后恢复都顶得住";
    }
    if (mode === "energy") {
      return "≈" + e + "kcal（占每日参考 " + pct.e + "%），深夜顶饱一整晚、不挨饿";
    }
    if (mode === "ppc") {
      var r = ppc(c);
      return "每千卡含 " + r.toFixed(2) + "g 蛋白，控卡增肌友好，吃饱也不易胖";
    }
    if ((c.payable || 0) <= 0) return "官方真实券直接白嫖 " + (c.qty || 0) + " 份，不领白不领";
    return "花 ¥" + (c.payable || 0) + " 吃到 " + (c.qty || 0) + " 份 + " + p + "g 蛋白，校园性价比拉满";
  }

  // 组合生成器（带重复，非降序索引去重排列）
  function* combinationsWithReplacement(arr, size) {
    var result = new Array(size);
    function* rec(start, depth) {
      if (depth === size) { yield result.slice(); return; }
      for (var i = start; i < arr.length; i++) {
        result[depth] = arr[i];
        yield* rec(i, depth + 1);
      }
    }
    yield* rec(0, 0);
  }

  function searchCombos(menu, coupons, budget, tags, mode, maxQty, maxSize, topN) {
    maxSize = maxSize || MAX_COMBO_SIZE;
    var pool = menu.filter(function (i) {
      return !tags || tags.length === 0 || tags.some(function (t) { return i.tags.indexOf(t) !== -1; });
    });
    if (pool.length === 0) pool = menu.slice();
    // 大池子按评分目标先筛最相关的前 K 个，并收紧枚举上限，避免组合爆炸：
    // 份数最多→最便宜的；蛋白/热量→每元性价比最高的
    if (pool.length > 25) {
      var K = 20;
      if (mode === "count") {
        pool = pool.slice().sort(function (a, b) { return a.price - b.price; }).slice(0, K);
      } else if (mode === "ppc") {
        pool = pool.slice().sort(function (a, b) {
          return (b.protein / Math.max(b.energy, 1)) - (a.protein / Math.max(a.energy, 1));
        }).slice(0, K);
      } else {
        pool = pool.slice().sort(function (a, b) {
          var ra = (mode === "protein" ? a.protein : a.energy) / Math.max(a.price, 0.01);
          var rb = (mode === "protein" ? b.protein : b.energy) / Math.max(b.price, 0.01);
          return rb - ra;
        }).slice(0, K);
      }
      maxSize = Math.min(maxSize, 4);
    }
    // 性能护栏兜底
    if (pool.length > 60) maxSize = Math.min(maxSize, 2);
    else if (pool.length > 25) maxSize = Math.min(maxSize, 3);

    var candidates = [];
    for (var size = 1; size <= maxSize; size++) {
      for (var combo of combinationsWithReplacement(pool, size)) {
        var counts = {};
        combo.forEach(function (it) { counts[it.code] = (counts[it.code] || 0) + 1; });
        var over = false;
        for (var k in counts) { if (counts[k] > maxQty) { over = true; break; } }
        if (over) continue;

        // 去重汇总（combinations_with_replacement 会产生重复对象）
        var seen = {}, comboItems = [];
        combo.forEach(function (it) {
          if (!seen[it.code]) { seen[it.code] = true; comboItems.push(it); }
        });
        var pairList = comboItems.map(function (it) { return [it, counts[it.code]]; });

        var original = 0;
        pairList.forEach(function (p) { original += p[0].price * p[1]; });
        original = Math.round(original * 100) / 100;
        if (original <= 0) continue;

        var coupon = bestCouponDiscount(original, pairList, coupons);
        var payable = Math.round((original - coupon.discount) * 100) / 100;
        if (payable > budget) continue;

        var scored = scoreCombo(pairList, mode);
        var energy = 0, protein = 0, qty = 0;
        pairList.forEach(function (p) { energy += p[0].energy * p[1]; protein += p[0].protein * p[1]; qty += p[1]; });

        candidates.push({
          items: pairList.map(function (p) { return [p[0].name, p[1], p[0].code]; }),
          original: original,
          coupon: coupon,
          payable: payable,
          score: scored,
          energy: energy,
          protein: protein,
          qty: qty,
        });
      }
    }
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.payable - b.payable;
    });
    return candidates.slice(0, Math.max(1, topN || 3));
  }

  var api = {
    MOCK_MENU: MOCK_MENU,
    MOCK_COUPONS: MOCK_COUPONS,
    PROFILES: PROFILES,
    MAX_COMBO_SIZE: MAX_COMBO_SIZE,
    DAILY_ENERGY: DAILY_ENERGY,
    DAILY_PROTEIN: DAILY_PROTEIN,
    bestCouponDiscount: bestCouponDiscount,
    scoreCombo: scoreCombo,
    ppc: ppc,
    dailyPct: dailyPct,
    nutriTags: nutriTags,
    nutriNarrative: nutriNarrative,
    searchCombos: searchCombos,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Combo = api;
})(typeof window !== "undefined" ? window : this);
