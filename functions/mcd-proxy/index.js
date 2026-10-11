'use strict';
/**
 * 麦当劳校园省钱凑单 —— 后端代理云函数（Node.js，CloudBase HTTP 函数）
 *
 * 职责：在【服务端】持有 MCD_MCP_TOKEN，按用户传入的经纬度/城市，
 * 实时调用麦当劳中国 MCP 拉取【当地营业门店】的菜单+营养+优惠券，
 * 返回给前端。前端永远拿不到 Token。
 *
 * 协议：Streamable HTTP（从 mcd_mcp_client.py 逐行移植）
 *   - POST https://mcp.mcd.cn  JSON-RPC 2.0
 *   - Authorization: Bearer <MCD_MCP_TOKEN>
 *   - Accept: application/json, text/event-stream
 *   - 初始化后从响应头取 Mcp-Session-Id 回传
 *
 * 部署要求：把 MCD_MCP_TOKEN 设为云函数环境变量（控制台/配置），切勿写进仓库。
 */

const MCD_MCP_URL = 'https://mcp.mcd.cn';

// ---------- 极简 MCP Streamable HTTP 客户端 ----------
function createClient(token) {
  let sessionId = null;
  let _id = 0;

  function parseBody(text) {
    text = (text || '').trim();
    if (!text) return null;
    if (text.startsWith('{')) return JSON.parse(text);
    // text/event-stream：取最后一个 data: 行
    let result = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('data:')) {
        const chunk = line.slice(5).trim();
        if (chunk) result = JSON.parse(chunk);
      }
    }
    return result;
  }

  async function request(method, params, isNotification) {
    const payload = { jsonrpc: '2.0', method };
    if (!isNotification) payload.id = ++_id;
    if (params !== undefined) payload.params = params;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const resp = await fetch(MCD_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (resp.status === 401) throw new Error('401：MCP Token 无效/过期，请检查 MCD_MCP_TOKEN');
    if (resp.status === 429) throw new Error('429：触发限流（>600 次/分钟）');
    const sid = resp.headers.get('Mcp-Session-Id');
    if (sid) sessionId = sid;
    const text = await resp.text();
    if (isNotification) return null;
    return parseBody(text);
  }

  return {
    async initialize() {
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'campus-combo-finder', version: '1.0.0' },
      });
      await request('notifications/initialized', {}, true);
    },
    listTools() {
      return request('tools/list', {});
    },
    callTool(name, args) {
      return request('tools/call', { name, arguments: args || {} });
    },
  };
}

function textOf(result) {
  if (!result || typeof result !== 'object') return '';
  const inner = result.result || result;
  const content = inner && inner.content;
  if (Array.isArray(content)) {
    return content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
  }
  return '';
}

function extractJson(text) {
  const i = text.indexOf('## Original Response');
  const chunk = i !== -1 ? text.slice(i) : text;
  const s = chunk.indexOf('{');
  const e = chunk.lastIndexOf('}');
  return JSON.parse(chunk.slice(s, e + 1));
}

// ---------- 派生校园场景标签（真实菜单只有营销标签） ----------
const BREAKFAST = ['麦满分', '薯饼', '豆浆', '粥', '炒蛋', '早餐'];
const MAIN = ['堡', '鸡', '牛', '猪', '鱼', '饭', '面', '卷', '盒', '虾', '排'];
const MEAT = ['堡', '鸡', '牛', '猪', '鱼', '肉', '腿', '虾', '排', '羊'];
const SNACK = ['薯条', '鸡块', '鸡翅', '芝士', '薯', '鸡柳', '鸡米', '派', '条', '圈', '小食'];
const DRINK = ['可乐', '雪碧', '咖啡', '茶', '果汁', '牛奶', '新地', '冰淇淋', '奶昔', '圣代', '饮', '汽水', '柠檬', '麦旋'];
const DESSERT = ['新地', '冰淇淋', '麦旋风', '派', '圣代', '糖', '甜', '芝士棒'];

function derive(name, tags) {
  const n = name || '';
  const add = [];
  if (BREAKFAST.some((k) => n.includes(k))) add.push('早餐');
  if (n.includes('蛋')) add.push('含蛋');
  if (MAIN.some((k) => n.includes(k)) || tags.includes('套餐') ||
      tags.includes('100%纯牛肉') || tags.includes('100%安格斯牛肉') || tags.includes('麦金卡')) add.push('正餐');
  if (MEAT.some((k) => n.includes(k))) add.push('含肉');
  if (tags.includes('小食') || SNACK.some((k) => n.includes(k))) add.push('小吃');
  if (tags.includes('冷饮') || DRINK.some((k) => n.includes(k))) add.push('饮品');
  if (DESSERT.some((k) => n.includes(k))) add.push('甜品');
  return add;
}

