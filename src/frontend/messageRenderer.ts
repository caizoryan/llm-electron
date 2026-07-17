import { dom } from './lib/dom.js';
import { MD } from './lib/md.js';
import { memo, reactive } from './lib/chowk.js';
import type { Usage } from '../sessionTypes.js';
import { createToolCallItem, createToolCallResult, type ToolCall } from './toolCallRenderer.js';

export const MessageRole = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool'
};

export const createNarrativizationBlock = (reasoningContent) => {
  if (!reasoningContent) return null;

  const isEmpty = reasoningContent.isReactive
    ? memo(() => reasoningContent.value() == '', [reasoningContent])
    : reasoningContent
      ? (reasoningContent == '')
      : false;

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

export const createUsageBlock = (usage) => {
  if (!usage) return null;

  const parts = [];
  if (typeof usage.input === 'number') parts.push(`input: ${usage.input}`);
  if (typeof usage.output === 'number') parts.push(`output: ${usage.output}`);
  if (typeof usage.cacheRead === 'number') parts.push(`cached: ${usage.cacheRead}`);
  if (typeof usage.totalTokens === 'number') parts.push(`total: ${usage.totalTokens}`);

  if (parts.length === 0) return null;

  return dom(['div.usage-block', parts.join(' · ')]);
};

export const getText = (message) =>
  (message.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

const getThinking = (message) =>
  (message.content || [])
    .filter((c) => c.type === "thinking")
    .map((c) => c.thinking)
    .join("");

const getToolCalls = (message): ToolCall[] =>
  (message.content || [])
    .filter((c) => c.type === "toolCall");

export const createSessionItemElement = (role, content, narrativization?: any, usage?: Usage) => {
  const isOpen = reactive(true);
  let element = ['div.session-item', { role, open: isOpen }];

  if (!content && !narrativization) {
    console.log("BRUH EMPTY MESSAGE ???");
    return dom(['span', 'empty']);
  }

  narrativization ? element.push(narrativization) : null;
  Array.isArray(content) ? element.push(...content) : element.push(content);
  usage ? element.push(usage) : null;

  return dom(element);
};

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

  return createSessionItemElement(item.role, MD(getText(item)));
};

const createRawSessionItem = (item) => {
  return dom(['pre', {
    class: 'session-item'
  }, JSON.stringify(item, null, 2)]);
};

export const renderSessionItem = (item, strategy: string) => {
  if (strategy === 'RAW') {
    return createRawSessionItem(item);
  } else {
    return createMarkdownSessionItem(item);
  }
};
