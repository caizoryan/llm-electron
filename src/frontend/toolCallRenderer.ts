import { dom } from './lib/dom.js';
import { memo, reactive } from './lib/chowk.js';
import { highlightCode } from './lib/md.js';
import { getPromptEditor } from './editor.js';
import { getText } from './messageRenderer.js';

const MAX_FUNC_PREVIEW_LINES = 6;

const toolCallElements = new Map<string, HTMLElement>();

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ToolCallRenderer = (toolCall: ToolCall) => HTMLElement;

type EvaluatedRenderFn = (library: { dom: typeof dom; reactive: typeof reactive; memo: typeof memo }, callback: (answer: string) => void) => HTMLElement;

const createCollapsibleFuncArg = (funcStr: string) => {
  const funcLines = funcStr.split('\n');
  const isExpanded = reactive(false);
  const remaining = funcLines.length - MAX_FUNC_PREVIEW_LINES;

  return ['.tool-args',
    ['p.key', 'func'],
    memo(() => {
      const visible = isExpanded.value()
        ? funcStr
        : funcLines.slice(0, MAX_FUNC_PREVIEW_LINES).join('\n');
      return highlightCode(visible, 'javascript');
    }, [isExpanded]),
    memo(() => isExpanded.value()
      ? ['div.func-collapse-toggle', { onclick: () => isExpanded.next(false) }, '(show fewer lines...)']
      : ['div.func-collapse-toggle', { onclick: () => isExpanded.next(true) }, `(show ${remaining} more lines...)`],
    [isExpanded]),
  ];
};

const renderArgScalar = (v: any): any => {
  if (v === null) return ['pre.value', 'null'];
  if (typeof v === 'string') return ['pre.value', v];
  if (Array.isArray(v)) return renderArgArray(v);
  if (typeof v === 'object') return renderArgObject(v);
  return ['pre.value', JSON.stringify(v)];
};

const renderArgArray = (arr: any[]): any =>
  ['.array', ...arr.map(renderArgScalar)];

const renderArgObject = (obj: object): any =>
  ['.object', ...Object.entries(obj).map(([key, val]) =>
    ['.tool-args', ['p.key', key], renderArgScalar(val)]
  )];

const renderSpecialToolArgs = (argsObj: Record<string, any>) =>
  Object.entries(argsObj).map(([key, val]) =>
    key === 'func'
      ? createCollapsibleFuncArg(String(val))
      : ['.tool-args', ['p.key', key], renderArgScalar(val)]
  );

const runEvalRenderer = (
  funcStr: string,
  buildElement: (fn: EvaluatedRenderFn) => HTMLElement
): HTMLElement => {
  const wrapper = dom(['div.render-html-container', { style: 'border: 1px solid currentColor; padding: 8px; margin: 4px 0;' }]);

  try {
    // eslint-disable-next-line no-eval
    const fn = eval(funcStr);
    if (typeof fn !== 'function') {
      wrapper.appendChild(dom(['div', { style: 'color: red;' }, 'Error: eval did not produce a function']));
      return wrapper;
    }
    wrapper.appendChild(buildElement(fn));
  } catch (err) {
    wrapper.appendChild(dom(['div', { style: 'color: red;' }, 'Error: ' + err.message]));
  }

  return wrapper;
};

const createMinimizedToolCall = (toolCall: ToolCall) => {
  const functionName = toolCall.name;
  const args = JSON.parse(toolCall.arguments);

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
    ]
  ]);
};

const renderGenericToolCall = (toolCall: ToolCall): HTMLElement =>
  dom(['div.tool-call',
    ['div.tool-name', toolCall.name],
    renderArgObject(JSON.parse(toolCall.arguments))
  ]);

const renderHtmlToolCall = (toolCall: ToolCall): HTMLElement => {
  const argsObj = JSON.parse(toolCall.arguments);
  return dom(['div.tool-call',
    ['div.tool-name', toolCall.name],
    ['div.object', ...renderSpecialToolArgs(argsObj)],
    runEvalRenderer(argsObj.func, (fn) => {
      const el = fn();
      return el instanceof HTMLElement
        ? el
        : dom(['div', { style: 'color: red;' }, 'Error: function did not return an HTMLElement']);
    })
  ]);
};

const renderInteractiveQuestionToolCall = (toolCall: ToolCall): HTMLElement => {
  const argsObj = JSON.parse(toolCall.arguments);
  return dom(['div.tool-call',
    ['div.tool-name', toolCall.name],
    ['div.object', ...renderSpecialToolArgs(argsObj)],
    runEvalRenderer(argsObj.func, (fn) => {
      const callback = (answer: any) => {
        if (typeof answer !== 'string') {
          console.error('render-interactive-question callback expected a string, got:', typeof answer);
          return;
        }
        const editor = getPromptEditor();
        if (!editor) {
          console.error('render-interactive-question: prompt editor not available');
          return;
        }
        const docLength = editor.state.doc.length;
        editor.dispatch({
          changes: { from: docLength, to: docLength, insert: answer }
        });
      };

      const el = fn({ dom, reactive, memo }, callback);
      return el instanceof HTMLElement
        ? el
        : dom(['div', { style: 'color: red;' }, 'Error: function did not return an HTMLElement']);
    })
  ]);
};

const specialToolCallRenderers: Record<string, ToolCallRenderer> = {
  'render-html': renderHtmlToolCall,
  'render-interactive-question': renderInteractiveQuestionToolCall,
};

export const createToolCallItem = (item: { role: string; tool_calls: ToolCall[] }) => {
  const isOpen = reactive(false);
  const expandedToolCalls = ['div.tool-calls'];
  const minimizedToolCalls = ['div.tool-calls', { onclick: () => isOpen.next(value => !value) }];

  item.tool_calls.forEach(toolCall => {
    const renderer = specialToolCallRenderers[toolCall.name] ?? renderGenericToolCall;
    const toolCallEl = renderer(toolCall);
    toolCallElements.set(toolCall.id, toolCallEl);

    expandedToolCalls.push(toolCallEl);
    minimizedToolCalls.push(createMinimizedToolCall(toolCall));
  });

  return dom(['div.session-item.tool', { role: item.role },
    memo(() => isOpen.value()
      ? expandedToolCalls
      : minimizedToolCalls,
      [isOpen])
  ]);
};

export const createToolCallResult = (item: { toolCallId: string; content: any[] }) => {
  const text = getText(item);
  const toolResult = dom(['div.tool-result', ['pre', text]]);
  const callEl = toolCallElements.get(item.toolCallId);
  callEl?.appendChild(toolResult);

  return dom(['span']);
};
