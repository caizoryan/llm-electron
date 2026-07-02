import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { MD } from './lib/md.js';
import { startAgentLoop } from '../agent/agent.js'
import { EventTypes } from '../agent/events.js'

let estimateTokens = (text) => Math.ceil(text.length / 4);
let estimateContextSize = parsed => {
	if (!Array.isArray(parsed)) return estimateTokens(String(parsed));
	
	return parsed.reduce((total, item) => {
		if (item.content) {
			return total + estimateTokens(item.content);
		}
		return total;
	}, 0);
}

const readFileContent = async (path, readFile) => {
	const result = await readFile(path);
	return result;
};

const parseSessionContent = (content) => {
	try {
		return JSON.parse(content);
	} catch (e) {
		throw new Error(`Error parsing JSON: ${e.message}`);
	}
};

const STRATEGY = reactive('MD'); // 'RAW' | 'MD'

const pipedMessages = reactive([])
const isAgentRunning = reactive(false)

const pipe = (event) => {
	const msgs = pipedMessages.value()
	const lastMsg = msgs[msgs.length - 1]

  switch (event.type) {
    case EventTypes.USER_MESSAGE:
      pipedMessages.next(e => [...e, { role: 'user', content: event.content }])
      break

    case EventTypes.RESPONSE_START:
      // Agent is starting to respond - could show loading indicator
      pipedMessages.next(e => [...e, { role: 'assistant', content: '' }])
      isAgentRunning.next(true)
      break

    case EventTypes.THINKING_DELTA:
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.reasoning_content = (lastMsg.reasoning_content || '') + event.delta
        pipedMessages.next([...msgs.slice(0, -1), lastMsg])
      }
      break
      
    case EventTypes.TEXT_DELTA:
      const current = pipedMessages.value()
      const last = current[current.length - 1]
      if (last && last.role === 'assistant') {
        last.content = (last.content || '') + event.delta
        pipedMessages.next([...current.slice(0, -1), last])
      } else {
        pipedMessages.next([...current, { role: 'assistant', content: event.delta }])
      }
      break
      
    case EventTypes.TOOL_CALL:
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.tool_calls = [...(lastMsg.tool_calls || []), event.tool_call]
        pipedMessages.next([...msgs.slice(0, -1), lastMsg])
      }
      break
      
    case EventTypes.TOOL_RESULT:
      pipedMessages.next([...pipedMessages.value(), {
        role: 'tool',
        tool_call_id: event.tool_call_id,
        content: event.result
      }])
      break
      
    case EventTypes.RESPONSE_END:
      // Add assistant message to messages if there is content
				//   if (event.message 
				// && event.message.role === 'assistant' 
				// && event.message.content) {
				//     pipedMessages.next(e => [...e, event.message])
				//   }

      isAgentRunning.next(false)
      break
      
    case EventTypes.ERROR:
      pipedMessages.next([...pipedMessages.value(), {
        role: 'system',
        content: `Error: ${event.message}`
      }])
      isAgentRunning.next(false)
      break
  }
}

const toolCallRequests = { }

const thinkingBlock = (reasoningContent) => {
  if (!reasoningContent) return null
  
  const open = reactive(true)
  return dom(['div.thinking-block'
		, { open: memo(() => open.value() ? 'true' : 'false', [open]) },
    ['div.thinking-header', { onclick: () => open.next(v => !v) },
      'Thinking...',
      ['span.toggle-icon', memo(() => open.value() ? '▼' : '▶', [open])]
    ],
    ['div.thinking-content',
      ['pre', reasoningContent]
    ]
  ])
}

const toolCallMinifiy = (tool_call) => {
	let item = ['.tool-call']
	let name = tool_call.function.name
	let args = JSON.parse(tool_call.function.arguments)
	let tokenUse =` (${estimateTokens(JSON.stringify(tool_call.function))})`
	let line = ['div.tool-name', "[ ", name + ":", ]

	if (name == 'read') line.push(['span', args.file_path])
	else if (name == 'write') line.push(['span', args.file_path])
	else if (name == 'list') line.push(['span', args.path])

	line.push(" ]")
	item.push(line)


	return (dom(item))
}

