import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { MD } from './lib/md.js';
import { startAgentLoop } from '../agent/agent.js'
import { createEvent, EventTypes } from '../agent/events.js'
import { models } from '../models.js'
import { JSONL } from './jsonl.js'
import {
  createSessionHeader,
  createSystemMessage,
  createUserMessage,
  generateId,
} from '../agent/sessionFormat.js'

import * as cm from "./lib/codemirror/codemirror.js"
const { basicSetup,EditorView, Vim, vim} = cm
const { EditorState } = cm.state

// ===============================
// CONSTANTS & CONFIGURATION
// ===============================
const RenderingStrategy = {
  MD: 'MD',
  RAW: 'RAW'
};

const MessageRole = {
  SYSTEM: 'system',
  USER: 'user', 
  ASSISTANT: 'assistant',
  TOOL: 'tool'
};

// ===============================
// STATE MANAGEMENT
// ===============================
let sessionHeader = null;
let sessionMessages = [];
let currentSessionPath = null;
const isAgentRunning = reactive(false);
const currentModel = reactive('kimi-k2.7-code');
const renderingStrategy = reactive(RenderingStrategy.MD);
const toolCallElements = new Map();

let currentMessageContent = undefined
let currentMessageReasoning = undefined
let currentMessageElement = null;

// ===============================
// UTILITY FUNCTIONS
// ===============================
const estimateTokenCount = (text) => Math.ceil(text.length / 4);

const estimateContextSize = (messages) =>
  messages
    .filter((m) => m.role === "assistant")
    .reduce((sum, m) => {
      const text = m.content
        .filter((c) => c.type === "text" || c.type === "thinking")
        .map((c) => (c.type === "text" ? c.text : c.thinking))
        .join("");
      return sum + estimateTokenCount(text);
    }, 0);

const readSessionContent = async (path, readFile) => {
  const result = await readFile(path);
  return result;
};

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

  sessionRenderer.appendChild(currentMessageElement);
};

const endAssistantMessage = () => {
  currentMessageContent = undefined;
  currentMessageReasoning = undefined;
  currentMessageElement = undefined;
};

const eventHandlers = {
  [EventTypes.USER_MESSAGE]: (event) => {
    const messageItem = createSessionItemElement(MessageRole.USER, MD(event.content));
    sessionRenderer.appendChild(messageItem);
  },
  [EventTypes.RESPONSE_START]: () => isAgentRunning.next(true),
  [EventTypes.REASONING_DELTA]: (event) => {
    startAssistantMessage();
    currentMessageReasoning?.next(value => value + event.delta);
  },
  [EventTypes.TEXT_DELTA]: (event) => {
    startAssistantMessage();
    currentMessageContent?.next(value => value + event.delta);
  },
  [EventTypes.TOOL_CALL]: (event) => {
    endAssistantMessage();
    const toolCallItem = createToolCallItem({ tool_calls: [event.tool_call] });
    sessionRenderer.appendChild(toolCallItem);
  },
  [EventTypes.TOOL_RESULT]: (event) => {
    endAssistantMessage();
    const toolResultItem = createToolCallResult(event);
    sessionRenderer.appendChild(toolResultItem);
  },

  [EventTypes.RESPONSE_END]: () => {
    isAgentRunning.next(false);
  },
  [EventTypes.ERROR]: () => isAgentRunning.next(false),
};

const handleAgentEvent = (event) => {
  const handler = eventHandlers[event.type];
  handler?.(event);
};

isAgentRunning.subscribe(value => value ? null : endAssistantMessage());

// ===============================
// UI COMPONENT CREATORS
// ===============================
const createNarrativizationBlock = (reasoningContent) => {
  if (!reasoningContent) return null;

	const isEmpty = reasoningContent.isReactive 
		? memo(() => reasoningContent.value() != '', [reasoningContent]) 
		: reasoningContent 
			? reasoningContent != '' 
			: false

  const isOpen = reactive(false);
  
  return dom(['div.narrativization-block',
    { 
			// hide: isEmpty,
			open: memo(() => isOpen.value() ? 'true' : 'false', [isOpen]),
		},
    ['div.narrativization-header', { 
      onclick: () => isOpen.next(value => !value) 
    },
      'Narrativization...',
      ['span.toggle-icon', memo(() => isOpen.value() ? '▼' : '▶', [isOpen])]
    ],
    ['div.narrativization-content',
      ['pre', reasoningContent]
    ]
  ]);
};

