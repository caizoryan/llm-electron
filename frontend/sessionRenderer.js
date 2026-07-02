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

// TODO: Make this a normal array
let messages =[]
const isAgentRunning = reactive(false)

let currentContent = undefined
let currentReasoning = undefined
let currentElement = undefined

let startAgentMessageRender = () => {
	currentContent = reactive('')
	currentReasoning = reactive('')
	currentElement = dom(['.session-item', {role: "assistant"}, 
		thinkingBlock(currentReasoning),
		['.el', memo(() => MD(currentContent.value()), [currentContent])]
	])

	sessionRenderer.appendChild(currentElement)
}
let endAgentMessageRender = () => (currentContent=undefined, currentReasoning=undefined, currentElement=undefined)

const pipe = (event) => {

  switch (event.type) {
    case EventTypes.USER_MESSAGE:
			sessionRenderer.appendChild(renderSessionItem({ role: 'user', content: event.content }))
      break

    case EventTypes.RESPONSE_START:
      isAgentRunning.next(true)
      break

    case EventTypes.THINKING_DELTA:
			if (!currentReasoning) startAgentMessageRender()
			currentReasoning.next(v => v+ event.delta)
      break
      
    case EventTypes.TEXT_DELTA:
			if (!currentReasoning) startAgentMessageRender()
      if (currentContent) {
				currentContent.next(v => v+ event.delta)
      }
      break
      
    case EventTypes.TOOL_CALL:
			endAgentMessageRender()
			sessionRenderer.appendChild(toolCallItem({tool_calls: [event.tool_call]}))

      break
      
    case EventTypes.TOOL_RESULT:
			endAgentMessageRender()
			sessionRenderer.appendChild(toolCallResult(event))
      break
      
    case EventTypes.RESPONSE_END:
      isAgentRunning.next(false)
      break
      
    case EventTypes.ERROR:
      isAgentRunning.next(false)
      break
  }
}

isAgentRunning.subscribe(v => v ? null : endAgentMessageRender())

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
		const roleEl = dom(['div.role', /*item.role,*/ ` (${estimateTokens(item.content)})`])
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

const sessionRenderer = dom('.session-renderer');
const createSessionRenderer = (state, readFile) => {

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

				await startAgentLoop(prompt, messages, pipe)
			}
		}
	}])

	// should happen only once...
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

	STRATEGY.subscribe(v => renderSession(messages));
	
	// TODO: remove this
	// pipedMessages.subscribe(_ => renderSession(pipedMessages.value()))

	state.currentSession.subscribe(async (path) => {
		if (!path) return;
		try {
			const content = await readFileContent(path, readFile);
			const parsed = parseSessionContent(content);
			messages = parsed;
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
