// verify_demo.js —— 校验 combo.js 与 Python 版输出一致（5 个场景）
const C = require("./combo.js");

const expected = {
  "早八快手":     { payable: 15, qty: 3,  items: [["脆薯饼", 2], ["热豆浆", 1]] },
  "课间垫肚子":   { payable: 12, qty: 2,  items: [["热豆浆", 2]] },
  "考试周补能量": { payable: 22, qty: 2,  protein: 38, items: [["吉士蛋麦满分", 1], ["猪柳蛋麦满分", 1]] },
  "宿舍夜宵":     { payable: 19, qty: 1,  items: [["巨无霸", 1]] },
  "社团聚餐":     { payable: 31, qty: 6,  items: [["脆薯饼", 3], ["热豆浆", 3]] },
};

let pass = 0, fail = 0;
for (const name of Object.keys(C.PROFILES)) {
  const p = C.PROFILES[name];
  const top = C.searchCombos(C.MOCK_MENU, C.MOCK_COUPONS, p.budget, p.tags, p.mode, p.max_qty, p.max_size);
  const best = top[0];
  const exp = expected[name];
  const items = best.items.map(it => it[0] + "×" + it[1]).join(" + ");
  const okPay = best.payable === exp.payable;
  const okQty = best.qty === exp.qty;
  const okItem = JSON.stringify(best.items) === JSON.stringify(exp.items);
  const okProt = exp.protein == null || best.protein === exp.protein;
  const ok = okPay && okQty && okItem && okProt;
  console.log((ok ? "[通过] " : "[失败] ") + name + " → " + items + " | 实付¥" + best.payable + " | " + best.qty + "份 | " + best.protein + "g蛋白");
  if (!ok) { fail++; console.log("   期望: " + JSON.stringify(exp)); console.log("   实际: " + JSON.stringify({ payable: best.payable, qty: best.qty, protein: best.protein, items: best.items })); }
  else pass++;
}
console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