const MERCH_KW = ['周边', '玩具', '公仔', '挂件', '徽章', '毛绒', '玩偶', '盲盒', '手办', '模型', '服饰', '衬衫', '帽子'];
const SAUCE_KW = ['蘸酱', '风味酱', '牧场酱', '山葵酱', '番茄酱', '辣椒酱', '芥末酱', '沙拉酱', '蜂蜜酱', '糖浆', '酱料'];

// 主要城市坐标表：纯经纬度定位时，反查最近城市名传给 MCP（query-nearby-stores 必须带城市）。
// 零外部依赖、无需密钥。小城市会落到最近的大城市，对凑单场景足够。
const CITY_COORDS = {
  北京: [39.9042, 116.4074], 上海: [31.2304, 121.4737], 广州: [23.1291, 113.2644],
  深圳: [22.5431, 114.0579], 成都: [30.5728, 104.0668], 杭州: [30.2741, 120.1551],
  武汉: [30.5928, 114.3055], 西安: [34.3416, 108.9398], 南京: [32.0603, 118.7969],
  重庆: [29.5630, 106.5516], 天津: [39.3434, 117.3616], 苏州: [31.2989, 120.5853],
  长沙: [28.2282, 112.9388], 郑州: [34.7466, 113.6254], 青岛: [36.0671, 120.3826],
  沈阳: [41.8057, 123.4315], 大连: [38.9140, 121.6147], 厦门: [24.4798, 118.0894],
  昆明: [25.0389, 102.7183], 兰州: [36.0611, 103.8339], 哈尔滨: [45.8038, 126.5349],
  济南: [36.6512, 117.1201], 福州: [26.0745, 119.2965], 合肥: [31.8206, 117.2272],
  南昌: [28.6829, 115.8579], 贵阳: [26.6470, 106.6302], 南宁: [22.8170, 108.3665],
  石家庄: [38.0428, 114.5149], 长春: [43.8171, 125.3235], 太原: [37.8706, 112.5489],
  呼和浩特: [40.8424, 111.7492], 乌鲁木齐: [43.8256, 87.6168], 银川: [38.4872, 106.2309],
  西宁: [36.6171, 101.7782], 海口: [20.0440, 110.1999], 拉萨: [29.6520, 91.1721],
};

