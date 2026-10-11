# 部署指南 · 麦当劳校园省钱凑单（方案 B：真·定位自适应）

> 本文件为 2026-10-11 实测跑通后的**修正版**（早前版本的 URL 缺 APPID 后缀、且误称「HTTP 路由只能用控制台建」）。

## 环境
- 环境 ID：`cloud1-d3g3n612g3037e59b`（ap-shanghai，个人版，到期 2026-11-15）
- 静态站点：`https://cloud1-d3g3n612g3037e59b-1398369080.tcloudbaseapp.com/`
- **函数 HTTP 访问**：`https://cloud1-d3g3n612g3037e59b-1398369080.ap-shanghai.app.tcloudbase.com/mcd-proxy`
  - ⚠️ 默认域名**必须带 `-1398369080`（APPID）**，漏掉就打不中。

## 架构
- 前端：`index.html` / `demo.js` / `combo.js` / `real_menu.js`（静态快照）+ `real_menu.json`。
- 后端：云函数 `functions/mcd-proxy`（Node **事件函数** `exports.main`），**服务端**持有 `MCD_MCP_TOKEN`，按经纬度/城市实时拉取当地营业门店菜单+营养+券。Token 永不进前端/静态桶。

## 部署步骤（传统 CLI）
> ⚠️ 不能用 `tcb framework deploy`：CloudBase framework 在**中文用户名 Windows** 上因 webpack 路径 bug（require.context 固化 registry 路径），插件解析报 `Cannot find module`，无解。改用下面传统命令。

0. 前置（本机直连公网；沙箱网关拦截腾讯云 STS/鉴权域名，无法替你扫码）：
   ```bash
   npm i -g @cloudbase/cli
   tcb login          # 设备码 → 浏览器/微信扫码
   tcb env:list       # 确认环境 ID
   ```
1. 函数（事件函数，应用 cloudbaserc.json 的 `functions[].envVariables`）：
   ```bash
   tcb fn deploy mcd-proxy -e cloud1-d3g3n612g3037e59b
   ```
   - **Token**：先在 `cloudbaserc.json` → `functions[].envVariables.MCD_MCP_TOKEN` 填真实 Token，部署后**立即清空**（仓库不含 Token）。`envVariables` 为空时再部署会**把线上 Token 清掉**，务必先填回。
   - **只想改代码、不动 Token/timeout** 时用（推荐日常迭代）：
     ```bash
     tcb fn code update mcd-proxy --dir functions/mcd-proxy -e cloud1-d3g3n612g3037e59b
     ```
     ⚠️ **必须带 `--dir`**：不带的版本会报 `Function code updated successfully!` 但线上代码根本没变（`tcb fn detail` 的 Code size 不变、直调仍走旧逻辑）。
   - 核对是否真的生效：`tcb fn detail mcd-proxy -e <envId>` 看 **Code size** 与 **Environment variables**。
2. 静态（干净的 `public/` 目录，避开项目根 `.git/objects` 权限错误）：
   ```bash
   cp index.html demo.js combo.js real_menu.js real_menu.json style-light.html style-journal.html public/
   cd public && tcb hosting deploy . -e cloud1-d3g3n612g3037e59b
   ```
   - 不要直接 `tcb hosting deploy .` 项目根：遍历 `.git/objects` 会撞 Windows 文件权限错误。
3. **创建 HTTP 访问路由（CLI 即可，不必进控制台）**：
   ```bash
   # 查
   tcb routes list -e cloud1-d3g3n612g3037e59b
   # 建
   tcb routes add -e cloud1-d3g3n612g3037e59b --data '{"domain":"cloud1-d3g3n612g3037e59b-1398369080.ap-shanghai.app.tcloudbase.com","routes":[{"path":"/mcd-proxy","upstreamResourceType":"SCF","upstreamResourceName":"mcd-proxy","enableAuth":false}]}'
   ```
   - ⚠️ **必须 `enableAuth:false`**：默认是 `true`，前端匿名 `fetch` 会吃 **401 `MISSING_CREDENTIALS`**（`server: tcbgw`）。已建好的可改：
     ```bash
     printf 'y\n' | tcb routes edit -e cloud1-d3g3n612g3037e59b --data '{"domain":"cloud1-d3g3n612g3037e59b-1398369080.ap-shanghai.app.tcloudbase.com","routes":[{"path":"/mcd-proxy","enableAuth":false}]}'
     ```
   - ⚠️ `routes add/edit` 会**交互式询问确认**，非交互环境要 `printf 'y\n' |`，否则静默中止（输出看着像失败）。
   - ⚠️ 控制台列表可能显示「创建失败」但服务端其实已 Enable —— **以 `tcb routes list` 为准**。
4. 核对 `index.html` 的 `window.BACKEND_URL` = 上面的函数 HTTP 地址（含 `-1398369080`），如有改动回到第 2 步重部署。

## 端到端验证（2026-10-11 实测通过）
```bash
U="https://cloud1-d3g3n612g3037e59b-1398369080.ap-shanghai.app.tcloudbase.com/mcd-proxy"
curl -sS "$U"                                   # → {"error":"需要 lat/lng 或 city 参数"}
curl -sS "$U?city=兰州"                          # → 麦当劳兰州西客站餐厅(5170022)，114 餐品
curl -sS "$U?lat=39.9042&lng=116.4074"          # → 麦当劳北京西客站南候车室餐厅(1950139)，60 餐品
curl -si -X OPTIONS -H "Origin: https://cloud1-d3g3n612g3037e59b-1398369080.tcloudbaseapp.com" "$U"   # → 204 + ACAO *
```

## 安全
- Token 仅在云函数环境变量；前端/静态桶无 Token。
- 静态桶经 `public/` 隔离 + `.gitignore`，已实测 `/cloudbaserc.json`、`/functions/...` 均 404。
- 调试探针 `?__debug=1` 会回显 event 结构，但 `headers` 里的 `x-cloudbase-context`（内含服务端凭据）已脱敏为 `<redacted>`。

## 本地自测
```bash
MCD_MCP_TOKEN=xxx node functions/mcd-proxy/index.js --lat 36.0611 --lng 103.8339   # 兰州
MCD_MCP_TOKEN=xxx node functions/mcd-proxy/index.js --lat 39.9042 --lng 116.4074    # 北京
```
两个坐标返回的 `store.name` / `store.code` 应当不同，说明已按地区匹配门店。

## 已知坑（避免重踩）
- 中文用户名 Windows：`tcb framework deploy` 必败（webpack 路径 bug）。
- 沙箱部署限制：腾讯云 STS/鉴权域名被网关拦截，`tcb login` 需本机直连公网。
- 默认域名带 APPID 后缀 `-1398369080`，漏写就打不中函数。
- HTTP 访问路由 **`enableAuth` 默认 true** → 401；要显式关掉。
- `tcb fn code update` 不带 `--dir` 会**假装成功但没更新**。
- `tcb fn deploy` 会按 `cloudbaserc.json` 重设环境变量 → `envVariables` 为空会清掉线上 Token。
- `tcb hosting deploy .` 项目根撞 `.git/objects` 权限；用 `public/` 干净目录。
- `--httpFn` 会把函数建成 Web 函数（需 scf_bootstrap + 常驻 HTTP server），与现有事件函数代码不匹配；用传统事件函数 + HTTP 访问路由。
- CloudBase HTTP 访问服务转发给 SCF 的 event 为 **API 网关 v1 风格**：query 参数在 `queryStringParameters`（不是 `queryString`），方法在 `httpMethod`。
