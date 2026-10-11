# 部署指南（方案 B：真·定位自适应 · CloudBase）

本目录是一个 CloudBase 项目：静态站点（根目录的 `index.html` 等）+ 一个 Node 云函数 `functions/mcd-proxy`，后者在**服务端**持有 `MCD_MCP_TOKEN`，按用户定位/城市实时拉取当地营业门店的真实菜单，返回给前端。前端永远拿不到 Token。

## 一、前置条件
- 已注册腾讯云账号，开通 **CloudBase（云开发）** 环境（免费版即可）。
- 已申请麦当劳中国 MCP Token：`https://open.mcd.cn/mcp`（登录 → 控制台 → 激活 → 复制 Token）。
- 本机安装 Node.js ≥ 18（用于本地验证；部署走 CloudBase CLI / 控制台）。

## 二、本地验证（可选，先确认逻辑通）
```bash
# 设置 Token（仅当前终端）
export MCD_MCP_TOKEN="你的Token"

# 北京坐标 → 应返回北京门店菜单
node functions/mcd-proxy/index.js --lat 39.9042 --lng 116.4074

# 兰州坐标 → 应返回兰州门店菜单
node functions/mcd-proxy/index.js --lat 36.0611 --lng 103.8339
```
两个坐标返回的 `store.name` / `store.code` 应当不同，说明已按地区匹配门店。

## 三、部署（需本人扫码登录一次）
部署走 CloudBase MCP / CLI，首次会弹出**设备码**，需要你用微信/腾讯云扫码授权（这是腾讯强制的账号绑定，AI 无法代扫）。

1. 安装并登录：
   ```bash
   npm i -g @cloudbase/cli
   tcb login            # 弹出设备码 → 浏览器 / 微信扫码
   ```
2. 把 `cloudbaserc.json` 里的 `{{CLOUDBASE_ENV_ID}}` 替换成你的真实环境 ID（控制台「环境」页可见）。
3. 一键部署（静态站点 + 云函数）：
   ```bash
   tcb framework deploy
   ```
4. 部署完成后，**务必设置环境变量**（不要写进仓库）：
   - 控制台 → 云函数 `mcd-proxy` → 配置 → 环境变量
   - 新增 `MCD_MCP_TOKEN` = 你的麦当劳 MCP Token
   - 保存后函数会自动重启生效

## 四、把前端接到实时后端
部署成功后，云函数会有一个 HTTP 访问地址（控制台「云函数 → mcd-proxy → 触发管理 / API 网关」可见，形如 `https://<envId>.apigw.tencentcs.com/release/mcd-proxy`）。

打开 `index.html`，把脚本区的占位填成该地址：
```html
<script>window.BACKEND_URL = "https://<envId>.apigw.tencentcs.com/release/mcd-proxy";</script>
```
保存、重新部署静态站点（`tcb framework deploy` 或控制台上传）。此时页面「📍 用我的位置」和「选择城市」即生效，按用户定位返回当地门店。

> 留空 `window.BACKEND_URL` 时，页面自动回退到 `real_menu.js` 静态快照（兰州门店），演示永远可用。

## 五、安全须知
- `MCD_MCP_TOKEN` **只存在于云函数环境变量**，绝不以明文写进任何文件 / 仓库 / 前端。
- 本仓库已确认不含 Token（临时脚本与配置均不落盘密钥）。
- 若 Token 疑似泄露，去 `open.mcd.cn/mcp` 控制台「重新生成」，旧 Token 立即作废。
- 麦当劳 MCP 限流：每 Token 每分钟 ≤ 600 次；本函数单次请求约 4 次工具调用，绰绰有余。

## 六、降级与容错
- 后端 401/429/定位附近无门店 → 返回明确错误 JSON，前端 `loadLive` 捕获后回退静态快照并提示。
- 深夜/非营业时段：当地门店可能暂无在售菜单，前端会提示并回退快照（符合真实数据特性）。
