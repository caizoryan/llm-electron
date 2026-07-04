import fs from 'fs'
import { systemPrompt } from './systemPrompt.js'

systemPrompt

// Make this based on current session
// let last_log = fs.readFileSync('/Users/aaryan/.llm_sessions/log.json')
// last_log = JSON.parse(last_log)

export let messages = [
	{ role: 'system', content: systemPrompt},
	// ...last_log.slice(1)
]