const createMinimizedToolCall = (toolCall) => {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);
  // const tokenEstimate = estimateTokenCount(JSON.stringify(toolCall.function));
  
  let argDisplay;
  if (functionName === 'read' || functionName === 'write') {
    argDisplay = ['span', args.file_path];
  } else if (functionName === 'list') {
    argDisplay = ['span', args.path];
  } else if (functionName === 'replace') {
    argDisplay = ['span', args.file_path];
  } else if (functionName === 'append') {
    argDisplay = ['span', args.file_path];
  } else {
    argDisplay = ['span', JSON.stringify(args)];
  }
  
  return dom(['.tool-call',
    ['div.tool-name', 
      '[ ', functionName + ':',
      argDisplay,
      ' ]', 
      // ` (${tokenEstimate} tokens)`
    ]
  ]);
};

const createToolCallItem = (item) => {
  const isOpen = reactive(false);
  const expandedToolCalls = ['div.tool-calls', { onclick: () => isOpen.next(value => !value) }];
  const minimizedToolCalls = ['div.tool-calls', { onclick: () => isOpen.next(value => !value) }];

  item.tool_calls.forEach(toolCall => {
    const func = toolCall.function;
    const args = Object.entries(JSON.parse(func.arguments))
      .map(([key, value]) => 
        ['.tool-args', 
          ['p.key', key],
          ['pre.value', value],
        ]);

    toolCallElements[toolCall.id] = dom(['div.tool-call',
      ['div.tool-name', func.name],
      ...args
    ]);

    expandedToolCalls.push(toolCallElements[toolCall.id]);
    minimizedToolCalls.push(createMinimizedToolCall(toolCall));
  });

  return dom(['div.session-item.tool', { role: item.role },
    memo(() => isOpen.value() 
      ? expandedToolCalls
      : minimizedToolCalls,
      [isOpen])
  ]);
};

const createToolCallResult = (item) => {
  const toolResult = dom(['div.tool-result', ['pre', item.content]]);
  toolCallElements[item.tool_call_id]?.appendChild(toolResult);

  return dom(['span']);
};

// ---------------------------------------------------------------------------
// Helpers for reading session-format content
// ---------------------------------------------------------------------------