function nearestCity(lat, lng) {
  let best = null;
  let bd = Infinity;
  for (const [name, [la, lo]] of Object.entries(CITY_COORDS)) {
    const d = (la - lat) ** 2 + (lo - lng) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// ---------- 核心：按地区拉真实菜单 ----------
async function buildMenuForLocation(token, lat, lng, city) {
  const cli = createClient(token);
  await cli.initialize();

  // 纯经纬度定位：反查最近城市名（query-nearby-stores 必须带城市）
  if (!city && Number.isFinite(lat) && Number.isFinite(lng)) {
    city = nearestCity(lat, lng);
  }

  // 1) 附近门店
  const nearParams = { beType: 1, searchType: 2, latitude: lat, longitude: lng };
  if (city) { nearParams.city = city; nearParams.keyword = city; }
  const nearTxt = textOf(await cli.callTool('query-nearby-stores', nearParams));
  const near = extractJson(nearTxt);
  const stores = (near && near.data) || [];
  if (!stores.length) throw new Error('该坐标附近未找到麦当劳门店');

  // 2) 逐个试 query-meals，挑营业中且能返回菜单的门店
  let chosen = null;
  let mealsData = null;
  for (const st of stores) {
    const sc = st.storeCode;
    if (!sc) continue;
    try {
      const m = await cli.callTool('query-meals', { orderType: 1, storeCode: sc, beType: 1 });
      const txt = textOf(m);
      const obj = extractJson(txt);
      const d = obj.data || {};
      const meals = d.meals || {};
      const n = Array.isArray(meals) ? meals.length : Object.keys(meals).length;
      if (obj.success && n > 0) {
        chosen = st;
        mealsData = { d, meals };
        break;
      }
    } catch (_) { /* 跳过这家 */ }
  }
  if (!chosen) throw new Error('附近门店当前均未营业或无在售菜单（深夜/非营业时段）');

  // 3) 解析餐品
  const codeTags = {};
  for (const c of (mealsData.d.categories || [])) {
    for (const m of (c.meals || [])) codeTags[m.code] = m.tags || [];
  }
  const items = [];
  const mealsMap = mealsData.meals || {};
  for (const [code, detail] of Object.entries(mealsMap)) {
    if (!detail || typeof detail !== 'object') continue;
    let price = null;
    const pr = detail.currentPrice;
    if (pr !== null && pr !== undefined && pr !== '') {
      const f = parseFloat(String(pr).replace(',', ''));
      if (!Number.isNaN(f)) price = f;
    }
    const tags = Array.isArray(codeTags[code]) ? codeTags[code] : [];
    items.push({ code, name: detail.name, price, tags: tags.slice(), image: detail.image, discountType: detail.discountType });
  }

  // 4) 营养
  const nutTxt = textOf(await cli.callTool('list-nutrition-foods', {}));
  const nutJson = extractJson(nutTxt);
  const nutCsv = (nutJson && nutJson.data) || '';
  const nutrition = {};
  for (const ln of String(nutCsv).split('\n')) {
    const s = ln.trim();
    if (!s || s.startsWith('[')) continue;
    const parts = s.split(',').map((x) => x.trim());
    if (parts.length < 5) continue;
    const kcal = parseFloat(parts[3]);
    const prot = parseFloat(parts[4]);
    nutrition[parts[0]] = {
      energy: Number.isNaN(kcal) ? 0 : kcal,
      protein: Number.isNaN(prot) ? 0 : prot,
    };
  }
  const norm = (s) => (s || '').replace(/ /g, '').replace('（', '(').replace('）', ')');
  const nutNorm = {};
  for (const [k, v] of Object.entries(nutrition)) nutNorm[norm(k)] = v;
  function match(name) {
    const n = norm(name);
    if (nutNorm[n]) return nutNorm[n];
    for (const [kn, v] of Object.entries(nutNorm)) {
      if (n && (n.includes(kn) || kn.includes(n))) return v;
    }
    return null;
  }
  for (const it of items) {
    if (it.price == null) continue;
    const nv = match(it.name);
    it.energy = nv ? nv.energy : 0;
    it.protein = nv ? nv.protein : 0;
  }

  // 5) 派生标签
  for (const it of items) {
    const extra = derive(it.name, it.tags || []);
    const merged = (it.tags || []).slice();
    for (const t of extra) if (!merged.includes(t)) merged.push(t);
    it.tags = merged;
  }
  // 6) 过滤周边/蘸酱
  let filtered = items.filter((it) => !MERCH_KW.some((k) => (it.name || '').includes(k)));
  filtered = filtered.filter((it) => !SAUCE_KW.some((k) => (it.name || '').includes(k)));

  // 7) 优惠券（best-effort）
  let coupons = [];
  for (const cp of [{}, { storeCode: chosen.storeCode, orderType: 1, beType: 1 }]) {
    try {
      const cj = extractJson(textOf(await cli.callTool('query-store-coupons', cp)));
      const raw = (cj && cj.data) || [];
      if (Array.isArray(raw) && raw.length) {
        coupons = raw.filter((c) => c && typeof c === 'object').map((c) => ({
          id: c.couponId || c.id,
          desc: c.couponName || c.name || c.desc,
        }));
        break;
      }
    } catch (_) { /* ignore */ }
  }

  return {
    source: "McDonald's China MCP (query-nearby-stores + query-meals + list-nutrition-foods + query-store-coupons)",
    store: { code: chosen.storeCode, name: chosen.storeName },
    items: filtered,
    coupons,
  };
}

// ---------- HTTP 入口（CloudBase Node 函数） ----------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function parseEvent(event) {
  // CloudBase HTTP 函数 event 形态：{ httpMethod, queryString, body, headers }
  const method = (event && event.httpMethod) || 'GET';
  let params = {};
  if (event && event.queryString && typeof event.queryString === 'object') {
    params = Object.assign({}, event.queryString);
  }
  if ((method === 'POST') && event && event.body) {
    try {
      const b = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (b && typeof b === 'object') params = Object.assign(params, b);
    } catch (_) { /* ignore */ }
  }
  return { method, params };
}

exports.main = async (event, context) => {
  const { method, params } = parseEvent(event);
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  const token = process.env.MCD_MCP_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: '服务端未配置 MCD_MCP_TOKEN' }) };
  }
  const lat = parseFloat(params.lat);
  const lng = parseFloat(params.lng);
  const city = params.city ? String(params.city) : null;
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && !city) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: '需要 lat/lng 或 city 参数' }) };
  }
  try {
    const menu = await buildMenuForLocation(token, lat, lng, city);
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(menu) };
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};

// ---------- 本地自测：node index.js --lat 39.9 --lng 116.4 ----------
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (k) => {
      const i = args.indexOf(k);
      return i !== -1 ? args[i + 1] : null;
    };
    const lat = parseFloat(get('--lat'));
    const lng = parseFloat(get('--lng'));
    const city = get('--city');
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && !city) {
      console.error('用法: node index.js --lat 39.9 --lng 116.4 [--city 北京]');
      process.exit(1);
    }
    if (!process.env.MCD_MCP_TOKEN) {
      console.error('未设置 MCD_MCP_TOKEN');
      process.exit(1);
    }
    try {
      const menu = await buildMenuForLocation(process.env.MCD_MCP_TOKEN, lat, lng, city);
      console.log(JSON.stringify(menu, null, 2));
    } catch (e) {
      console.error('ERROR:', e.message);
      process.exit(1);
    }
  })();
}
