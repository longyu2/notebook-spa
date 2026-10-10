/**
 * DeepSeek SSE 流解析。
 *
 * 抽成独立模块的原因：这段逻辑有两个容易写错的地方，而写错了很难发现 ——
 *   1. 跨 chunk 断行：一个 data: 行可能被 TCP 切成两半，直接 split('\n') 再
 *      JSON.parse 会把半行丢掉。而丢掉的正好可能是 tool_calls 的 arguments
 *      片段（它是逐字符下发的），结果就是 JSON 拼不全、动作执行不了。
 *   2. tool_calls 是增量下发的：要按 index 累积，不能当完整对象读。
 * 单独放出来才能拿真实的流去做测试。
 */

/** 累积中的工具调用 */
export interface ToolCallAcc {
  id: string
  name: string
  /** 模型逐字符吐出的 JSON 片段，需拼起来再 parse */
  args: string
}

export interface SSEHandlers {
  /** 正文增量 */
  onText?: (t: string) => void
  /**
   * 思考过程增量。
   *
   * thinking 模式下模型会先把 reasoning_content 逐块吐完，再开始吐 content。
   * 这里把**文本**交出去（而不是只报一个「开始思考了」的信号），
   * 面板才能把思考过程实时显示出来。
   */
  onReasoning?: (t: string) => void
}

/**
 * 解析一段 SSE 文本。
 *
 * @param chunk 本次从流里读到的原始文本
 * @param buf   跨 chunk 的缓冲区，调用方需在多次调用间复用同一个对象
 * @param toolAcc 工具调用累积器，同样需跨调用复用
 */
export function parseSSEChunk(
  chunk: string,
  buf: { v: string },
  handlers: SSEHandlers,
  toolAcc: Map<number, ToolCallAcc>
): void {
  buf.v += chunk
  const lines = buf.v.split('\n')
  // 最后一段可能是不完整的行，留到下一次再拼
  buf.v = lines.pop() || ''

  for (const line of lines) {
    const t = line.trim()
    if (!t.startsWith('data:')) continue
    const payload = t.slice(5).trim()
    if (!payload || payload === '[DONE]') continue

    let json: any
    try {
      json = JSON.parse(payload)
    } catch {
      // 到这里还解析失败说明是真·坏数据，跳过
      continue
    }

    const delta = json.choices?.[0]?.delta
    if (!delta) continue

    if (delta.reasoning_content) handlers.onReasoning?.(delta.reasoning_content)
    if (delta.content) handlers.onText?.(delta.content)

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = typeof tc.index === 'number' ? tc.index : 0
        const cur = toolAcc.get(i) || { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        toolAcc.set(i, cur)
      }
    }
  }
}

/** 流结束后把缓冲区里最后那行冲掉（SSE 最后一条不一定以换行结尾） */
export function flushSSE(
  buf: { v: string },
  handlers: SSEHandlers,
  toolAcc: Map<number, ToolCallAcc>
): void {
  if (buf.v.trim()) parseSSEChunk('\n', buf, handlers, toolAcc)
}
