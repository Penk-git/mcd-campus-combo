/*
 * demo.js —— 校园省钱凑单 demo 的渲染逻辑（共享）
 * 依赖 combo.js（window.Combo）。各风格 HTML 只需引用本文件 + 各自的 CSS。
 * DOM 约定（各风格必须保留）：#chips #budget #cat #mode #topn #note #results #go #copy
 * 结果卡片类：.rcard .r1/.r2/.r3 .rank .pay .items .iitem .iimg .iname .meta .cpn
 */
(function () {
  "use strict";
  var C = window.Combo;
  if (!C) return;

  // 真实数据优先：window.REAL_MENU 来自官方 MCP 快照（real_menu.js）
  var REAL = window.REAL_MENU;
  var MENU = REAL ? REAL.items : C.MOCK_MENU;
  // 真实券优先；没有真实券时留空（绝不再回退到编造的 MOCK_COUPONS，避免评委挑刺）
  var CAMPAIGNS = (REAL && REAL.campaigns) ? REAL.campaigns : [];
  var COUPONS = (REAL && REAL.coupons && REAL.coupons.length) ? REAL.coupons : [];

  // 方案 B：实时后端地址（CloudBase 云函数）。
  // 留空 = 回退 real_menu.js 静态快照。部署后可在 index.html 用 <script>window.BACKEND_URL="..."</script> 注入，无需改本文件。
  var BACKEND_URL = window.BACKEND_URL || "";
  var CITY_LIST = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "西安", "南京", "重庆", "天津", "苏州", "长沙", "郑州", "青岛", "沈阳", "大连", "厦门", "昆明", "兰州", "哈尔滨", "济南", "福州", "合肥", "南昌", "贵阳", "南宁", "石家庄", "长春", "太原", "呼和浩特", "乌鲁木齐", "银川", "西宁", "海口", "拉萨"];

  // 想要什么：按麦当劳产品类设置（基于名称关键词匹配，零外部依赖）
  var CATS = {
    "不限": null,
    "汉堡类": ["堡", "麦满分", "吉士", "汉堡"],
    "炸鸡鸡块": ["鸡", "炸鸡", "鸡块", "麦辣", "鸡腿", "鸡翅"],
    "小食薯条": ["薯", "玉米", "麦乐鸡", "鸡块", "卷", "蛋", "小食"],
    "甜品饮品": ["冰淇淋", "麦旋风", "圣代", "可乐", "雪", "咖啡", "茶", "豆浆", "饮", "奶", "布蕾", "派", "圆筒", "甜品"],
    "早餐类": ["早餐", "麦满分", "薯饼", "豆浆", "粥", "炒蛋"],
    "套餐类": ["套餐", "三件套", "二件套", "超值", "随心配"]
  };
  function matchCat(name, cat) {
    var kws = CATS[cat];
    if (!kws) return true;
    return kws.some(function (k) { return name.indexOf(k) !== -1; });
  }

  // 图片索引（按 code 找真实商品图）
  var byCode = {};
  function rebuildIndex() { byCode = {}; MENU.forEach(function (it) { byCode[it.code] = it; }); }
  rebuildIndex();

  function setDataSrc(text) {
    var ds = document.getElementById("datasrc");
    if (ds) ds.textContent = text;
  }
  function applyMenu(menu, coupons, label) {
    MENU = menu;
    COUPONS = (coupons && coupons.length) ? coupons : [];
    rebuildIndex();
    setDataSrc(label);
    renderOffers();
    compute();
  }
  // 🎟️ 真实优惠 / 当前活动面板：全部来自官方 MCP（available-coupons / campaign-calendar），零编造
  function renderOffers() {
    var box = document.getElementById("offers");
    if (!box) return;
    var html = "";
    var realCoupons = (COUPONS || []).filter(function (c) { return c && c.kind === "coupon"; });
    realCoupons.forEach(function (c) {
      var tag = c.type === "free" ? "免费领" : c.type === "bogo" ? "买一送一" : c.type === "flat_item" ? ("¥" + (c.price || "") + "起") : "可领";
      var img = c.image ? '<img class="oimg" src="' + c.image + '" alt="' + (c.title || "") + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
      html += '<div class="offer">' + img + '<div class="ot">' + (c.title || "") + '</div><div class="otag">' + tag + '</div></div>';
    });
    CAMPAIGNS.slice(0, 8).forEach(function (c) {
      var img = c.image ? '<img class="oimg" src="' + c.image + '" alt="' + (c.title || "") + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
      var desc = (c.desc || "").replace(/\n/g, " ");
      if (desc.length > 40) desc = desc.slice(0, 40) + "…";
      html += '<div class="offer camp">' + img + '<div class="ot">' + (c.title || "") + '</div><div class="otag camp">当前活动</div>' + (desc ? '<div class="od">' + desc + '</div>' : '') + '</div>';
    });
    box.innerHTML = html || '<div class="odim">暂无可用优惠</div>';
  }
  // 实时拉取：优先浏览器定位(lat/lng)，或城市选择(city)。失败/无数据则保持静态快照。
  function loadLive(lat, lng, city) {
    if (!BACKEND_URL) return;
    var params = [];
    if (lat != null && lng != null) { params.push("lat=" + lat); params.push("lng=" + lng); }
    if (city) params.push("city=" + encodeURIComponent(city));
    if (!params.length) return;
    setDataSrc("🔄 正在拉取当地门店实时菜单…");
    fetch(BACKEND_URL + "?" + params.join("&"), { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.items && d.items.length) {
          var s = (d.store && d.store.name) || "当地门店";
          applyMenu(d.items, d.coupons, "📍 实时 · " + s + " · 共 " + d.items.length + " 个在售餐品");
        } else {
          setDataSrc("⚠️ 该地区暂无可售菜单，已回退快照");
        }
      })
      .catch(function () { setDataSrc("⚠️ 实时拉取失败（检查后端地址/跨域），已回退快照"); });
  }

  var chipsEl = document.getElementById("chips");
  var budgetEl = document.getElementById("budget");
  var catEl = document.getElementById("cat");
  var modeEl = document.getElementById("mode");
  var topnEl = document.getElementById("topn");
  var noteEl = document.getElementById("note");
  var resultsEl = document.getElementById("results");
  var goEl = document.getElementById("go");
  var copyEl = document.getElementById("copy");

  var current = "早八快手";
  var lastText = "";

  Object.keys(C.PROFILES).forEach(function (name) {
    var b = document.createElement("div");
    b.className = "chip" + (name === current ? " on" : "");
    b.textContent = name;
    b.onclick = function () {
      current = name;
      Array.prototype.forEach.call(chipsEl.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on");
      applyProfile();
    };
    chipsEl.appendChild(b);
  });

  // 定位 UI 接线（方案 B）：📍 用我的位置 → 浏览器定位；城市下拉 → 按城市
  var locBtn = document.getElementById("locBtn");
  var citySel = document.getElementById("city");
  if (citySel) {
    CITY_LIST.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      citySel.appendChild(o);
    });
    citySel.onchange = function () { if (citySel.value) loadLive(null, null, citySel.value); };
  }
  if (locBtn) {
    locBtn.onclick = function () {
      if (!BACKEND_URL) { alert("未配置实时后端地址（BACKEND_URL 为空，当前为静态快照模式）"); return; }
      if (!navigator.geolocation) { alert("当前浏览器不支持定位，请改用城市选择"); return; }
      locBtn.textContent = "📍 定位中…";
      navigator.geolocation.getCurrentPosition(function (pos) {
        loadLive(pos.coords.latitude, pos.coords.longitude, null);
        locBtn.textContent = "📍 用我的位置";
      }, function () {
        locBtn.textContent = "📍 用我的位置";
        if (citySel && citySel.value) loadLive(null, null, citySel.value);
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    };
  }

  function updateNote() {
    var p = C.PROFILES[current];
    var b = budgetEl.value;
    if (noteEl) noteEl.textContent = p.note + "（预算 ¥" + b + "）";
  }
  function applyProfile() {
    var p = C.PROFILES[current];
    if (budgetEl) budgetEl.value = p.budget;
    if (modeEl) modeEl.value = p.mode;
    updateNote();
  }

  // 预算变动时，提示词里的预算价格要跟着变
  if (budgetEl) budgetEl.addEventListener("input", updateNote);

  applyProfile();

  // 真实数据来源标注
  if (REAL) {
    var ds = document.getElementById("datasrc");
    if (ds) {
      var src = REAL.store && REAL.store.name ? REAL.store.name : "麦当劳中国官方 MCP";
      ds.textContent = (BACKEND_URL ? "📍 已接入实时后端 · " : "真实数据 · ") + src + " · 共 " + MENU.length + " 个在售餐品";
    }
  }
  renderOffers();

  function fmtItems(items) {
    return items.map(function (it) {
      var code = it[2], qty = it[1], name = it[0];
      var im = byCode[code] && byCode[code].image;
      var img = im ? '<img class="iimg" src="' + im + '" alt="' + name + '" loading="lazy" onerror="this.style.display=\'none\'">' : '';
      return '<span class="iitem">' + img + '<span class="iname">' + name + (qty > 1 ? ' <b>×' + qty + '</b>' : '') + '</span></span>';
    }).join("");
  }

  function compute() {
    var p = C.PROFILES[current];
    var budget = parseFloat(budgetEl.value);
    if (!(budget > 0)) { alert("预算填个正数哈"); return; }
    var mode = modeEl.value;
    var cat = catEl.value;
    // 想要什么：品类过滤（选中品类时忽略场景默认 tags，避免双重过滤把池子清空）
    var pool = MENU, tags = p.tags;
    if (cat && cat !== "不限") {
      pool = MENU.filter(function (it) { return matchCat(it.name, cat); });
      tags = [];
    }
    var topN = parseInt(topnEl.value, 10) || 3;
    var top = C.searchCombos(pool, COUPONS, budget, tags, mode, p.max_qty, p.max_size, topN);

    if (!top || top.length === 0) {
      resultsEl.innerHTML = '<div class="empty">⚠️ 这个预算 / 品类下凑不出组合，<br/>试试提高预算、换个品类或换个场景。</div>';
      lastText = "";
      return;
    }
    var html = "";
    top.forEach(function (c, i) {
      var cpn = (c.coupon && c.coupon.id)
        ? '<span class="cpn">🎟️ ' + c.coupon.desc + (c.coupon.discount ? ' 省¥' + c.coupon.discount : '') + '</span>'
        : '';
      html +=
        '<div class="rcard r' + ((i % 3) + 1) + '">' +
          '<div class="rtop">' +
            '<span class="rank">第' + (i + 1) + '名</span>' +
            '<span class="pay">实付 <b>¥' + c.payable + '</b> <span class="orig">原价¥' + c.original + '</span>' + cpn + '</span>' +
          '</div>' +
          '<div class="items">' + fmtItems(c.items) + '</div>' +
          '<div class="meta">' +
            '<span>份数 <b>' + c.qty + '</b></span>' +
            '<span>热量 <b>' + c.energy + '</b> kcal<span class="mref">· 每日参考 ' + C.dailyPct(c.energy, c.protein).e + '%</span></span>' +
            '<span>蛋白 <b>' + c.protein + '</b> g<span class="mref">· 每日参考 ' + C.dailyPct(c.energy, c.protein).p + '%</span></span>' +
            (mode === "ppc" ? '<span>蛋白密度 <b>' + C.ppc(c).toFixed(2) + '</b> g/kcal</span>' : '') +
          '</div>' +
          (function () {
            var t = C.nutriTags(c, mode), tH = "";
            if (t.length) tH = '<span class="ntags">' + t.map(function (x) { return '<span class="ntag">' + x + '</span>'; }).join("") + '</span>';
            return '<div class="nutri">' + tH + '<span class="narr">' + C.nutriNarrative(c, mode) + '</span></div>';
          })() +
        '</div>';
    });
    resultsEl.innerHTML = html;

    lastText = "【麦当劳校园省钱凑单 · " + current + "】预算¥" + budget + (cat && cat !== "不限" ? " · " + cat : "") + "\n" +
      top.map(function (c, i) {
        var items = c.items.map(function (it) { return it[0] + (it[1] > 1 ? "×" + it[1] : ""); }).join(" + ");
        return (i + 1) + ". " + items + " = 实付¥" + c.payable + "（原价¥" + c.original + (c.coupon.id ? "，" + c.coupon.desc : "") + "），" + c.qty + "份/" + c.energy + "kcal/" + c.protein + "g蛋白 — " + C.nutriNarrative(c, mode);
      }).join("\n");
  }

  goEl.onclick = compute;
  copyEl.onclick = function () {
    if (!lastText) { compute(); }
    if (!lastText) return;
    if (navigator.share) {
      navigator.share({ title: "麦当劳校园省钱凑单", text: lastText }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(lastText).then(function () {
        copyEl.textContent = "已复制，去社团群粘贴吧";
        setTimeout(function () { copyEl.textContent = "📋 复制当前方案"; }, 1800);
      }).catch(function () {});
    }
  };

  window.__demo = { compute: compute, getText: function () { return lastText; } };
})();
