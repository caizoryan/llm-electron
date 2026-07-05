
async function callZAPI(messages, onPart) {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth}`,
    },
    body: JSON.stringify({
      model: 'GLM-4.7',
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
        const delta = json.choices[0].delta
        if (delta) onPart(delta)
      } catch (e) {
        console.warn('Failed to parse SSE data:', data, e)
      }
    }
  }
}

import { auth, opencode } from './auth.js'
import { createTool, tools } from './tools.js'
import { EventTypes, createEvent } from './events.js'
import { callFunction } from './callFunction.js'

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

async function opencodeAPI(messages, onPart) {
  const res = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opencode}`,
    },
    body: JSON.stringify({
      model: 'kimi-k2.7-code',
      // model: 'mimo-v2.5',
			// model:'qwen3.7-plus',
      messages,
      // stream: true,
      stream: true,
			tool_stream:false,
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
        const delta = json.choices[0]?.delta
        if (delta) onPart(delta)
      } catch (e) {
        console.warn('Failed to parse SSE data:', data, e)
      }
    }
  }
}

const toolExecutor = async (toolCall) => {
  try {
    const result = await callFunction(toolCall);
    
    if (result.success) {
      return result.content;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Run a single turn of the agent loop
 * @param {Array} messages - Message history array
 * @param {Function} pipe - Callback function to send events to UI
 * @param {Function} toolExecutor - Async function that executes a tool call and returns result
 */
export async function runAgentTurn(messages, pipe) {
  let respondedContent = ''
  let reasoningContent = ''
  let toolCalls = []
  const toolCallAssembler = createToolCallAssembler()

  try {
    pipe(createEvent(EventTypes.RESPONSE_START, { model: 'GLM-4.7' }))

    // Stream response from API
    // await callZAPI(messages, (delta) => {
    await opencodeAPI(messages, (delta) => {
      // Content streaming
      console.log(delta)

      // Handle reasoning content (thinking)
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content
        pipe(createEvent(EventTypes.REASONING_DELTA, { delta: delta.reasoning_content }))
      }

      // Handle regular content
      if (delta.content) {
        respondedContent += delta.content
        pipe(createEvent(EventTypes.TEXT_DELTA, { delta: delta.content }))
      }

      // Tool calls - assume they come complete
      // if (delta.tool_calls) {
      //   toolCalls.push(...delta.tool_calls)
      // }
			if (delta.tool_calls) {
        toolCallAssembler.add(delta.tool_calls)
				// TODO: pipe in future 
      }
    })

    // Add assistant message to history
    if (respondedContent || reasoningContent) {
      // Add assistant message with tool calls to message history
      messages.push({
        role: 'assistant',
        content: respondedContent,
        reasoning_content: reasoningContent,
      })
    }

		const toolCalls = toolCallAssembler.finalize()

    if (toolCalls.length > 0) {
      toolCalls.forEach(tool_call => {
        pipe(createEvent(EventTypes.TOOL_CALL, { tool_call }))
      })

      for (const toolCall of toolCalls) {
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [toolCall]
        })

        try {
          const result = await toolExecutor(toolCall)
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
          pipe(createEvent(EventTypes.TOOL_RESULT, { tool_call_id: toolCall.id, role: 'tool', content: result }))
        } catch (error) {
          const errorResult = { success: false, error: error.message }
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(errorResult) })
          pipe(createEvent(EventTypes.TOOL_RESULT, { tool_call_id: toolCall.id, role: 'tool', content: errorResult }))
        }
      }

      await runAgentTurn(messages, pipe, toolExecutor)
      return
		}

    pipe(createEvent(EventTypes.RESPONSE_END, {
			// TODO: Add tokens and shit here
			//
      // message: { role: 'assistant', content: respondedContent, reasoning_content: reasoningContent },
      // finish_reason: hasToolCalls ? 'tool_calls' : 'stop'
    }))

  } catch (error) {
    console.error('Agent error:', error)
    pipe(createEvent(EventTypes.ERROR, { message: error.message }))
  }
}

/**
 * Start a new agent loop with a user prompt
 * @param {string} prompt - User's input message
 * @param {Array} messages - Message history array (will be modified)
 * @param {Function} pipe - Callback function to send events to UI
 * @param {Function} toolExecutor - Async function that executes tool calls
 */
export async function startAgentLoop(prompt, messages, pipe, toolExecutor) {
  // Add user message to history
  messages.push({
    role: 'user',
    content: prompt
  })

	console.log('messages', messages)

  // Notify UI of user message
  pipe(createEvent(EventTypes.USER_MESSAGE, {
    content: prompt
  }))


  // Run the agent turn
  await runAgentTurn(messages, pipe, toolExecutor)
}
