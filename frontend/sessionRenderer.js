import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { MD } from './lib/md.js';

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

const toolCallRequests = { }

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

	const roleEl = dom(['div.role', item.role, ` (${estimateTokens(item.content)})`]);
	const contentEl = MD(item.content);
	return dom(['div.session-item',{role: item.role}, roleEl, ...contentEl]);
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

// this is what will have the prompt
const inputBox = ['textarea']

const createSessionRenderer = (state, readFile) => {
	const sessionRenderer = dom('.session-renderer');

	const renderSession = (parsed) => {
		sessionRenderer.innerHTML = '';
		sessionRenderer.appendChild(dom(mdraw));

		sessionRenderer.appendChild(dom(['p', 'size:' + estimateContextSize(parsed)]))

		if (Array.isArray(parsed)) {
			parsed.forEach(item => {
				sessionRenderer.appendChild(renderSessionItem(item));
			});
		} else {
			sessionRenderer.appendChild(renderSessionItem(parsed));
		}
	};

	STRATEGY.subscribe(v => renderSession(state.parsedSession));

	state.currentSession.subscribe(async (path) => {
		if (!path) return;
		try {
			const content = await readFileContent(path, readFile);
			state.parsedSession = parseSessionContent(content);
			renderSession(state.parsedSession);
		} catch (e) {
			console.error("TF?", e)
			// sessionRenderer.innerHTML = `${e.message}\n\nRaw content:\n<pre>${content || ''}</pre>`;
		}
	});

	return sessionRenderer;
};

export { createSessionRenderer, STRATEGY };
