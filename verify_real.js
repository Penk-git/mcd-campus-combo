// Node 验证：combo.js + 真实 real_menu.json，逐场景跑 Top3 + 计时
const fs = require("fs");
const path = require("path");
const Combo = require("./combo.js");
const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, "real_menu.json"), "utf-8"));

const MENU = REAL.items;
const COUPONS = REAL.coupons && REAL.coupons.length ? REAL.coupons : Combo.MOCK_COUPONS;
console.log("真实餐品数:", MENU.length, "| 门店:", REAL.store && REAL.store.name);

let maxMs = 0;
for (const [name, p] of Object.entries(Combo.PROFILES)) {
  const t0 = Date.now();
  const top = Combo.searchCombos(MENU, COUPONS, p.budget, p.tags, p.mode, p.max_qty, p.max_size);
  const ms = Date.now() - t0;
  maxMs = Math.max(maxMs, ms);
  console.log(`\n【${name}】预算¥${p.budget} 模式=${p.mode} 用时=${ms}ms 结果数=${top.length}`);
  top.forEach((c, i) => {
    const items = c.items.map(it => it[0] + (it[1] > 1 ? "×" + it[1] : "")).join(" + ");
    console.log(`  ${i + 1}. ${items} = 实付¥${c.payable}（原价¥${c.original}） ${c.qty}份/${c.energy}kcal/${c.protein}g蛋白`);
  });
  if (top.length === 0) console.log("  ⚠️ 无结果");
}
console.log(`\n最慢场景: ${maxMs}ms（浏览器端同逻辑，应 < 2s 可接受）`);
