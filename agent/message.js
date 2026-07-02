import { tools, toolToMarkdown } from './tools.js'
import fs from 'fs'

let toolMsg = `
### Remember you have tool calls available to you: 

${tools.map(toolToMarkdown).join("\n")}
`

// Make this based on current session
// let last_log = fs.readFileSync('/Users/aaryan/.llm_sessions/log.json')
// last_log = JSON.parse(last_log)

export let messages = [
	{ role: 'system', content: `
You are an intelligent coding agent. You think step by step and follow instructions.

${toolMsg}

Answer succinctly. Only explain when absolutely necessary. Much of the things can be inferred.
Be succinct with your code and make sure the context is taken into account.
`},
	// ...last_log.slice(1)
]
