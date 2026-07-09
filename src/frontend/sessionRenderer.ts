import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { MD, highlightCode } from './lib/md.js';
import { startAgentLoop } from '../agent/agent.js'
import { createEvent, EventTypes } from '../agent/events.js'
import { models } from '../models.js'
import { SessionManager } from '../agent/sessionManager.js'
import { createUserMessage, CWD } from '../agent/sessionFormat.js'
import { fs } from '../fs.js';

import * as cm from "./lib/codemirror/codemirror.js"
import type { Usage } from '../sessionTypes.js';
import { DEFAULT_CWD, state } from './state.js';


const { basicSetup, EditorView, Vim, vim } = cm
const{ autocompletion} = cm.autocomplete
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
const toolCallElements = new Map();
const THINKING_STATES = [ 'low', 'medium', 'high' ];

let currentMessageContent  = undefined
let currentMessageReasoning = undefined
let currentMessageElement = null;

// ===============================
// PATH AUTOCOMPLETE
// ===============================
const makeFileOptions = (listing: string) => {
  return listing.split('\n').filter(Boolean).map((name) => {
    const isDir = name.endsWith('/');
    const label = isDir ? name.slice(0, -1) : name;
    return {
      label,
      apply: label + (isDir ? '/' : ''),
      type: isDir ? 'folder' : 'file',
    };
  });
};

const pathCompletions = async (context) => {
  const match = context.matchBefore(/\.\/[^\s]*/);
  if (!match) return null;

  const matchedText = context.state.sliceDoc(match.from, context.pos);
  const lastSlash = matchedText.lastIndexOf('/');
  const dirPart = matchedText.slice(0, lastSlash + 1);

	let cwd = state.sessionManager?.getHeader().cwd
  const absDir =  (cwd) + dirPart.slice(1);

  let listing: string;
  try {
    listing = await fs.listFiles(absDir);
  } catch {
    return null;
  }

  return {
    from: match.from + lastSlash + 1,
    options: makeFileOptions(listing),
    validFor: /^[^\s/]*$/,
  };
};

