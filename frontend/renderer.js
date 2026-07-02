import { dom } from './dom.js';
import { reactive, memo } from './chowk.js'
import { MD } from './md.js';

let currentPath = ''
let SESSIONS_DIRECTORY = '/Users/aaryan/.llm_sessions/'

let state = {
	currentSession: reactive('')
}

const readFile = async (filePath) => window.electronAPI.readFile([filePath]);
const writeFile = async(path, content) =>  window.electronAPI.writeFile([path, content])
const listFiles = async(path) => window.electronAPI.listFiles([path])

const updateOutput = (output, result, filePath) => {
  if (result.success) {
    output.value = result.content;
    currentPath = filePath;
  } else {
    output.value = `Error: ${result.error}`;
  }
};

const handleReadFile = async (input, output) => {
  const filePath = input.value;
  output.textContent = 'Loading...';

  const result = await readFile(filePath);
  updateOutput(output, result, filePath);
};



let output = dom("textarea#output", { 
	style: "margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word;",
	onkeypress: (e) => {
		if (e.key == 'Enter' && currentPath){
			e.preventDefault()
			writeFile(currentPath, output.value)
		}
	},
}, "File contents will appear here...")

const content = dom([
  "div",
  ["h2", "File Reader"],
  ["input#fileInput", {
    placeholder: "Enter file path",
    type: "text",
    onkeypress: (e) => {
      if (e.key === 'Enter') {
        handleReadFile(e.target, document.getElementById('output'));
      }
    }
  }],
  output
]);


// ---------------------
// Session Browser
// ---------------------
let list = dom(['ul#sessionList', { style: 'list-style: none; padding: 0;' }])
const sessionsBrowser = dom(['.session', 
  ['h3', 'Sessions'],
	list
]);


const renderList = (list, files) => {
  list.innerHTML = '';
  files.forEach(file => {
    const item = dom(['li', {
      onclick: () => state.currentSession.next(SESSIONS_DIRECTORY + "/" + file),
    }, file]);
    list.appendChild(item);
  });
};

const loadSessions = async () => {
  list.textContent = 'Loading...';
  const result = await listFiles(SESSIONS_DIRECTORY);
  
  if (result.success) {
    renderList(list, result.files);
  } else {
    list.textContent = `Error: ${result.error}`;
  }
};

loadSessions();

// ---------------------
// Session Renderer
// ---------------------

const sessionRenderer = dom('.session-renderer')

const readFileContent = async (path) => {
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

const STRATEGY = 'MD' // 'RAW'
// const STRATEGY = 'RAW'


const sessionItemMD = (item) => {
	if (item.role == 'system') return dom(['div.system', 'SYSTEM'])

	if (item.role == 'assistant' && (!item.content || item.content == '') && item.tool_calls) {
		const toolCallsEl = dom(['div.tool-calls']);
		item.tool_calls.forEach(tool_call => {
			const func = tool_call.function;
			const args = Object.entries(JSON.parse(func.arguments))
				.map(([key, value]) => 
					['.tool-args', 
						['p.key', key],
						['pre.value', value],
				])
			// JSON.stringify(func.arguments, null, 2);
			toolCallsEl.appendChild(dom(['div.tool-call',
				['div.tool-name', func.name],
				...args
			]));
		});
		return dom(['div.session-item', ['div.role', item.role], toolCallsEl]);
	}

	const roleEl = dom(['div.role', item.role]);
	const contentEl = MD(item.content);
	return dom(['div.session-item', roleEl, ...contentEl]);
};

const sessionItemRAW = (item) => {
	return dom(['pre', {
		class: 'session-item'
	}, JSON.stringify(item, null, 2)]);
};

const renderSessionItem = (item) => {
	if (STRATEGY == 'RAW') return sessionItemRAW(item);
	else if (STRATEGY == 'MD') return sessionItemMD(item);
};

const renderSession = (parsed) => {
	sessionRenderer.innerHTML = '';
	if (Array.isArray(parsed)) {
		parsed.forEach(item => {
			sessionRenderer.appendChild(renderSessionItem(item));
		});
	} else {
		sessionRenderer.appendChild(renderSessionItem(parsed));
	}
};

state.currentSession.subscribe(async (path) => {
	if (!path) return;
	try {
		const content = await readFileContent(path);
		const parsed = parseSessionContent(content);
		renderSession(parsed);
	} catch (e) {
		sessionRenderer.innerHTML = `${e.message}\n\nRaw content:\n<pre>${content || ''}</pre>`;
	}
})

// document.body.appendChild(content);
document.body.appendChild(sessionsBrowser);
document.body.appendChild(sessionRenderer);
