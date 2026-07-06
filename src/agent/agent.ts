import { opencode } from './auth.js'
import { createTool, tools } from './tools.js'
import { EventTypes, createEvent } from './events.js'
import { toolExecutor } from './callFunction.js'
import {
  createTextContent,
  createThinkingContent,
  createToolCall,
  createAssistantMessage,
  createToolResultMessage,
} from './sessionFormat.js'
import type { Message } from '../sessionTypes.js'

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
      if (toolCalls.length > 0) msg.tool_calls = toolCalls;
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
  const calls = []; // sparse array, indexed by delta.tool_calls[].index

  return {
    /** Feed one delta.tool_calls array into the assembler */
    add(toolCallDeltas) {
      for (const tc of toolCallDeltas) {
        const i = tc.index ?? 0;

        if (!calls[i]) {
          calls[i] = {
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
        }

        if (tc.id) calls[i].id = tc.id;
        if (tc.type) calls[i].type = tc.type;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    },

    /** Get the fully assembled tool calls once the stream ends */
    finalize() {
      return calls.filter(Boolean); // drop holes from a sparse array
    },

    hasCalls() {
      return calls.length > 0;
    },
  };
}

async function opencodeAPI(messages, model: string, onPart: (data: any) => void) {
  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opencode}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      tools: tools.map(createTool),
    }),
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
 * @param {Array} sessionMessages - Message history in session format
 * @param {Function} pipe - Callback function to send events to UI
 * @param {string} model - Model id
 */
export async function runAgentTurn(sessionMessages, pipe, model) {
  let textContent = '';
  let thinkingContent = '';
  let finishReason = null;
  let usage = null;
  const toolCallAssembler = createToolCallAssembler();

  try {
    pipe(createEvent(EventTypes.RESPONSE_START, { model }))

    const apiMessages = toOpenAIMessages(sessionMessages);
		console.log(apiMessages)

    // Stream response from API
    await opencodeAPI(apiMessages, model, (json) => {
      if (json.finish_reason) { finishReason = json.finish_reason }
      if (json.usage) { usage = json.usage; console.log(usage) }

      const delta = json.choices?.[0]?.delta
      if (!delta) return

      // Handle reasoning content (thinking)
      if (delta.reasoning_content) {
        thinkingContent += delta.reasoning_content
        pipe(createEvent(EventTypes.REASONING_DELTA, { delta: delta.reasoning_content }))
      }

      // Handle regular content
      if (delta.content) {
        textContent += delta.content
        pipe(createEvent(EventTypes.TEXT_DELTA, { delta: delta.content }))
      }

      if (delta.tool_calls) {
        toolCallAssembler.add(delta.tool_calls)
      }
    })

    // Build content array for the assistant message
    const content = [];
    if (textContent) content.push(createTextContent(textContent));
    if (thinkingContent) content.push(createThinkingContent(thinkingContent));

    const mappedUsage = mapApiUsage(usage);
		let appendedUsage = false

    // Push assistant text/thinking message if non-empty, or if we have usage to record
    if (content.length > 0) {
			appendedUsage = true
      sessionMessages.push(createAssistantMessage({ content, model, stopReason: finishReason, usage: mappedUsage,  }));
    }

    const toolCalls = toolCallAssembler.finalize()

    if (toolCalls.length > 0) {
      toolCalls.forEach(toolCall => {
        pipe(createEvent(EventTypes.TOOL_CALL, { tool_call: toolCall }))
      })

      for (const apiToolCall of toolCalls) {
        const sessionToolCall = createToolCall(
          apiToolCall.id,
          apiToolCall.function.name,
          JSON.parse(apiToolCall.function.arguments),
        );

				// TODO: shady af, fix later
				let usageintool = appendedUsage 
					? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } 
					: mappedUsage

				if (!appendedUsage) appendedUsage = true

        sessionMessages.push(createAssistantMessage({
          content: [sessionToolCall],
          model,
          usage: usageintool,
          stopReason: 'toolUse',
        }));

        try {
          const result = await toolExecutor(sessionToolCall);
          sessionMessages.push(createToolResultMessage(
            sessionToolCall.id,
            sessionToolCall.name,
            result,
            false,
          ));

          pipe(createEvent(EventTypes.TOOL_RESULT, {
            tool_call_id: sessionToolCall.id,
            toolName: sessionToolCall.name,
            role: 'tool',
            content: result,
          }));
        } catch (error) {
          sessionMessages.push(createToolResultMessage(
            sessionToolCall.id,
            sessionToolCall.name,
            error.message,
            true,
          ));
          pipe(createEvent(EventTypes.TOOL_RESULT, {
            tool_call_id: sessionToolCall.id,
            toolName: sessionToolCall.name,
            role: 'tool',
            content: error.message,
            isError: true,
          }));
        }
      }

      await runAgentTurn(sessionMessages, pipe, model)
      return
		}

    pipe(createEvent(EventTypes.RESPONSE_END, {
      finishReason,
      message: { role: 'assistant', content: textContent, reasoning_content: thinkingContent },
    }))

  } catch (error) {
    console.error('Agent error:', error)
    pipe(createEvent(EventTypes.ERROR, { message: error.message }))
  }
}

export async function startAgentLoop(sessionMessages, pipe, model) {
  console.log('sessionMessages', sessionMessages)
  await runAgentTurn(sessionMessages, pipe, model)
}
