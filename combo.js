/*
 * combo.js —— 校园省钱凑单算法（纯 JS 移植，与 campus_combo_finder.py 等价）
 * 同时支持浏览器 <script> 引入与 Node require（用于离线校验）。
 * 价格为人民币（元）；energy=热量(kcal)；protein=蛋白质(g)。数值为示意，以官方实时为准。
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
    "早八快手":     { budget: 15, tags: ["早餐"],      mode: "count",  max_qty: 2, note: "赶早八，快速管饱、别超 15 块" },
    "课间垫肚子":   { budget: 12, tags: ["小吃", "饮品"], mode: "count", max_qty: 2, note: "两节课之间垫一口，预算 12" },
    "考试周补能量": { budget: 25, tags: [],           mode: "protein", max_qty: 2, note: "备考要顶饱高蛋白，按每元蛋白质排序" },
    "宿舍夜宵":     { budget: 20, tags: ["正餐"],      mode: "energy",  max_qty: 2, note: "晚上回宿舍加个正餐，按每元热量排" },
    "社团聚餐":     { budget: 60, tags: [],           mode: "count",  max_qty: 3, max_size: 6, note: "几个人拼单，份数越多越划算，单品最多 3 份" },
  };

  var MAX_COMBO_SIZE = 4;

  // 甜品关键词（派/圆筒/冰淇淋/圣代/麦旋风等）。count 模式下降权，但仍可入选。
  var DESSERT_KW = ["派", "圆筒", "冰淇淋", "圣代", "麦旋风", "布蕾", "糍粑", "雪糕", "火炬", "旋风"];
  function isDessert(it) {
    var n = it.name || "";
    return DESSERT_KW.some(function (k) { return n.indexOf(k) !== -1; });
  }

  function bestCouponDiscount(original, coupons) {
    var best = { id: null, desc: "", discount: 0.0 };
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
    // count 模式：甜品降权（不删除），鼓励咸食/主食拼单，纯甜品堆砌得分偏低
    return qty - 0.6 * dessert;
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

  function searchCombos(menu, coupons, budget, tags, mode, maxQty, maxSize) {
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

        var coupon = bestCouponDiscount(original, coupons);
        var payable = Math.round((original - coupon.discount) * 100) / 100;
        if (payable > budget) continue;

        var scored = scoreCombo(pairList, mode);
        var energy = 0, protein = 0, qty = 0;
        pairList.forEach(function (p) { energy += p[0].energy * p[1]; protein += p[0].protein * p[1]; qty += p[1]; });

        candidates.push({
          items: pairList.map(function (p) { return [p[0].name, p[1]]; }),
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
    return candidates.slice(0, 3);
  }

  var api = {
    MOCK_MENU: MOCK_MENU,
    MOCK_COUPONS: MOCK_COUPONS,
    PROFILES: PROFILES,
    MAX_COMBO_SIZE: MAX_COMBO_SIZE,
    bestCouponDiscount: bestCouponDiscount,
    scoreCombo: scoreCombo,
    searchCombos: searchCombos,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Combo = api;
})(typeof window !== "undefined" ? window : this);
