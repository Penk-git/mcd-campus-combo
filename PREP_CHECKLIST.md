# 参赛准备清单（麦当劳程序员创意开发大赛）

**关键时间（北京时间）**
- 报名 + 排名：2026-10-09 10:30 — **2026-10-25 23:59**
- 定榜（采集 Star 快照）：2026-10-26 00:00
- 奖品兑换 + 信息提交截止：2026-11-14
- 今天 10-09 刚开赛，满打满算约 16 天窗口

---

## 第一步：注册 GitHub 账号（硬门槛，必须先做）
1. 打开 https://github.com/signup
2. 填邮箱（建议用常用邮箱；获奖通知可能直接读你 GitHub 公开邮箱）→ 设密码 → 取用户名
3. 收确认邮件、点链接验证邮箱
4. 建议：Settings → Public profile 把 Email 设为公开，省去后续 OAuth 授权麻烦（麦当劳靠它发获奖通知）
5. 本机验证 Git：`git --version`（WorkBuddy 环境自带 Git Bash）

## 第二步：申请麦当劳 MCP Token
1. 打开 https://open.mcd.cn/mcp ，点右上角【登录】
2. 手机号验证登录 → 右上角「登录」变「控制台」
3. 控制台 →【激活】→ 申请 MCP Token → 阅读并同意服务协议
4. 一键复制 Token（**保管好，绝不写进任何仓库文件**）

## 第三步：在 WorkBuddy 接入麦当劳 MCP（拿专项奖必做，否则可选）
1. 左侧【专家·技能·连接器】→【连接器】→ 右上【自定义连接器】→【配置 MCP】
2. 手动配置填入（把 `${MCD_MCP_TOKEN}` 换成你的真实 Token，保存后启用）：
   ```json
   {
     "mcpServers": {
       "mcd-mcp": {
         "type": "streamablehttp",
         "url": "https://mcp.mcd.cn",
         "headers": { "Authorization": "Bearer 你的Token" }
       }
     }
   }
   ```
3. 参考文档：https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector

## 第四步：本地开发 + 推到 GitHub
1. 在本文件夹填好 `README.md` / `MCP_INTEGRATION.md` / 源代码
2. 本地 `git init` 提交（**注意**：`CONTEST_DECLARATION.md` 内容不可改；配置文件只用环境变量占位符，绝不提交真实 Token）
3. GitHub 新建 **Public** 仓库 → 推送
   - ⚠️ 仓库创建时间须在 **2025-12-25 00:00 ~ 2026-10-25 23:59**

## 第五步：用 Issue 报名
在 https://github.com/M-China/mcd-developer-innovation-challenge/issues 发 Issue：
```
【参赛申请】
项目名称：{项目名称}
项目地址：{你的 Public 仓库地址}
项目简介：{简介，≤1000 字、不带图片}
```
报名成功系统会在 Issue 下自动回复。

## 第六步：拉 Star（决定排名）
- 定榜以 **10-26 00:00 累计公开 Star** 为准，**活动前已得的 Star 也计入**
- 前 100 名进榜；Star = 0 不进；并列同分都进（可能 >100）
- 同一账号多个项目：**只取最高 Star 那个**进榜

---

## 你当前还缺的（来自你的档案）
- ❌ **GitHub 账号**：档案记着「没有 GitHub / Gitee（待补）」→ 第一步先注册，这是唯一真卡点
- ⚠️ 麦当劳 MCP Token、麦当劳会员 + 大陆手机号：按上面第二步 / 奖品发放要求准备
