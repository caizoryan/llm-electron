import { dom } from './dom.js';
import { reactive } from './chowk.js';
import { MD } from './md.js';

const readFileContent = async (path, readFile) => {
	const result = await readFile(path);
	if (!result.success) {
		throw new Error(result.error);
	}
	return result.content;
};

const parseSessionContent = (content) => {
	try {
		return JSON.parse(content);
	} catch (e) {
		throw new Error(`Error parsing JSON: ${e.message}`);
	}
};

const STRATEGY = reactive('MD'); // 'RAW' | 'MD'

const toolCallRequests = {

}
const toolCallItem = (item) => {
	const toolCallsEl = dom(['div.tool-calls' ]);

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

		toolCallsEl.appendChild(toolCallRequests[tool_call.id]);
	});

	return dom(['div.session-item', {role: item.role}, ['div.role', item.role], toolCallsEl]);
}

const toolCallResult = (item) => {
	const toolResult = dom(['div.tool-result', ['pre', item.content]]);
	toolCallRequests[item.tool_call_id]?.appendChild(toolResult)

	return ['span']
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

	const roleEl = dom(['div.role', item.role]);
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

const createSessionRenderer = (state, readFile) => {
	const sessionRenderer = dom('.session-renderer');

	const renderSession = (parsed) => {
		sessionRenderer.innerHTML = '';
		sessionRenderer.appendChild(dom(mdraw));

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
			sessionRenderer.innerHTML = `${e.message}\n\nRaw content:\n<pre>${content || ''}</pre>`;
		}
	});

	return sessionRenderer;
};

export { createSessionRenderer, STRATEGY };
