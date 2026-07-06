import { dom } from './lib/dom.js';
import { reactive } from './lib/chowk.js';
import { createSessionRenderer } from './sessionRenderer.js';
import { fs } from '../fs.js';
import { modalPopUp } from './modal.js';
import { systemPrompt } from '../agent/systemPrompt.js';
import { SessionManager } from '../agent/sessionManager.js';
import { createSystemMessage } from '../agent/sessionFormat.js';

// import { MD } from './lib/md.js';
// import { startAgentLoop } from '../agent/agent.js'
// import { EventTypes } from '../agent/events.js'

// ===============================
// CONSTANTS & CONFIGURATION
// ===============================
const SESSIONS_DIRECTORY = '/Users/aaryan/.llm_sessions/';
const DEFAULT_SYSTEM_PROMPT = systemPrompt;

// ===============================
// STATE MANAGEMENT
// ===============================
const appState = {
  currentSession: reactive(''),
  parsedSession: ''
};

// ===============================
// FILE OPERATIONS
// ===============================
const listSessionFiles = async () => {
  return await fs.listFiles(SESSIONS_DIRECTORY);
};

// ===============================
// SESSION MANAGEMENT
// ===============================
const createNewSession = async (sessionName) => {
  const sessionPath = SESSIONS_DIRECTORY + sessionName + '.jsonl';
  const manager = await SessionManager.create(sessionPath, [
    createSystemMessage(DEFAULT_SYSTEM_PROMPT),
  ]);
  loadSessionList();
  appState.currentSession.next(manager.getPath());
};

const renderSessionList = (listElement, fileList) => {
  listElement.innerHTML = '';
  const files = fileList.split("\n").filter(file => !file.endsWith('/'));
  
  files.forEach(file => {
    const sessionItem = dom(['li', {
      onclick: () => appState.currentSession.next(SESSIONS_DIRECTORY + file),
    }, file]);
    listElement.appendChild(sessionItem);
  });
};

const loadSessionList = async () => {
  sessionListElement.textContent = 'Loading...';
  const result = await listSessionFiles();
  
  if (result) {
    renderSessionList(sessionListElement, result);
  } else {
    sessionListElement.textContent = `Error: ${result.error}`;
  }
};

// ===============================
// UI COMPONENT CREATION
// ===============================
const sessionListElement = dom(['ul#sessionList', { 
  style: 'list-style: none; padding: 0;' 
}]);

const newSessionButton = dom(['button.new-session-btn', {
  onclick: () => modalPopUp('Enter session name:', createNewSession),
}, '+ New Session']);

const sessionBrowser = dom(['.session',
  ['div.session-header',
    ['h3', 'Sessions'],
    newSessionButton
  ],
  sessionListElement
]);

// ===============================
// INITIALIZATION
// ===============================
const sessionRenderer = createSessionRenderer(appState);

document.body.appendChild(sessionBrowser);
document.body.appendChild(sessionRenderer);

loadSessionList();
