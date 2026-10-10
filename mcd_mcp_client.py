#!/usr/bin/env python3
"""麦当劳中国 MCP —— 极简 Streamable HTTP 客户端。

仅依赖 Python 标准库（urllib / json），用于「校园省钱凑单助手」直连 mcp.mcd.cn。
WorkBuddy 接入场景下，MCP 调用由 WorkBuddy 连接器完成，本文件作为可独立运行的参考实现。

协议要点（来自官方 mcd-mcp-server 接入指南）：
- 传输：Streamable HTTP
- 鉴权：请求头 Authorization: Bearer <MCD_MCP_TOKEN>
- 接入地址：https://mcp.mcd.cn
- 限流：每 Token 每分钟 600 次（超了返回 429）
"""
import json
import os
import urllib.request
import urllib.error

MCD_MCP_URL = "https://mcp.mcd.cn"


class McdMcpError(RuntimeError):
    pass


class McdMcpClient:
    def __init__(self, token=None, url=MCD_MCP_URL):
        self.token = token or os.environ.get("MCD_MCP_TOKEN")
        self.url = url
        self.session_id = None
        self._id = 0

    # ---- 底层 JSON-RPC over Streamable HTTP ----
    def _next_id(self):
        self._id += 1
        return self._id

    def _request(self, method, params, is_notification=False):
        payload = {"jsonrpc": "2.0", "method": method}
        if not is_notification:
            payload["id"] = self._next_id()
        if params is not None:
            payload["params"] = params
        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(self.url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        if self.session_id:
            req.add_header("Mcp-Session-Id", self.session_id)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self.session_id = sid
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise McdMcpError("401：MCP Token 无效/过期/未提供，请检查 MCD_MCP_TOKEN") from e
            if e.code == 429:
                raise McdMcpError("429：触发限流（>600 次/分钟），请降低请求频率") from e
            raise McdMcpError(f"HTTP {e.code}: {e.reason}") from e

        if is_notification:
            return None
        return self._parse_body(body)

    @staticmethod
    def _parse_body(body):
        body = (body or "").strip()
        if not body:
            return None
        if body.startswith("{"):
            return json.loads(body)
        # text/event-stream：取最后一个 data: 行
        result = None
        for line in body.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                chunk = line[5:].strip()
                if chunk:
                    result = json.loads(chunk)
        return result

    # ---- MCP 生命周期 ----
    def initialize(self):
        resp = self._request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "campus-combo-finder", "version": "1.0.0"},
            },
        )
        # 发送 initialized 通知（无需响应）
        self._request("notifications/initialized", {}, is_notification=True)
        return resp

    def list_tools(self):
        return self._request("tools/list", {})

    def call_tool(self, name, arguments=None):
        return self._request("tools/call", {"name": name, "arguments": arguments or {}})


def _text_of(result):
    """从 tools/call 返回里抽取文本内容。"""
    if not result:
        return ""
    if isinstance(result, dict):
        inner = result.get("result") or result
        content = inner.get("content") if isinstance(inner, dict) else None
        if isinstance(content, list):
            return "\n".join(
                c.get("text", "") for c in content if isinstance(c, dict) and c.get("text")
            )
    return ""


if __name__ == "__main__":
    # 自检：列出可用工具（需要有效 MCD_MCP_TOKEN）
    if not os.environ.get("MCD_MCP_TOKEN"):
        print("未设置 MCD_MCP_TOKEN，跳过在线自检。")
        raise SystemExit(0)
    cli = McdMcpClient()
    cli.initialize()
    tools = cli.list_tools()
    names = [t.get("name") for t in (tools.get("result", {}).get("tools", []) or [])]
    print("可用工具：")
    for n in names:
        print(" -", n)
