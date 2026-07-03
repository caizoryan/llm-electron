import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { MD } from './lib/md.js';
import { startAgentLoop } from '../agent/agent.js'
import { EventTypes } from '../agent/events.js'

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
let sessionMessages = [];
let currentSessionPath = null;
const isAgentRunning = reactive(false);
const renderingStrategy = reactive(RenderingStrategy.MD);
const toolCallElements = new Map();

let currentMessageContent = undefined
let currentMessageReasoning = undefined
let currentMessageElement = null;

// ===============================
// UTILITY FUNCTIONS
// ===============================
const estimateTokenCount = (text) => Math.ceil(text.length / 4);

const estimateContextSize = (parsedSession) => {
  if (!Array.isArray(parsedSession)) return estimateTokenCount(String(parsedSession));
  
  return parsedSession.reduce((total, item) => {
    return total + (item.content ? estimateTokenCount(item.content) : 0);
  }, 0);
};

const readSessionContent = async (path, readFile) => {
  const result = await readFile(path);
  return result;
};

const parseSessionContent = (content) => {
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Error parsing JSON: ${e.message}`);
  }
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
  [EventTypes.narrativization_DELTA]: (event) => {
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
    console.log(sessionMessages);
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
  const isOpen = reactive(false);
  
  return dom(['div.narrativization-block',
    { open: memo(() => isOpen.value() ? 'true' : 'false', [isOpen]) },
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

const createMarkdownSessionItem = (item) => {
  if (item.role == MessageRole.SYSTEM) return dom(['div.system', '']);

  if (item.role == MessageRole.ASSISTANT 
    && (!item.content || item.content == '')
    && item.tool_calls) 
  {
    return createToolCallItem(item);
  }

  if (item.role == MessageRole.TOOL) {
    return createToolCallResult(item);
  }

  let contentEl;
  let narrativizationEl;
  
  if (item.reasoning_content && item.role === MessageRole.ASSISTANT) {
    narrativizationEl = createNarrativizationBlock(item.reasoning_content);
  }

  if (item.content) {
    contentEl = MD(item.content);
  }

  return createSessionItemElement(item.role, contentEl, narrativizationEl);
};

const createRawSessionItem = (item) => {
  return dom(['pre', {
    class: 'session-item'
  }, JSON.stringify(item, null, 2)]);
};

const createSessionItemElement = (role, content, narrativization) => {
  const isOpen = reactive(true);
	// let fold = memo(() => isOpen.value() ? 'fold': 'unfold', [isOpen])
  let element = ['div.session-item', { role, open:isOpen },
    ['div.fold-header', { 
      onclick: () => isOpen.next(value => !value) 
    }, ['span.toggle-icon', memo(() => isOpen.value() ? '▼' : '▶', [isOpen])]],
	];

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

// ===============================
// SESSION RENDERER CREATION
// ===============================
const sessionRenderer = dom('.session-renderer');
let inputAreaElement = null;

const renderSessionItem = (item) => {
  if (renderingStrategy.value() === RenderingStrategy.RAW) {
    return createRawSessionItem(item);
  } else {
    return createMarkdownSessionItem(item);
  }
};

const renderSession = (messages) => {
  sessionRenderer.innerHTML = '';
  
  sessionRenderer.appendChild(createStrategyControls());
  
  sessionRenderer.appendChild(dom([
    'p', 
    'Context size: ' + estimateContextSize(messages) + ' tokens'
  ]));
  
  sessionRenderer.appendChild(inputAreaElement);

  if (Array.isArray(messages)) {
    messages.forEach(message => {
      sessionRenderer.appendChild(renderSessionItem(message));
    });
  } else {
    sessionRenderer.appendChild(renderSessionItem(messages));
  }
  
  sessionRenderer.appendChild(inputAreaElement);
  
  sessionMessages = messages;
};

const createSessionRenderer = (state, readFile, writeFile) => {
  document.addEventListener('keydown', async (event) => {
    currentSessionPath = state.currentSession.value();
    
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      if (currentSessionPath && writeFile) {
        try {
          await writeFile(currentSessionPath, JSON.stringify(sessionMessages, null, 2));
          console.log('Session saved to', currentSessionPath);
        } catch (err) {
          console.error('Failed to save session:', err);
        }
      }
    }
  });

  inputAreaElement = dom(['textarea.prompt-box', {
    onkeydown: async (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const prompt = inputAreaElement.value.trim();
        if (!prompt || isAgentRunning.value()) return;
        
        inputAreaElement.value = '';
        isAgentRunning.next(true);

        await startAgentLoop(prompt, sessionMessages, handleAgentEvent);
      }
    }
  }]);

  renderingStrategy.subscribe(value => renderSession(sessionMessages));

  state.currentSession.subscribe(async (path) => {
    if (!path) return;
    try {
      const content = await readSessionContent(path, readFile);
      const parsed = parseSessionContent(content);
      sessionMessages = parsed;
      renderSession(parsed);
    } catch (e) {
      console.error("Error loading session:", e);
    }
  });

  sessionRenderer.appendChild(inputAreaElement);

  return sessionRenderer;
};

export { createSessionRenderer, renderingStrategy };
