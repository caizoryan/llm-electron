import { dom } from './lib/dom.js';
import { MD } from './lib/md.js';
import { memo, reactive } from './lib/chowk.js';
import { startAgentLoop } from '../agent/agent.js'
import { createEvent, EventTypes } from '../agent/events.js'
import { SessionManager } from '../agent/sessionManager.js'
import { createUserMessage } from '../agent/sessionFormat.js'
import { state, DEFAULT_CWD } from './state.js';

import { createPromptEditor, createCwdEditor, getPromptEditor, getCwdEditor, Vim } from './editor.js'
import { createToolCallItem, createToolCallResult } from './toolCallRenderer.js'
import { getText, MessageRole, renderSessionItem, createSessionItemElement, createNarrativizationBlock, createUsageBlock } from './messageRenderer.js'
import { createAgentRunningIndicator, createCwdModal, createCwdPicker, createModelDropdown, createThinkingToggle } from './sessionControls.js'

// ===============================
// STATE MANAGEMENT
// ===============================
let currentMessageContent = undefined
let currentMessageReasoning = undefined
let currentMessageElement = null;

// ===============================
// EVENT HANDLERS
// ===============================
const startAssistantMessage = () => {
  if (currentMessageElement) return

  currentMessageContent = reactive('');
  currentMessageReasoning = reactive('');
  currentMessageElement = createSessionItemElement(
    MessageRole.ASSISTANT,
    createNarrativizationBlock(currentMessageReasoning),
    memo(() => MD(currentMessageContent.value()), [currentMessageContent])
  );

  sessionMessagesContainer.appendChild(currentMessageElement);
};

const endAssistantMessage = () => {
  currentMessageContent = undefined;
  currentMessageReasoning = undefined;
  currentMessageElement = undefined;
};

const eventHandlers = {
  [EventTypes.USER_MESSAGE]: (event) => {
    const messageItem = createSessionItemElement(
      MessageRole.USER,
      MD(getText(event.message))
    );
    sessionMessagesContainer.appendChild(messageItem);
  },

  [EventTypes.RESPONSE_START]: () => state.isAgentRunning.next(true),

  [EventTypes.REASONING_DELTA]: (event) => {
    startAssistantMessage();
    currentMessageReasoning?.next(value => value + event.part.thinking);
  },

  [EventTypes.TEXT_DELTA]: (event) => {
    startAssistantMessage();
    currentMessageContent?.next(value => value + event.part.text);
  },

  [EventTypes.TOOL_CALL]: (event) => {
    endAssistantMessage();
    const toolCallItem = createToolCallItem({
      role: MessageRole.ASSISTANT,
      tool_calls: [event.part],
    });
    sessionMessagesContainer.appendChild(toolCallItem);
  },

  [EventTypes.TOOL_RESULT]: (event) => {
    endAssistantMessage();
    const toolResultItem = createToolCallResult(event.message);
    sessionMessagesContainer.appendChild(toolResultItem);
  },

  [EventTypes.RESPONSE_END]: (event) => {
    if (currentMessageElement && event.message.usage) {
      currentMessageElement.appendChild(createUsageBlock(event.message.usage));
    }
    state.isAgentRunning.next(false);
  },

  [EventTypes.ERROR]: () => state.isAgentRunning.next(false),
};

let oneventhooks = [
  eventHandlers,
  {
    [EventTypes.RESPONSE_END]: (event) => {
      console.log("UPDATE USAGE", event, event.message.usage)
    }
  },
  {
    [EventTypes.RESPONSE_END]: async () => {
      if (!state.sessionManager) return;
      try {
        await state.sessionManager.write();
        console.log('Session auto-saved to', state.sessionManager.getPath());
      } catch (err) {
        console.error('Failed to auto-save session:', err);
      }
    }
  }
]


const handleAgentEvent = (event) => {
  oneventhooks.forEach(handler => {
    const handle = handler[event.type];
    handle?.(event);
  })
};

state.isAgentRunning.subscribe(value => value ? null : endAssistantMessage());

