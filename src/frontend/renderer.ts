import { dom } from './lib/dom.js';
import { memo,reactive } from './lib/chowk.js';
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
const DEFAULT_CWD = '/Users/aaryan/';

// ===============================
// STATE MANAGEMENT
// ===============================
export const state = {
  currentSession: reactive(''),
  parsedSession: '',
  sessionManager: null as SessionManager | null,
  isAgentRunning: reactive(false),
  isCwdModalOpen: reactive(false),
  currentCwd: reactive(DEFAULT_CWD),
  currentModel: reactive('kimi-k2.7-code'),
  thinkingMode: reactive('low'),
  renderingStrategy: reactive('MD')
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
  state.currentSession.next(manager.getPath());
};

const renderSessionList = (listElement, fileList) => {
  listElement.innerHTML = '';
  const files = fileList.split("\n").filter(file => !file.endsWith('/'));
  
  files.forEach(file => {
    const sessionItem = dom(['li', {
      onclick: () => state.currentSession.next(SESSIONS_DIRECTORY + file),
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
const sessionRenderer = createSessionRenderer(state);

document.body.appendChild(sessionBrowser);
document.body.appendChild(sessionRenderer);

const SIDEBAR_WIDTH = '30%';
const sidebarVisible = reactive(true);

// computed styles
const sidebarStyle = memo(() => ({
  position: 'fixed',
  top: '0',
  left: '0',
  width: SIDEBAR_WIDTH,
  height: '100vh',
  display: sidebarVisible.value() ? 'block' : 'none',
}), [sidebarVisible]);

const rendererStyle = memo(() => {
  const visible = sidebarVisible.value();
  return {
    position: 'fixed',
    top: '0',
    right: '0',
    height: '100vh',
    left: visible ? SIDEBAR_WIDTH : '0',
    width: visible ? '70%' : '100%',
  };
}, [sidebarVisible]);

const applyStyles = (element, styleMemo) => {
  Object.assign(element.style, styleMemo.value());
};

sidebarStyle.subscribe(() => applyStyles(sessionBrowser, sidebarStyle));
rendererStyle.subscribe(() => applyStyles(sessionRenderer, rendererStyle));

// toggle hotkey
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    sidebarVisible.next(v => !v);
  }
});

applyStyles(sessionBrowser, sidebarStyle);
applyStyles(sessionRenderer, rendererStyle);

loadSessionList();
