/*
 * demo.js —— 校园省钱凑单 demo 的渲染逻辑（共享）
 * 依赖 combo.js（window.Combo）。各风格 HTML 只需引用本文件 + 各自的 CSS。
 * DOM 约定（各风格必须保留）：#chips #budget #mode #note #results #go #copy
 * 结果卡片类：.rcard .r1/.r2/.r3 .rank .pay .items .itag .meta .cpn
 */
(function () {
  "use strict";
  var C = window.Combo;
  if (!C) return;

  var chipsEl = document.getElementById("chips");
  var budgetEl = document.getElementById("budget");
  var modeEl = document.getElementById("mode");
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

  function applyProfile() {
    var p = C.PROFILES[current];
    if (budgetEl) budgetEl.value = p.budget;
    if (modeEl) modeEl.value = p.mode;
    if (noteEl) noteEl.textContent = "📌 " + p.note;
  }
  applyProfile();

  function fmtItems(items) {
    return items.map(function (it) {
      return '<span class="itag">' + it[0] + (it[1] > 1 ? ' <b>×' + it[1] + '</b>' : '') + '</span>';
    }).join("");
  }

  function compute() {
    var p = C.PROFILES[current];
    var budget = parseFloat(budgetEl.value);
    if (!(budget > 0)) { alert("预算填个正数哈"); return; }
    var mode = modeEl.value;
    var top = C.searchCombos(C.MOCK_MENU, C.MOCK_COUPONS, budget, p.tags, mode, p.max_qty, p.max_size);

    if (!top || top.length === 0) {
      resultsEl.innerHTML = '<div class="empty">⚠️ 这个预算 / 场景下凑不出组合，<br/>试试提高预算或换个场景。</div>';
      lastText = "";
      return;
    }
    var rankNames = ["第1名", "第2名", "第3名"];
    var html = "";
    top.forEach(function (c, i) {
      var cpn = c.coupon && c.coupon.id
        ? '<span class="cpn">已用券 ' + c.coupon.desc + '</span>' : '<span class="cpn">无可用券</span>';
      html +=
        '<div class="rcard r' + (i + 1) + '">' +
          '<div class="rtop">' +
            '<span class="rank">' + rankNames[i] + '</span>' +
            '<span class="pay">实付 <b>¥' + c.payable + '</b> <span class="orig">原价¥' + c.original + '</span>' + cpn + '</span>' +
          '</div>' +
          '<div class="items">' + fmtItems(c.items) + '</div>' +
          '<div class="meta">' +
            '<span>份数 <b>' + c.qty + '</b></span>' +
            '<span>热量 <b>' + c.energy + '</b> kcal</span>' +
            '<span>蛋白 <b>' + c.protein + '</b> g</span>' +
          '</div>' +
        '</div>';
    });
    resultsEl.innerHTML = html;

    lastText = "【麦当劳校园省钱凑单 · " + current + "】预算¥" + budget + "\n" +
      top.map(function (c, i) {
        var items = c.items.map(function (it) { return it[0] + (it[1] > 1 ? "×" + it[1] : ""); }).join(" + ");
        return (i + 1) + ". " + items + " = 实付¥" + c.payable + "（原价¥" + c.original + (c.coupon.id ? "，" + c.coupon.desc : "") + "），" + c.qty + "份/" + c.energy + "kcal/" + c.protein + "g蛋白";
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
        copyEl.textContent = "✅ 已复制，去社团群粘贴吧";
        setTimeout(function () { copyEl.textContent = "📋 复制当前方案"; }, 1800);
      }).catch(function () {});
    }
  };

  window.__demo = { compute: compute, getText: function () { return lastText; } };
})();
