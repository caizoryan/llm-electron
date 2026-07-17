import { dom } from './lib/dom.js';
import { memo } from './lib/chowk.js';
import { models } from '../models.js';
import { state, DEFAULT_CWD } from './state.js';

const THINKING_STATES = ['low', 'medium', 'high'];

export const createStrategyControls = () => {
  return dom(['.buttons',
    ['button', { onclick: () => state.renderingStrategy.next('MD') }, 'MD'],
    ['button', { onclick: () => state.renderingStrategy.next('RAW') }, 'RAW'],
  ]);
};

export const createModelDropdown = () => {
  return dom(['select.model-select',
    {
      onchange: (e) => state.currentModel.next(e.target.value)
    },
    memo(() => models.filter(e => e.api != 'anthropic').map(m => {
      let opts: any = { value: m.id };
      m.id === state.currentModel.value() ? opts.selected = true : null;
      return ['option', opts, m.name];
    }), [state.currentModel])
  ]);
};

export const createThinkingToggle = () => {
  return dom(['button.small',
    {
      onclick: () => {
        const current = state.thinkingMode.value();
        const nextIndex = (THINKING_STATES.indexOf(current) + 1) % THINKING_STATES.length;
        state.thinkingMode.next(THINKING_STATES[nextIndex]);
      }
    },
    memo(() => `Think: ${state.thinkingMode.value()}`, [state.thinkingMode])
  ]);
};

export const createCwdPicker = () => {
  return dom(['button.cwd-picker.small',
    {
      onclick: () => state.isCwdModalOpen.next(true),
      title: 'Change working directory',
    },
    memo(() => state.currentCwd.value(), [state.currentSession, state.currentCwd]),
  ]);
};

export const createCwdModal = (editorMount: HTMLElement) => {
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

export const createAgentRunningIndicator = () => {
  const indicator = dom(['span.agent-running-indicator']);

  state.isAgentRunning.subscribe((running) => {
    indicator.classList.toggle('active', running);
  });

  return indicator;
};