const toolCallItem = (item) => {
	const open = reactive(false)
	const toolCallsEl = ['div.tool-calls', {onclick: () => open.next(e=>!e)}];
	const toolCallsMini =['div.tool-calls', {onclick: () => open.next(e=>!e)}]

	item.tool_calls.forEach(tool_call => {
		const func = tool_call.function;
		const args = Object.entries(JSON.parse(func.arguments))
			.map(([key, value]) => 
				['.tool-args', 
					['p.key', key],
					['pre.value', value],
				])

		toolCallRequests[tool_call.id] = dom(['div.tool-call',
			['div.tool-name', func.name],
			...args
		])

		toolCallsEl.push(toolCallRequests[tool_call.id]);
		toolCallsMini.push(toolCallMinifiy(tool_call));
	});

	return dom(['div.session-item.tool', {role: item.role},
		memo(() => open.value() 
			? toolCallsEl
			: toolCallsMini,
		[open])
	]);
}

const toolCallResult = (item) => {
	const toolResult = dom(['div.tool-result', ['pre', item.content]]);
	toolCallRequests[item.tool_call_id]?.appendChild(toolResult)

	return dom(['span'])
}

const sessionItemMD = (item) => {
	if (item.role == 'system') return dom(['div.system', '']);

	if (item.role == 'assistant' 
		&& (!item.content || item.content == '')
		&& item.tool_calls) 
	{
		return toolCallItem(item)
	}

	if (item.role == 'tool') {
		return toolCallResult(item)
	}

	// Build message with optional thinking block
	const children = []
	if (item.reasoning_content && item.role === 'assistant') {
		children.push(thinkingBlock(item.reasoning_content))
	}

	if (item.content) {
		const roleEl = dom(['div.role', item.role, ` (${estimateTokens(item.content)})`])
		const contentEl = MD(item.content)
		children.push(roleEl, ...contentEl)
	}

	return dom(['div.session-item', { role: item.role }, ...children])
};

const sessionItemRAW = (item) => {
	return dom(['pre', {
		class: 'session-item'
	}, JSON.stringify(item, null, 2)]);
};

const renderSessionItem = (item) => {
	if (STRATEGY.value() == 'RAW') return sessionItemRAW(item);
	else if (STRATEGY.value() == 'MD') return sessionItemMD(item);
};

const mdraw = ['.buttons', 
	['button', {onclick: () => STRATEGY.next("MD")}, 'MD'],
	['button', {onclick: () => STRATEGY.next("RAW")}, 'RAW'],
];

const createSessionRenderer = (state, readFile) => {
	const sessionRenderer = dom('.session-renderer');

	const inputEl = dom(['textarea', {
		placeholder: 'Enter your prompt...',
		// disabled: memo(() => isAgentRunning.value()),
		onkeydown: async (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				const prompt = inputEl.value.trim()
				if (!prompt || isAgentRunning.value()) return
				
				inputEl.value = ''
				isAgentRunning.next(true)

				await startAgentLoop(prompt, [...pipedMessages.value()], pipe)
			}
		}
	}])

	const renderSession = (messages) => {
		sessionRenderer.innerHTML = '';
		sessionRenderer.appendChild(dom(mdraw));
		sessionRenderer.appendChild(dom(['p', 'size:' + estimateContextSize(messages)]))

		if (Array.isArray(messages)) {
			messages.forEach(item => {
				sessionRenderer.appendChild(renderSessionItem(item));
			});
		} else {
			sessionRenderer.appendChild(renderSessionItem(messages));
		}
		
		// Re-append input box after rendering
		sessionRenderer.appendChild(inputEl);
	};

	STRATEGY.subscribe(v => renderSession(pipedMessages.value()));
	pipedMessages.subscribe(_ => renderSession(pipedMessages.value()))

	state.currentSession.subscribe(async (path) => {
		if (!path) return;
		try {
			const content = await readFileContent(path, readFile);
			const parsed = parseSessionContent(content);
			pipedMessages.next(parsed);
			renderSession(parsed);
		} catch (e) {
			console.error("TF?", e)
			// sessionRenderer.innerHTML = `${e.message}\n\nRaw content:\n<pre>${content || ''}</pre>`;
		}
	});

	sessionRenderer.appendChild(inputEl);

	return sessionRenderer;
};

export { createSessionRenderer, STRATEGY };