const cwdCompletions = async (context) => {
  const match = context.matchBefore(/\/[^\s]*/);
  if (!match) return null;

  const matchedText = context.state.sliceDoc(match.from, context.pos);
  const lastSlash = matchedText.lastIndexOf('/');
  const dirPart = matchedText.slice(0, lastSlash + 1) || '/';

  let listing: string;
  try {
    listing = await fs.listFiles(dirPart);
  } catch {
    return null;
  }

  return {
    from: match.from + lastSlash + 1,
    options: makeFileOptions(listing),
    validFor: /^[^\s/]*$/,
  };
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
	{[EventTypes.RESPONSE_END]: (event) => {
		console.log("UPDATE USAGE", event, event.message.usage)
	}}
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
    cwdEditorInstance?.focus();
    cwdEditorInstance?.dispatch({
      changes: { 
				from: 0, to: cwdEditorInstance.state.doc.length,
				insert: state.sessionManager?.getHeader().cwd || DEFAULT_CWD },
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
const createNarrativizationBlock = (reasoningContent) => {
  if (!reasoningContent) return null;

	const isEmpty = reasoningContent.isReactive 
		? memo(() => reasoningContent.value() == '', [reasoningContent]) 
		: reasoningContent 
			? (reasoningContent == '' /*&& reasoningContent != '\n'*/)
			: false

  const isOpen = reactive(true);
  
  return dom(['div.narrativization-block',
    { 
			hide: isEmpty,
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

const createUsageBlock = (usage) => {
  if (!usage) return null;

  const parts = [];
  if (typeof usage.input === 'number') parts.push(`input: ${usage.input}`);
  if (typeof usage.output === 'number') parts.push(`output: ${usage.output}`);
  if (typeof usage.cacheRead === 'number') parts.push(`cached: ${usage.cacheRead}`);
  if (typeof usage.totalTokens === 'number') parts.push(`total: ${usage.totalTokens}`);

  if (parts.length === 0) return null;

  return dom(['div.usage-block', parts.join(' · ')]);
};

const createMinimizedToolCall = (toolCall) => {
  const functionName = toolCall.name;
  const args = JSON.parse(toolCall.arguments);
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
  const expandedToolCalls = ['div.tool-calls', //{ onclick: () => isOpen.next(value => !value) }
	];
  const minimizedToolCalls = ['div.tool-calls', { onclick: () => isOpen.next(value => !value) }];

	let array = (v) => ['.array', ...v.map(value)]
	let value = (v: any) => ['pre.value',
		typeof v == 'string' 
			? v 
			: Array.isArray(v) 
				? array(v)
				: typeof v == 'object' && v!=null
					? obj(v)
					: JSON.stringify(v)
	]

	let obj = (v: object) : any => ['.object', ...Object.entries(v)
		.map(([key, vv]) => ['.tool-args', 
          ['p.key', key], 
					value(vv), ])];


  item.tool_calls.forEach(toolCall => {
    const args = obj(JSON.parse(toolCall.arguments))
    toolCallElements[toolCall.id] = dom(['div.tool-call',
      ['div.tool-name', toolCall.name],
      args
    ]);

    if (toolCall.name === 'render-html') {
      const parsedArgs = JSON.parse(toolCall.arguments);
      const funcStr = parsedArgs.func;
      const MAX_LINES = 6;
      const funcLines = funcStr.split('\n');

      // Rebuild args with highlighted + collapsible func
      const existingArgs = toolCallElements[toolCall.id].querySelectorAll(':scope > .object > .tool-args');
      const argsObj = JSON.parse(toolCall.arguments);
      const argEntries = Object.entries(argsObj).map(([key, val]: [string, any]) => {
        if (key === 'func') {
					const isExpanded = reactive(false);
					const remaining = funcLines.length - MAX_LINES;
					return ['.tool-args',
						['p.key', key],
						memo(() => {
							// return highlightCode(funcStr, 'javascript')
							const visible = isExpanded.value()
								? funcStr
								: funcLines.slice(0, MAX_LINES).join('\n');
							let ret = highlightCode(visible, 'javascript')
							console.log(ret)
							return ret;
						}, [isExpanded]),
						memo(() => isExpanded.value()
							? ['div.func-collapse-toggle', { onclick: () => isExpanded.next(false) }, '(show fewer lines...)']
							: ['div.func-collapse-toggle', { onclick: () => isExpanded.next(true) }, `(show ${remaining} more lines...)`],
						[isExpanded]),
					];
        }
        return ['.tool-args', ['p.key', key], value(val)];
      });

      // Replace existing args with custom ones
      existingArgs.forEach(el => el.remove());
      const objectEl = toolCallElements[toolCall.id].querySelector(':scope > .object');
      argEntries.forEach(entry => {
				console.log(entry)
        objectEl.appendChild(dom(entry));
      });

      const wrapper = dom(['div.render-html-container', { style: 'border: 1px solid currentColor; padding: 8px; margin: 4px 0;' }]);
      try {
        // eslint-disable-next-line no-eval
        const fn = eval(funcStr);
        if (typeof fn === 'function') {
          const el = fn();
          if (el instanceof HTMLElement) {
            wrapper.appendChild(el);
          } else {
            wrapper.appendChild(dom(['div', { style: 'color: red;' }, 'Error: function did not return an HTMLElement']));
          }
        } else {
          wrapper.appendChild(dom(['div', { style: 'color: red;' }, 'Error: eval did not produce a function']));
        }
      } catch (err) {
        wrapper.appendChild(dom(['div', { style: 'color: red;' }, 'Error: ' + err.message]));
      }
      toolCallElements[toolCall.id].appendChild(wrapper);
    }

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
  const text = getText(item);
  const toolResult = dom(['div.tool-result', ['pre', text]]);
  toolCallElements[item.toolCallId]?.appendChild(toolResult);

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
      return createToolCallItem({ role: item.role, tool_calls: toolCalls });
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

    const usageEl = item.usage ? createUsageBlock(item.usage) : null;

    return createSessionItemElement(item.role, contentEl, narrativizationEl, usageEl);
  }

  if (item.role === MessageRole.TOOL) {
    return createToolCallResult(item);
  }

  // User
  return createSessionItemElement(item.role, MD(getText(item)));
};

const createRawSessionItem = (item) => {
  return dom(['pre', {
    class: 'session-item'
  }, JSON.stringify(item, null, 2)]);
};

const createSessionItemElement = (role, content, narrativization?: any, usage?: Usage) => {
  const isOpen = reactive(true);
  let element = ['div.session-item', { role, open:isOpen },
    // ['div.fold-header', { onclick: () => isOpen.next(value => !value) }, ['span.toggle-icon', memo(() => isOpen.value() ? '▼' : '▶', [isOpen])]],
	];

	if (!content && !narrativization){
		console.log("BRUH EMPTY MESSAGE ???")
		return dom(['span', 'empty'])
	}

  narrativization ? element.push(narrativization) : null;
  Array.isArray(content) ? element.push(...content) : element.push(content);
  usage ? element.push(usage) : null;
	// element.push(['button', { onclick: _ => isOpen.next(value => !value) }, 'close'])

  return dom(element);
};

const createStrategyControls = () => {
  return dom(['.buttons', 
    ['button', { onclick: () => state.renderingStrategy.next(RenderingStrategy.MD) }, 'MD'],
    ['button', { onclick: () => state.renderingStrategy.next(RenderingStrategy.RAW) }, 'RAW'],
  ]);
};

const createModelDropdown = () => {
  return dom(['select.model-select',
    { 
			onchange: (e) => state.currentModel.next(e.target.value)
		},
		memo(() => models.filter(e => e.api != 'anthropic').map(m => {
			let opts = { value: m.id,  }
			m.id === state.currentModel.value() ? opts.selected = true : null
			let el = ['option', opts, m.name]
			return el
		}
		),[state.currentModel]) 
  ]);
};

const createThinkingToggle = () => {
  return dom(['button.small',
    { onclick: () => {
      const current = state.thinkingMode.value();
      const nextIndex = (THINKING_STATES.indexOf(current) + 1) % THINKING_STATES.length;
      state.thinkingMode.next(THINKING_STATES[nextIndex]);
    }},
    memo(() => `Think: ${state.thinkingMode.value()}`, [state.thinkingMode])
  ]);
};

// ===============================
// CWD PICKER
// ===============================
const createCwdPicker = () => {
  return dom(['button.cwd-picker.small',
    {
      onclick: () => state.isCwdModalOpen.next(true),
      title: 'Change working directory',
    },
    memo(() => state.currentCwd.value(), [state.currentSession, state.currentCwd]),
  ]);
};

const createCwdModal = (editorMount: HTMLElement) => {
  return dom(['div.modal-overlay',
    {
      hide: memo(() => !state.isCwdModalOpen.value(), [state.isCwdModalOpen]),
      onclick: (e: MouseEvent) => {
        if (e.target === e.currentTarget) state.isCwdModalOpen.next(false);
      },
    },
    ['div.modal',
      ['p', 'Set working directory (:w to save)'],
      editorMount,
    ]
  ]);
};

// ===============================
// SESSION RENDERER CREATION
// ===============================
const sessionMessagesContainer = dom('.session-messages-container')
const sessionRenderer = dom('.session-renderer', sessionMessagesContainer);
let inputAreaElement = null;
let promptBox = null;
let editorInstance = null;
let cwdEditorInstance = null;

const renderSessionItem = (item) => {
  if (state.renderingStrategy.value() === RenderingStrategy.RAW) {
    return createRawSessionItem(item);
  } else {
    return createMarkdownSessionItem(item);
  }
};

const renderSession = () => {
  sessionMessagesContainer.innerHTML = '';
  sessionRenderer.innerHTML = '';
  // sessionRenderer.appendChild(createStrategyControls());
  sessionRenderer.appendChild(sessionMessagesContainer);

  const messages = state.sessionManager ? state.sessionManager.getMessages() : [];
	console.log("Rendering", messages, sessionMessagesContainer, state.sessionManager)
  messages.forEach(message => sessionMessagesContainer.appendChild(renderSessionItem(message)));
  
	// TODO: This shouldn't be happening, make it so the prompt editor is not connected to session?
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

  let inputAreaElement = dom( ['div.prompt-editor']);
  const cwdEditorMount = dom(['div.cwd-editor']);
	promptBox = dom(['div.prompt-box', inputAreaElement, 
		// ['p', currentModel],
		createCwdPicker(),
		createModelDropdown(),
		createThinkingToggle()]);


  const editorTheme = EditorView.theme({
    '& .cm-gutters': { backgroundColor: 'transparent', border: 'none' },
    '& .cm-gutter': { backgroundColor: 'transparent', color: 'white' },
    '& .cm-activeLineGutter': { backgroundColor: 'transparent' },
  });

	// -------------------------
	// CLEAN THE FUCK UP THE
	// CODEMIRROR BUSINESS
	// WHY SO MESSY!
	// -------------------------
  editorInstance = new EditorView({
    parent: inputAreaElement,
    state: EditorState.create({
      doc: '\n\n\n',
      extensions: [ vim(), basicSetup, autocompletion({override: [pathCompletions]}), editorTheme ],
    }),
  });

  cwdEditorInstance = new EditorView({
    parent: cwdEditorMount,
    state: EditorState.create({
      doc: DEFAULT_CWD,
      extensions: [ vim(), basicSetup, autocompletion({override: [cwdCompletions]}), editorTheme ],
    }),
  });

  document.body.appendChild(createCwdModal(cwdEditorMount));

  // updateHeight();

  Vim.defineEx("write", "w", async () => {
		setTimeout(async () => {
			if (cwdEditorInstance.hasFocus) {
				if (!state.sessionManager) return;
				const newCwd = cwdEditorInstance.state.doc.toString().trim();
				if (!newCwd) return;
				state.sessionManager.getHeader().cwd = newCwd;
				state.currentCwd.next(newCwd);
				state.isCwdModalOpen.next(false);
				console.log('CWD updated to:', newCwd);
				return;
			}

			if (editorInstance.hasFocus) {
				const prompt = editorInstance.state.doc.toString().trim();
				if (!prompt || state.isAgentRunning.value()) return;
				if (!state.sessionManager) return;

				editorInstance.dispatch({ changes: { from: 0, to: editorInstance.state.doc.length, insert: '' } });
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
