/**
 * 基于 fetch + ReadableStream 实现的 SSE 客户端
 *
 * 相比原生 EventSource：
 * - 支持 POST / 自定义 Header（如 Authorization）
 * - 支持 AbortController 主动中断流（EventSource 只能 close 不能带原因）
 * - 按 SSE 规范手动解析 event / data / id 字段与心跳注释
 */

export interface SSEEvent {
  /** event 字段名，缺省为 "message" */
  event: string;
  /** 多条 data: 行合并后的内容（以 \n 连接） */
  data: string;
  /** id 字段 */
  id: string;
}

export interface FetchSSEOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** 传对象时自动 JSON.stringify（仅 POST 有意义） */
  body?: unknown;
  signal?: AbortSignal;
  /** 每解析出一个完整 SSE 事件回调一次 */
  onEvent?: (ev: SSEEvent) => void;
  /** 响应头到达、开始解析流之前回调（可检查 res.status） */
  onOpen?: (res: Response) => void;
}

/**
 * 增量解析器：把任意文本片段流喂进来，正确处理
 * 事件块 / 行被 chunk 边界切开的情形
 */
class SSEDecoder {
  private buffer = "";

  /** 喂入一段解码后的文本，返回其中已完整结束的事件 */
  push(text: string): SSEEvent[] {
    // 统一换行符：兼容 \r\n 与 \r
    this.buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const events: SSEEvent[] = [];
    let idx: number;
    // SSE 规范：空行（两个连续换行）标志一个事件结束
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const ev = this.parseEventBlock(rawEvent);
      if (ev) events.push(ev);
    }
    return events;
  }

  private parseEventBlock(block: string): SSEEvent | null {
    let event = "message";
    let id = "";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      // 空行 / 以冒号开头的注释行（心跳）直接跳过
      if (!line || line.startsWith(":")) continue;

      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      // 规范：冒号后紧跟的一个空格属于值的一部分，需要去掉
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
      else if (field === "id") id = value;
      // retry 等其他字段 demo 场景忽略
    }

    // 只有 event 没有 data 的块不算有效消息；纯注释块也在此被过滤
    if (!dataLines.length && event === "message") return null;
    return { event, id, data: dataLines.join("\n") };
  }
}

/**
 * 发起 SSE 请求，流结束时 resolve，出错/中断时 reject（AbortError）
 */
export async function fetchSSE(
  url: string,
  options: FetchSSEOptions = {},
): Promise<void> {
  const { method = "GET", headers, body, signal, onOpen, onEvent } = options;

  const res = await fetch(url, {
    method,
    signal,
    headers: { Accept: "text/event-stream", ...headers },
    body:
      body === undefined || body === null
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`SSE 请求失败：HTTP ${res.status}`);
  if (!res.body) throw new Error("当前环境不支持 ReadableStream");
  onOpen?.(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const sse = new SSEDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // stream: true 避免多字节字符（如中文）被 chunk 边界切开导致乱码
    for (const ev of sse.push(decoder.decode(value, { stream: true }))) {
      onEvent?.(ev);
    }
  }

  // 冲刷残留：服务端偶有不以空行结尾的最后一个事件
  const tail = decoder.decode();
  const rest = sse.push(tail ? `${tail}\n\n` : "\n\n");
  for (const ev of rest) onEvent?.(ev);
}
