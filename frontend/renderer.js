import { dom } from './lib/dom.js';
import { reactive, memo } from './lib/chowk.js';
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
