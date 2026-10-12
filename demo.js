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
  // 点击任意卡片 → 弹窗查看完整详情（大图 / 完整描述 / 领取状态）
  function couponTag(c) {
    return c.type === "free" ? "免费领" : c.type === "bogo" ? "买一送一" : c.type === "flat_item" ? ("¥" + (c.price || "") + "起") : "可领";
  }
  function renderOffers() {
    var box = document.getElementById("offers");
    if (!box) return;
    var html = "";
    var realCoupons = (COUPONS || []).filter(function (c) { return c && c.kind === "coupon"; });
    realCoupons.forEach(function (c, i) {
      var img = c.image ? '<img class="oimg" src="' + c.image + '" alt="' + (c.title || "") + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
      html += '<div class="offer" data-ci="' + i + '">' + img + '<div class="ot">' + (c.title || "") + '</div><div class="otag">' + couponTag(c) + '</div></div>';
    });
    CAMPAIGNS.slice(0, 8).forEach(function (c, i) {
      var img = c.image ? '<img class="oimg" src="' + c.image + '" alt="' + (c.title || "") + '" loading="lazy" onerror="this.style.display=\'none\'">' : "";
      var desc = (c.desc || "").replace(/\n/g, " ");
      if (desc.length > 40) desc = desc.slice(0, 40) + "…";
      html += '<div class="offer camp" data-ai="' + i + '">' + img + '<div class="ot">' + (c.title || "") + '</div><div class="otag camp">当前活动</div>' + (desc ? '<div class="od">' + desc + '</div>' : '') + '</div>';
    });
    box.innerHTML = html || '<div class="odim">暂无可用优惠</div>';
  }
  // 优惠详情弹窗
  var modalBox = null;
  function ensureModal() {
    if (modalBox) return modalBox;
    modalBox = document.createElement("div");
    modalBox.className = "modal-mask";
    modalBox.style.display = "none";
    modalBox.innerHTML = '<div class="modal"><button class="modal-close" aria-label="关闭">✕</button><div class="modal-body"></div></div>';
    document.body.appendChild(modalBox);
    modalBox.addEventListener("click", function (e) {
      if (e.target === modalBox || (e.target && e.target.classList && e.target.classList.contains("modal-close"))) modalBox.style.display = "none";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modalBox && modalBox.style.display !== "none") modalBox.style.display = "none"; });
    return modalBox;
  }
  function openOfferModal(o, isCamp) {
    var m = ensureModal();
    var body = m.querySelector(".modal-body");
    var html = "";
    if (o.image) html += '<img class="modal-img" src="' + o.image + '" alt="' + (o.title || "") + '" onerror="this.style.display=\'none\'">';
    html += '<div class="modal-tag' + (isCamp ? " camp" : "") + '">' + (isCamp ? "当前活动" : couponTag(o)) + '</div>';
    html += '<div class="modal-title">' + (o.title || "") + '</div>';
    if (isCamp && o.desc) html += '<div class="modal-desc">' + o.desc + '</div>';
    if (!isCamp && o.status) html += '<div class="modal-desc">领取状态：' + o.status + '</div>';
    html += '<div class="modal-src">数据来自麦当劳官方 MCP（' + (isCamp ? "campaign-calendar" : "available-coupons") + '）实时接口，领取方式与最终解释以麦当劳 App 实际为准</div>';
    body.innerHTML = html;
    m.style.display = "flex";
  }
  // 事件委托：offers 容器常驻，点卡片按 data 索引弹详情
  (function bindOffers() {
    var box = document.getElementById("offers");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var t = e.target;
      var el = t && t.closest ? t.closest(".offer") : null;
      if (!el) return;
      var ci = el.getAttribute("data-ci"), ai = el.getAttribute("data-ai");
      if (ci != null) {
        var rc = (COUPONS || []).filter(function (c) { return c && c.kind === "coupon"; });
        if (rc[+ci]) openOfferModal(rc[+ci], false);
      } else if (ai != null) {
        if (CAMPAIGNS[+ai]) openOfferModal(CAMPAIGNS[+ai], true);
      }
    });
  })();
  // 实时拉取：优先浏览器定位(lat/lng)，或城市选择(city)，或指定门店(storeCode)。
  // 失败自动重试最多 2 次（腾讯云网关多 IP 轮询，偶发单 IP 不可达，重试换 IP 大概率成功），再失败回退快照并允许点击重试。
  function loadLive(lat, lng, city, storeCode, attempts) {
    if (!BACKEND_URL) return;
    attempts = attempts || 0;
    var params = [];
    if (lat != null && lng != null) { params.push("lat=" + lat); params.push("lng=" + lng); }
    if (city) params.push("city=" + encodeURIComponent(city));
    if (storeCode) params.push("storeCode=" + encodeURIComponent(storeCode));
    if (!params.length) return;
    setDataSrc(attempts > 0 ? "🔄 网络波动，正在重试（第 " + attempts + " 次）…" : "🔄 正在拉取当地门店实时菜单…");
    fetch(BACKEND_URL + "?" + params.join("&"), { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.items && d.items.length) {
          var s = (d.store && d.store.name) || "当地门店";
          applyMenu(d.items, d.coupons, "📍 实时 · " + s + " · 共 " + d.items.length + " 个在售餐品");
          // 自动选择模式下，把后端实际选中的门店回填到门店下拉框
          if (storeSel && d.store && d.store.code) {
            for (var i = 0; i < storeSel.options.length; i++) {
              if (storeSel.options[i].value === d.store.code) { storeSel.selectedIndex = i; break; }
            }
          }
        } else if (d && d.error) {
          setDataSrc("⚠️ " + d.error + "，已回退快照");
        } else {
          setDataSrc("⚠️ 该地区暂无可售菜单，已回退快照");
        }
      })
      .catch(function () {
        // 网络抖动/网关单 IP 不可达：自动重试最多 2 次，再失败给出可点击的重试入口
        if (attempts < 2) { loadLive(lat, lng, city, storeCode, attempts + 1); return; }
        setDataSrc("⚠️ 实时拉取失败（网络波动），已回退快照 · 点击这行字重试");
        var ds = document.getElementById("datasrc");
        if (ds) {
          ds.style.cursor = "pointer";
          ds.onclick = function () {
            ds.onclick = null; ds.style.cursor = "";
            loadLive(lat, lng, city, storeCode);
          };
        }
      });
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
  var shareEl = document.getElementById("shareImg");

  var current = "早八快手";
  var lastText = "";
  var lastTop = [];      // 最近一次计算结果（供分享图渲染）
  var lastCtx = null;    // { scene, budget, cat, mode }

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

  // 定位 UI 接线（方案 B）：📍 用我的位置 → 浏览器定位；城市下拉 → 按城市；门店下拉 → 指定门店
  var locBtn = document.getElementById("locBtn");
  var citySel = document.getElementById("city");
  var storeSel = document.getElementById("store");
  var lastCoords = null; // 最近一次定位坐标（切门店时传给后端用于店名反查）

  // 拉附近门店列表填充门店下拉框（失败不阻塞，保持"自动选择"）
  function fillStores(list) {
    if (!storeSel) return;
    storeSel.innerHTML = '<option value="">🏪 门店：自动选择最近营业店</option>';
    (list || []).forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.code;
      var label = s.name || ("门店 " + s.code);
      if (s.distance) label += "（" + (s.distance >= 1000 ? (s.distance / 1000).toFixed(1) + "km" : s.distance + "m") + "）";
      if (s.address) label += " " + s.address;
      o.textContent = label;
      storeSel.appendChild(o);
    });
    storeSel.disabled = !(list && list.length);
  }
  function loadStores(lat, lng, city) {
    if (!BACKEND_URL || !storeSel) return;
    var params = ["listStores=1"];
    if (lat != null && lng != null) { params.push("lat=" + lat); params.push("lng=" + lng); }
    if (city) params.push("city=" + encodeURIComponent(city));
    storeSel.disabled = true;
    fetch(BACKEND_URL + "?" + params.join("&"), { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (d) { fillStores(d && d.stores); })
      .catch(function () { storeSel.disabled = false; });
  }

  if (citySel) {
    CITY_LIST.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      citySel.appendChild(o);
    });
    citySel.onchange = function () {
      if (!citySel.value) return;
      lastCoords = null;
      loadStores(null, null, citySel.value);
      loadLive(null, null, citySel.value, null);
    };
  }
  if (storeSel) {
    storeSel.onchange = function () {
      var city = citySel && citySel.value ? citySel.value : null;
      var lat = lastCoords ? lastCoords.lat : null;
      var lng = lastCoords ? lastCoords.lng : null;
      loadLive(lat, lng, city, storeSel.value || null);
    };
  }
  if (locBtn) {
    locBtn.onclick = function () {
      if (!BACKEND_URL) { alert("未配置实时后端地址（BACKEND_URL 为空，当前为静态快照模式）"); return; }
      if (!navigator.geolocation) { alert("当前浏览器不支持定位，请改用城市选择"); return; }
      locBtn.textContent = "📍 定位中…";
      navigator.geolocation.getCurrentPosition(function (pos) {
        lastCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        loadStores(pos.coords.latitude, pos.coords.longitude, null);
        loadLive(pos.coords.latitude, pos.coords.longitude, null, null);
        locBtn.textContent = "📍 用我的位置";
      }, function () {
        locBtn.textContent = "📍 用我的位置";
        if (citySel && citySel.value) {
          loadStores(null, null, citySel.value);
          loadLive(null, null, citySel.value, null);
        }
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
      lastTop = []; lastCtx = null;
      return;
    }
    lastTop = top;
    lastCtx = { scene: current, budget: budget, cat: cat, mode: mode };
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

  // ===== 🖼️ 分享卡片图：canvas 画出 Top3 方案，可保存/分享到群 =====
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    var lines = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = text[i]; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function buildShareCard() {
    var W = 720, pad = 34, innerW = W - pad * 2;
    var headH = 168, footH = 96;
    var cardH = 168; // 每张方案卡高度（含间距）
    var n = Math.min(lastTop.length, 5);
    var H = headH + n * cardH + footH + pad;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");

    // 背景
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#fff6e6"); bg.addColorStop(1, "#ffefd0");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 顶部红招牌
    ctx.fillStyle = "#da291c"; ctx.fillRect(0, 0, W, headH - 10);
    ctx.fillStyle = "#ffc72c"; ctx.fillRect(0, headH - 10, W, 8);
    ctx.fillStyle = "#ffe9b8"; ctx.font = "700 20px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("麦当劳中国 MCP 真实数据 · 校园凑单神器", pad, 22);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("🍔 麦当劳校园省钱凑单", pad, 52);
    ctx.fillStyle = "#ffe9b8"; ctx.font = "800 22px 'PingFang SC','Microsoft YaHei',sans-serif";
    var ctxLine = "场景：" + (lastCtx ? lastCtx.scene : "") + " · 预算 ¥" + (lastCtx ? lastCtx.budget : "");
    if (lastCtx && lastCtx.cat && lastCtx.cat !== "不限") ctxLine += " · 想要 " + lastCtx.cat;
    ctx.fillText(ctxLine, pad, 108);

    // 方案卡
    var y = headH + 6;
    for (var i = 0; i < n; i++) {
      var c = lastTop[i];
      // 卡片
      ctx.fillStyle = "#fffdf6";
      rr(ctx, pad, y, innerW, cardH - 16, 16); ctx.fill();
      ctx.fillStyle = i === 0 ? "#da291c" : (i === 1 ? "#f0a500" : "#c9a36b");
      rr(ctx, pad, y, 8, cardH - 16, 4); ctx.fill();
      var tx = pad + 26;
      // 第一行：名次 + 实付
      ctx.fillStyle = "#ffffff"; ctx.font = "900 18px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillStyle = i === 0 ? "#da291c" : (i === 1 ? "#f0a500" : "#c9a36b");
      rr(ctx, tx, y + 14, 64, 26, 6); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText("第" + (i + 1) + "名", tx + 10, y + 17);
      ctx.fillStyle = "#9a6b2f"; ctx.font = "800 18px 'PingFang SC','Microsoft YaHei',sans-serif";
      var payStr = "实付 ¥" + c.payable + "（原价 ¥" + c.original + "）";
      ctx.fillText(payStr, tx + 78, y + 16);
      // 第二行：餐品
      var items = c.items.map(function (it) { return it[0] + (it[1] > 1 ? "×" + it[1] : ""); }).join(" + ");
      ctx.fillStyle = "#2a2118"; ctx.font = "800 19px 'PingFang SC','Microsoft YaHei',sans-serif";
      var lines = wrapText(ctx, items, innerW - 52);
      var ly = y + 52;
      lines.slice(0, 2).forEach(function (ln) { ctx.fillText(ln, tx, ly); ly += 26; });
      // 第三行：营养 meta
      ctx.fillStyle = "#9a6b2f"; ctx.font = "700 16px 'PingFang SC','Microsoft YaHei',sans-serif";
      var meta = c.qty + " 份 · " + c.energy + " kcal · 蛋白 " + c.protein + "g";
      if (c.coupon && c.coupon.id) meta += " · 🎟️ " + c.coupon.desc;
      ctx.fillText(meta, tx, y + 110);
      // 第四行：营养解读（截断一行）
      ctx.fillStyle = "#6b5a44"; ctx.font = "700 15px 'PingFang SC','Microsoft YaHei',sans-serif";
      var narr = C.nutriNarrative(c, lastCtx.mode);
      if (ctx.measureText(narr).width > innerW - 60) {
        while (narr.length > 1 && ctx.measureText(narr + "…").width > innerW - 60) narr = narr.slice(0, -1);
        narr += "…";
      }
      ctx.fillText("💡 " + narr, tx, y + 134);
      y += cardH;
    }

    // 底部
    ctx.fillStyle = "#9a6b2f"; ctx.font = "800 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("数据来自麦当劳官方 MCP · 按定位返回当地门店真实菜单", pad, H - footH + 4);
    ctx.fillStyle = "#da291c"; ctx.font = "900 19px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("github.com/Penk-git/mcd-campus-combo", pad, H - footH + 34);

    return cv;
  }
  if (shareEl) {
    shareEl.onclick = function () {
      if (!lastTop.length) { compute(); }
      if (!lastTop.length) { alert("先算出一个能用的方案再生成分享图哈"); return; }
      var cv = buildShareCard();
      var done = function () {
        shareEl.textContent = "✅ 已生成";
        setTimeout(function () { shareEl.textContent = "🖼️ 生成分享图（发群拉票）"; }, 1800);
      };
      cv.toBlob(function (blob) {
        if (!blob) return;
        var file = new File([blob], "mcd-campus-combo.png", { type: "image/png" });
        // 手机端：直接调系统分享（微信/QQ 群一步到位）；桌面端：下载 PNG
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "麦当劳校园省钱凑单" }).then(done).catch(function () {});
        } else {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "mcd-campus-combo.png";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          done();
        }
      }, "image/png");
    };
  }

  window.__demo = { compute: compute, getText: function () { return lastText; } };
})();