state.isCwdModalOpen.subscribe((open) => {
  if (open) {
    const cwdEditor = getCwdEditor();
    cwdEditor?.focus();
    cwdEditor?.dispatch({
      changes: {
        from: 0, to: cwdEditor.state.doc.length,
        insert: state.sessionManager?.getHeader().cwd || DEFAULT_CWD
      },
    });
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.isCwdModalOpen.value()) {
    state.isCwdModalOpen.next(false);
  }
});

// ===============================
// UI COMPONENT CREATORS
// ===============================
// ===============================
// SESSION RENDERER CREATION
// ===============================
const sessionMessagesContainer = dom('.session-messages-container')
const sessionRenderer = dom('.session-renderer', sessionMessagesContainer);
let promptBox = null;

const renderSession = () => {
  sessionMessagesContainer.innerHTML = '';
  sessionRenderer.innerHTML = '';
  sessionRenderer.appendChild(sessionMessagesContainer);

  const messages = state.sessionManager ? state.sessionManager.getMessages() : [];
  console.log("Rendering", messages, sessionMessagesContainer, state.sessionManager)
  messages.forEach(message => sessionMessagesContainer.appendChild(
    renderSessionItem(message, state.renderingStrategy.value())
  ));

  sessionMessagesContainer.appendChild(promptBox);
};

const createSessionRenderer = () => {
  document.addEventListener('keydown', async (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      if (state.sessionManager) {
        try {
          await state.sessionManager.write();
          console.log('Session saved to', state.sessionManager.getPath());
        } catch (err) {
          console.error('Failed to save session:', err);
        }
      }
    }
  });

  const inputAreaElement = dom(['div.prompt-editor']);
  const cwdEditorMount = dom(['div.cwd-editor']);
  const controlsRow = dom(['div.prompt-controls',
    createCwdPicker(),
    createModelDropdown(),
    createThinkingToggle(),
    createAgentRunningIndicator(),
  ]);
  promptBox = dom(['div.prompt-box', inputAreaElement, controlsRow]);

  createPromptEditor(inputAreaElement);
  createCwdEditor(cwdEditorMount);

  document.body.appendChild(createCwdModal(cwdEditorMount));

  Vim.defineEx("write", "w", async () => {
    setTimeout(async () => {
      const cwdEditor = getCwdEditor();
      const promptEditor = getPromptEditor();

      if (cwdEditor?.hasFocus) {
        if (!state.sessionManager) return;
        const newCwd = cwdEditor.state.doc.toString().trim();
        if (!newCwd) return;
        state.sessionManager.getHeader().cwd = newCwd;
        state.currentCwd.next(newCwd);
        state.isCwdModalOpen.next(false);
        console.log('CWD updated to:', newCwd);
        return;
      }

      if (promptEditor?.hasFocus) {
        const prompt = promptEditor.state.doc.toString().trim();
        if (!prompt || state.isAgentRunning.value()) return;
        if (!state.sessionManager) return;

        promptEditor.dispatch({ changes: { from: 0, to: promptEditor.state.doc.length, insert: '' } });
        state.isAgentRunning.next(true);

        const userMessage = createUserMessage(prompt);
        state.sessionManager.appendMessage(userMessage);
        handleAgentEvent(createEvent(EventTypes.USER_MESSAGE, { message: userMessage }));
        await startAgentLoop(state.sessionManager, handleAgentEvent, state.currentModel.value(), state.thinkingMode.value());
      }

    }, 10)
  });

  state.currentSession.subscribe(async (path) => {
    if (!path) return;
    try {
      state.sessionManager = await SessionManager.load(path);
      console.log(state.sessionManager.getMessages(), state.sessionManager)
      state.currentCwd.next(state.sessionManager.getHeader().cwd || DEFAULT_CWD);
      renderSession();
    } catch (e) {
      console.error("Error loading session:", e);
    }
  });

  sessionMessagesContainer.appendChild(promptBox);

  return sessionRenderer;
};

export { createSessionRenderer };
