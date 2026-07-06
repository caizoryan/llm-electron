import type { ToolCall } from '../sessionTypes.js'
import { tools } from './tools.js'

const REQUIRED_ARGS=tools.reduce((acc:any,e)=>(acc[e.name]=e.parameters.required, acc),{})
const TOOL_FUNCTIONS=tools.reduce((acc:any,e)=>(acc[e.name]=e.execute, acc),{})

function callFunction(toolCall: ToolCall) {
  const name = toolCall.name
  let args = toolCall.arguments
  if (typeof args == 'string') args = JSON.parse(args)

  console.log('Dawg wants to call: ', name, args)

  if (!TOOL_FUNCTIONS[name]) {
    throw new Error(`Unknown tool: ${name}`)
  }

  // Validate required args
  const requiredArgs = REQUIRED_ARGS[name] ?? []
  for (const arg of requiredArgs) {
    if (!args[arg]) {
      throw new Error(`Missing required argument '${arg}' for tool '${name}'`)
    }
  }

  return TOOL_FUNCTIONS[name](args)
}

// ---------------------------------------------------------------------------
// Tool executor — accepts a session-format ToolCall
// ---------------------------------------------------------------------------

export const toolExecutor = async (sessionToolCall) => {
  try {
    const result = await callFunction(sessionToolCall);
    
    if (result.success) {
      return result.content;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    throw error;
  }
};
