import { tools } from './tools.js'

const REQUIRED_ARGS = tools.reduce((acc, e) => {
  acc[e.name] = e.parameters.required
  return acc
}, {})

const TOOL_FUNCTIONS = tools.reduce((acc, e) => {
  acc[e.name] = e.execute
  return acc
}, {})

export function callFunction(toolCall) {
  const name = toolCall.function.name
  let args = toolCall.function.arguments
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