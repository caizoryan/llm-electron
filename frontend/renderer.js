import { dom } from './dom.js';
import { reactive, memo } from './chowk.js';
import { MD } from './md.js';
import { createSessionRenderer } from './sessionRenderer.js';

let currentPath = ''
let SESSIONS_DIRECTORY = '/Users/aaryan/.llm_sessions/'

let state = {
	currentSession: reactive(''),
	parsedSession: ''
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
const sessionRenderer = createSessionRenderer(state, readFile);

// document.body.appendChild(content);
document.body.appendChild(sessionsBrowser);
document.body.appendChild(sessionRenderer);