const getText = (message) =>
  (message.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

const getThinking = (message) =>
  (message.content || [])
    .filter((c) => c.type === "thinking")
    .map((c) => c.thinking)
    .join("");

const getToolCalls = (message) =>
  (message.content || [])
    .filter((c) => c.type === "toolCall");

// ---------------------------------------------------------------------------
// Rendering helpers for session-format messages
// ---------------------------------------------------------------------------

const createMarkdownSessionItem = (item) => {
  if (item.role === MessageRole.SYSTEM) return dom(['div.system', '']);

  if (item.role === MessageRole.ASSISTANT) {
    const toolCalls = getToolCalls(item);
    if (toolCalls.length > 0) {
      // Convert session-format tool calls to the shape createToolCallItem expects
      return createToolCallItem({
        role: item.role,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    }

    const text = getText(item);
    const thinking = getThinking(item);

    let contentEl;
    let narrativizationEl;

    if (thinking) {
      narrativizationEl = createNarrativizationBlock(thinking);
    }

    if (text) {
      contentEl = MD(text);
    }

    return createSessionItemElement(item.role, contentEl, narrativizationEl);
  }

  if (item.role === MessageRole.TOOL) {
    return createToolCallResult({
      tool_call_id: item.toolCallId,
      content: getText(item),
    });
  }

  // User
  return createSessionItemElement(item.role, MD(getText(item)));
};

const createRawSessionItem = (item) => {
  return dom(['pre', {
    class: 'session-item'
  }, JSON.stringify(item, null, 2)]);
};

const createSessionItemElement = (role, content, narrativization) => {
  const isOpen = reactive(true);
  let element = ['div.session-item', { role, open:isOpen },
    ['div.fold-header', { 
      onclick: () => isOpen.next(value => !value) 
    }, ['span.toggle-icon', memo(() => isOpen.value() ? '▼' : '▶', [isOpen])]],
	];

	if (!content && !narrativization){
		console.log("BRUH EMPTY MESSAGE ???")
		return dom(['span', 'empty'])
	}

  narrativization ? element.push(narrativization) : null;
  Array.isArray(content) ? element.push(...content) : element.push(content);
	// element.push(['button', { onclick: _ => isOpen.next(value => !value) }, 'close'])

  return dom(element);
};

const createStrategyControls = () => {
  return dom(['.buttons', 
    ['button', { onclick: () => renderingStrategy.next(RenderingStrategy.MD) }, 'MD'],
    ['button', { onclick: () => renderingStrategy.next(RenderingStrategy.RAW) }, 'RAW'],
  ]);
};

const createModelDropdown = () => {
  return dom(['select.model-select',
    { 
			onchange: (e) => currentModel.next(e.target.value)
		},
		memo(() => models.filter(e => e.api != 'anthropic').map(m => {
			let opts = { value: m.id,  }
			m.id === currentModel.value() ? opts.selected = true : null
			let el = ['option', opts, m.name]
			return el
		}
		),[currentModel]) 
  ]);
};

// ===============================
// SESSION RENDERER CREATION
// ===============================
const sessionRenderer = dom('.session-renderer');
let inputAreaElement = null;
let promptBox = null;
let editorInstance = null;

const renderSessionItem = (item) => {
  if (renderingStrategy.value() === RenderingStrategy.RAW) {
    return createRawSessionItem(item);
  } else {
    return createMarkdownSessionItem(item);
  }
};

const renderSession = () => {
  sessionRenderer.innerHTML = '';
  
  sessionRenderer.appendChild(createStrategyControls());
  sessionRenderer.appendChild(dom([ 'p', 'Context size: ' + estimateContextSize(sessionMessages) + ' tokens' ]));


  if (Array.isArray(sessionMessages)) sessionMessages.forEach(message =>  sessionRenderer.appendChild(renderSessionItem(message)));
	else sessionRenderer.appendChild(renderSessionItem(sessionMessages));
  
	// TODO: This shouldn't be happening, make it so the prompt editor is not connected to session?
  sessionRenderer.appendChild(promptBox);
};

const createSessionRenderer = (state, readFile, writeFile) => {
  document.addEventListener('keydown', async (event) => {
    currentSessionPath = state.currentSession.value();
    
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      if (currentSessionPath && writeFile) {
        try {
          await writeFile(currentSessionPath, JSONL.stringify([sessionHeader, ...sessionMessages]));
          console.log('Session saved to', currentSessionPath);
        } catch (err) {
          console.error('Failed to save session:', err);
        }
      }
    }
  });

  let inputAreaElement = dom( ['div.prompt-editor']);
	promptBox = dom(['div.prompt-box', inputAreaElement, 
		// ['p', currentModel],
		createModelDropdown()]);


  editorInstance = new EditorView({
    parent: inputAreaElement,
    state: EditorState.create({
      doc: '',
      extensions: [ vim(), basicSetup ],
    }),
  });

  // updateHeight();

  Vim.defineEx("write", "w", async () => {
    const prompt = editorInstance.state.doc.toString().trim();
    if (!prompt || isAgentRunning.value()) return;
    
    editorInstance.dispatch({ changes: { from: 0, to: editorInstance.state.doc.length, insert: '' } });
    isAgentRunning.next(true);

    const userMessage = createUserMessage(prompt);
    sessionMessages.push(userMessage);
    handleAgentEvent(createEvent(EventTypes.USER_MESSAGE, userMessage));
    await startAgentLoop(sessionMessages, handleAgentEvent, currentModel.value());
  });

  renderingStrategy.subscribe(value => renderSession());

  state.currentSession.subscribe(async (path) => {
    if (!path) return;
    try {
      const content = await readSessionContent(path, readFile);
      const rows = JSONL.parse(content);
      [sessionHeader, ...sessionMessages] = rows;
      renderSession();
    } catch (e) {
      console.error("Error loading session:", e);
    }
  });

  sessionRenderer.appendChild(promptBox);

  return sessionRenderer;
};

export { createSessionRenderer, renderingStrategy };
