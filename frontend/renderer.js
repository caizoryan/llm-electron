import { dom } from './lib/dom.js';
import { reactive, memo } from './lib/chowk.js';
import { createSessionRenderer } from './sessionRenderer.js';
import { fs } from '../fs.js';
import { modalPopUp } from './modal.js';

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

const newSessionBtn = dom(['button.new-session-btn', {
  onclick: () => modalPopUp('Enter session name:', async (name) => {
    const sessionPath = SESSIONS_DIRECTORY + name + '.json';
    const emptySession = [{ role: 'system', content: 'You are a helpful assistant.' }];
    await writeFile(sessionPath, JSON.stringify(emptySession, null, 2));
    loadSessions();
    state.currentSession.next(sessionPath);
  })
}, '+ New Session']);

const sessionsBrowser = dom(['.session',
  ['div.session-header',
    ['h3', 'Sessions'],
    newSessionBtn
  ],
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
