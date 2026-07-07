import { opencode } from './auth.js'
import { createTool, tools } from './tools.js'
import { EventTypes, createEvent } from './events.js'
import { toolExecutor } from './callFunction.js'
import {
  createTextContent,
  createThinkingContent,
  createAssistantMessage,
  createToolResultMessage,
	mergeContent,
} from './sessionFormat.js'

import type { ContentPart, Message, ToolCall } from '../sessionTypes.js'

// ---------------------------------------------------------------------------
// Session-format → OpenAI API format conversion
// ---------------------------------------------------------------------------
function toOpenAIMessages(sessionMessages: Message[]) {
  return sessionMessages.map((m) => {
    if (m.role === "system" || m.role === "user") {
      return {
        role: m.role,
        content: m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
      };
    }

    if (m.role === "assistant") {
      const text = m.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const reasoning = m.content
        .filter((c) => c.type === "thinking")
        .map((c) => c.thinking)
        .join("");
      const toolCalls = m.content
        .filter((c) => c.type === "toolCall")
        .map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        }));

      const msg = { role: "assistant", content: text };
      if (reasoning) msg.reasoning_content = reasoning;
      if (toolCalls.length > 0){
				msg.content == '' ? msg.content = null : null
				msg.tool_calls = toolCalls;
			}
      return msg;
    }

    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
      };
    }
  });
}

// ---------------------------------------------------------------------------
// API helpers (unchanged)
// ---------------------------------------------------------------------------

function createToolCallAssembler() {
  const calls: ToolCall[] = []

  return {
    add(toolCallDeltas) {
      for (const tc of toolCallDeltas) {
        const i = tc.index ?? 0

        if (!calls[i]) {
          calls[i] = { type: 'toolCall', id: '', name: '', arguments: '' }
        }

        if (tc.id) calls[i].id = tc.id
        if (tc.function?.name) calls[i].name += tc.function.name
        if (tc.function?.arguments) calls[i].arguments += tc.function.arguments
      }
    },

    finalize() {
      return calls.filter(Boolean)
    },

    hasCalls() {
      return calls.length > 0
    },
  }
}

async function opencodeAPI(messages, model: string, thinkingMode: string, onPart: (data: any) => void) {
  const body: any = {
    model,
    messages,
    stream: true,
    tools: tools.map(createTool),
  }

	// body.reasoning = { effort: thinkingMode }
	 body.reasoning_effort = thinkingMode 
	// console.log(body.reasoning)
	// console.log(body.reasoning_effort)

  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opencode}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error: ${res.status} - ${errorText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return

      try {
        const json = JSON.parse(data)
        if (json) onPart(json)
      } catch (e) {
        console.warn('Failed to parse SSE data:', data, e)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Usage mapping
// ---------------------------------------------------------------------------

function mapApiUsage(apiUsage) {
  if (!apiUsage) return undefined;

  return {
    input: apiUsage.prompt_tokens ?? 0,
    output: apiUsage.completion_tokens ?? 0,
    cacheRead: apiUsage.prompt_cache_hit_tokens ?? apiUsage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWrite: 0,
    reasoning: apiUsage.completion_tokens_details?.reasoning_tokens,
    totalTokens: apiUsage.total_tokens ?? 0,
  };
}


// ---------------------------------------------------------------------------
// Agent turn
// ---------------------------------------------------------------------------

/**
 * Run a single turn of the agent loop
 * @param {SessionManager} sessionManager - Session manager owning the message history
 * @param {Function} pipe - Callback function to send events to UI
 * @param {string} model - Model id
 */
export async function runAgentTurn(sessionManager, pipe, model, thinkingMode = 'low') {
  const sessionMessages = sessionManager.getMessages();
  let finishReason = null;
  let usage = null;
  const assistantContent: ContentPart[] = []
  const toolCallAssembler = createToolCallAssembler();

  try {
    pipe(createEvent(EventTypes.RESPONSE_START, { model }))

    const apiMessages = toOpenAIMessages(sessionMessages);
		console.log(apiMessages)

    // Stream response from API
    await opencodeAPI(apiMessages, model, thinkingMode, (json) => {
      if (json.finish_reason) { finishReason = json.finish_reason }
      if (json.usage) { usage = json.usage; console.log(usage) }

      const delta = json.choices?.[0]?.delta
      if (!delta) return

      // Handle reasoning content (thinking)
      if (delta.reasoning_content) {
        const part = createThinkingContent(delta.reasoning_content)
        assistantContent.push(part)
        pipe(createEvent(EventTypes.REASONING_DELTA, { part }))
      }

      // Handle regular content
      if (delta.content) {
        const part = createTextContent(delta.content)
        assistantContent.push(part)
        pipe(createEvent(EventTypes.TEXT_DELTA, { part }))
      }

      if (delta.tool_calls) {
        toolCallAssembler.add(delta.tool_calls)
      }
    })

    const mappedUsage = mapApiUsage(usage);
		let appendedUsage = false

    const toolCalls = toolCallAssembler.finalize()

    if (toolCalls.length > 0) {
      toolCalls.forEach((toolCall) => {
        pipe(createEvent(EventTypes.TOOL_CALL, { part: toolCall }))
      })

      for (const sessionToolCall of toolCalls) {
				// TODO: shady af, fix later
				let usageintool = appendedUsage 
					? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } 
					: mappedUsage

				if (!appendedUsage) appendedUsage = true

        sessionManager.appendMessage(createAssistantMessage({
          content: [sessionToolCall],
          model,
          usage: usageintool,
          stopReason: 'toolUse',
        }));

        try {
          const result = await toolExecutor(sessionToolCall);
          const toolResultMsg = createToolResultMessage(
            sessionToolCall.id,
            sessionToolCall.name,
            result,
            false,
          );
          sessionManager.appendMessage(toolResultMsg)
          pipe(createEvent(EventTypes.TOOL_RESULT, { message: toolResultMsg }));
        } catch (error) {
          const toolResultMsg = createToolResultMessage(
            sessionToolCall.id,
            sessionToolCall.name,
            error.message,
            true,
          );
          sessionManager.appendMessage(toolResultMsg)
          pipe(createEvent(EventTypes.TOOL_RESULT, { message: toolResultMsg }));
        }
      }

      await runAgentTurn(sessionManager, pipe, model, thinkingMode)
      return
		}

    const assistantMsg = createAssistantMessage({
      content: mergeContent(assistantContent),
      model,
      stopReason: finishReason,
      usage: mappedUsage,
    })

    sessionManager.appendMessage(assistantMsg)
    pipe(createEvent(EventTypes.RESPONSE_END, { message: assistantMsg }))

  } catch (error) {
    console.error('Agent error:', error)
    pipe(createEvent(EventTypes.ERROR, { message: error.message }))
  }
}

export async function startAgentLoop(sessionManager, pipe, model, thinkingMode) {
  console.log('sessionMessages', sessionManager.getMessages())
  await runAgentTurn(sessionManager, pipe, model, thinkingMode)
}
