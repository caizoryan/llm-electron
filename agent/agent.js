import { auth } from './auth.js'
import { createTool, tools } from './tools.js'
import { EventTypes, createEvent } from './events.js'
import { callFunction } from './callFunction.js'

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

  try {
    pipe(createEvent(EventTypes.RESPONSE_START, { model: 'GLM-4.7' }))

    // Stream response from API
    await callZAPI(messages, (delta) => {
      // Content streaming
      console.log(delta)

      // Handle reasoning content (thinking)
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content
        pipe(createEvent(EventTypes.THINKING_DELTA, { delta: delta.reasoning_content }))
      }

      // Handle regular content
      if (delta.content) {
        respondedContent += delta.content
        pipe(createEvent(EventTypes.TEXT_DELTA, { delta: delta.content }))
      }

      // Tool calls - assume they come complete
      if (delta.tool_calls) {
        toolCalls.push(...delta.tool_calls)
      }
    })

    // Handle tool calls if present
    if (toolCalls.length > 0) {
      toolCalls.forEach(toolCall => {
        pipe(createEvent(EventTypes.TOOL_CALL, { tool_call: toolCall }))
      })

      // Execute tools
      for (const toolCall of toolCalls) {
        try {
          const result = await toolExecutor(toolCall)

          // Add tool result to message history
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          })

          // Notify UI of result
          pipe(createEvent(EventTypes.TOOL_RESULT, {
            tool_call_id: toolCall.id,
            result
          }))

        } catch (error) {
          const errorResult = { success: false, error: error.message }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: errorResult
          })

          pipe(createEvent(EventTypes.TOOL_RESULT, {
            tool_call_id: toolCall.id,
            result: errorResult
          }))
        }
      }


      // Recursively continue with tool results
      await runAgentTurn(messages, pipe, toolExecutor)
      return
    }

    // Add assistant message to history
    if (respondedContent || reasoningContent) {
      messages.push({
        role: 'assistant',
        content: respondedContent,
        reasoning_content: reasoningContent
      })
    }

    pipe(createEvent(EventTypes.RESPONSE_END, {
      message: { role: 'assistant', content: respondedContent, reasoning_content: reasoningContent },
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

  // Notify UI of user message
  pipe(createEvent(EventTypes.USER_MESSAGE, {
    content: prompt
  }))

  // Run the agent turn
  await runAgentTurn(messages, pipe, toolExecutor)
}
