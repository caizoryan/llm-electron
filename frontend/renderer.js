import { dom } from './lib/dom.js';
import { reactive, memo } from './lib/chowk.js';
import { createSessionRenderer } from './sessionRenderer.js';
import { fs } from '../fs.js';

let currentPath = ''
let SESSIONS_DIRECTORY = '/Users/aaryan/.llm_sessions/'

let state = {
	currentSession: reactive(''),
	parsedSession: ''
}

const readFile = fs.readFile
const writeFile = fs.writeFile
const listFiles = fs.listFiles


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
	files = files.split("\n").filter(e => e.slice(-1) != '/')
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
  
  if (result) {
    renderList(list, result);
  } else {
    list.textContent = `Error: ${result.error}`;
  }
};

loadSessions();

// ---------------------
// Session Renderer
// ---------------------
const sessionRenderer = createSessionRenderer(state, readFile, writeFile);

// document.body.appendChild(content);
document.body.appendChild(sessionsBrowser);
document.body.appendChild(sessionRenderer);
