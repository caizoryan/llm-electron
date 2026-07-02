# Frontend Improvements

## 1. Configuration & Environment

### Current Issues
- Hardcoded user-specific paths (`SESSIONS_DIRECTORY = '/Users/aaryan/.llm_sessions/'`)
- No configuration file or environment variable support
- Difficult to deploy for different users

### Proposed Changes
```
config/
├── index.js          # Config loader
├── defaults.js       # Default values
└── user.config.js    # User overrides (gitignored)
```

```javascript
// config/index.js
const defaults = {
  SESSIONS_DIRECTORY: process.env.LLM_SESSIONS_DIR || '~/.llm_sessions/',
  TOKEN_ESTIMATION_RATIO: 4,
  DEFAULT_RENDER_STRATEGY: 'MD'
};

export default { ...defaults, ...userConfig };
```

---

## 2. Module Organization

### Current Issues
- `renderer.js` mixes session browsing with session rendering
- Global variables scattered across files
- Unclear module boundaries
- `estimateTokens` and `estimateContextSize` duplicated in multiple files

### Proposed Structure
```
src/
├── index.js                 # Entry point
├── config/                  # Configuration
├── services/
│   ├── electron.js          # IPC bridge abstraction
│   ├── fileService.js       # File operations
│   └── sessionService.js    # Session-specific operations
├── components/
│   ├── App.js               # Root component
│   ├── SessionBrowser.js    # Session list viewer
│   ├── SessionRenderer.js   # Session content viewer
│   ├── SessionItem.js       # Individual message item
│   ├── ToolCall.js          # Tool call display
│   └── ToggleButtons.js     # MD/RAW toggle
├── utils/
│   ├── tokenEstimator.js    # Token counting logic
│   ├── sessionParser.js     # JSON parsing/validation
│   └── constants.js         # App constants
└── lib/                     # Third-party/custom libraries
    ├── dom.js
    ├── chowk.js
    └── md.js
```

---

## 3. Code Duplication

### Current Issues
- `estimateTokens` defined in both `renderer.js` and `sessionRenderer.js`
- `estimateContextSize` also duplicated
- IPC API wrapper functions repeated

### Proposed Changes
```javascript
// src/utils/tokenEstimator.js
export const estimateTokens = (text) => Math.ceil(text.length / 4);

export const estimateContextSize = (parsed) => {
  if (!Array.isArray(parsed)) return estimateTokens(String(parsed));
  return parsed.reduce((total, item) => {
    return total + (item.content ? estimateTokens(item.content) : 0);
  }, 0);
};

export const estimateItemSize = (item) => {
  if (item.tool_calls) {
    return estimateTokens(JSON.stringify(item.tool_calls));
  }
  return estimateTokens(item.content || '');
};
```

---

## 4. State Management

### Current Issues
- Global `state` object mixed with component logic
- `toolCallRequests` is a mutable global object
- No centralized state store
- Hard to track state flow

### Proposed Changes
```javascript
// src/stores/sessionStore.js
import { reactive } from '../lib/chowk.js';

export const createSessionStore = () => ({
  currentSessionPath: reactive(''),
  parsedSession: reactive(null),
  renderStrategy: reactive('MD'),
  isLoading: reactive(false),
  error: reactive(null),
  
  selectSession(path) {
    this.currentSessionPath.next(path);
  },
  
  setParsedSession(session) {
    this.parsedSession.next(session);
  },
  
  setRenderStrategy(strategy) {
    this.renderStrategy.next(strategy);
  }
});

export const sessionStore = createSessionStore();
```

---

## 5. Service Layer

### Current Issues
- Electron IPC calls scattered throughout components
- No error handling abstraction
- File path construction mixed with UI logic
- Difficult to test without Electron

### Proposed Changes
```javascript
// src/services/fileService.js
export class FileService {
  constructor(electronAPI) {
    this.api = electronAPI;
  }

  async readFile(filePath) {
    const result = await this.api.readFile([filePath]);
    if (!result.success) {
      throw new FileServiceError('READ_FAILED', result.error);
    }
    return result.content;
  }

  async writeFile(filePath, content) {
    const result = await this.api.writeFile([filePath, content]);
    if (!result.success) {
      throw new FileServiceError('WRITE_FAILED', result.error);
    }
    return result;
  }

  async listFiles(directoryPath) {
    const result = await this.api.listFiles([directoryPath]);
    if (!result.success) {
      throw new FileServiceError('LIST_FAILED', result.error);
    }
    return result.files;
  }
}
```

```javascript
// src/services/sessionService.js
import { FileService } from './fileService.js';
import { parseSession, validateSession } from '../utils/sessionParser.js';

export class SessionService {
  constructor(fileService, config) {
    this.fileService = fileService;
    this.sessionsDir = config.SESSIONS_DIRECTORY;
  }

  async listSessions() {
    return this.fileService.listFiles(this.sessionsDir);
  }

  async loadSession(filename) {
    const path = `${this.sessionsDir}/${filename}`;
    const content = await this.fileService.readFile(path);
    const session = parseSession(content);
    validateSession(session);
    return session;
  }

  async saveSession(filename, session) {
    const path = `${this.sessionsDir}/${filename}`;
    const content = JSON.stringify(session, null, 2);
    return this.fileService.writeFile(path, content);
  }
}
```

---

## 6. Component Architecture

### Current Issues
- Components are functions that return DOM elements directly
- No clear separation between logic and view
- Props and state handling is implicit
- Difficult to reuse components

### Proposed Changes
```javascript
// src/components/SessionItem.js
import { dom } from '../lib/dom.js';
import { MD } from '../lib/md.js';
import { estimateItemSize } from '../utils/tokenEstimator.js';

export const SessionItem = (item, options = {}) => {
  const { showTokenCount = true, onRoleClick = null } = options;

  const roleEl = dom(['div.role', 
    item.role,
    showTokenCount ? ` (${estimateItemSize(item)})` : ''
  ]);

  if (onRoleClick) {
    roleEl.style.cursor = 'pointer';
    roleEl.onclick = () => onRoleClick(item);
  }

  const contentEl = MD(item.content);

  return dom(['div.session-item', { role: item.role }, roleEl, ...contentEl]);
};
```

---

## 7. Error Handling

### Current Issues
- Inconsistent error handling
- Some errors silently caught
- No user-friendly error messages
- Console.log debugging left in production code

### Proposed Changes
```javascript
// src/utils/errors.js
export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export class SessionError extends AppError {
  constructor(code, message, session) {
    super(code, message, { session });
    this.name = 'SessionError';
  }
}

export class FileServiceError extends AppError {
  constructor(code, message, path) {
    super(code, message, { path });
    this.name = 'FileServiceError';
  }
}
```

```javascript
// Error boundary component
export const ErrorBoundary = ({ fallback, children }) => {
  try {
    return children;
  } catch (error) {
    console.error('Error caught by boundary:', error);
    return fallback || dom(['div.error', 
      ['h3', 'Something went wrong'],
      ['p', error.message]
    ]);
  }
};
```

---

## 8. Type Safety (JSDoc)

### Current Issues
- No type annotations
- Function signatures unclear
- IDE autocomplete limited
- Easy to pass wrong data types

### Proposed Changes
```javascript
/**
 * @typedef {'system'|'user'|'assistant'|'tool'} SessionRole
 * 
 * @typedef {Object} ToolCall
 * @property {string} id
 * @property {{name: string, arguments: string}} function
 * 
 * @typedef {Object} SessionItem
 * @property {SessionRole} role
 * @property {string} [content]
 * @property {ToolCall[]} [tool_calls]
 * @property {string} [tool_call_id]
 * 
 * @typedef {SessionItem[]} Session
 */

/**
 * Estimates token count for text (rough approximation)
 * @param {string} text - Input text
 * @returns {number} Estimated token count
 */
export const estimateTokens = (text) => Math.ceil(text.length / 4);

/**
 * Renders a session item based on role and content
 * @param {SessionItem} item - Session item to render
 * @param {Object} options - Rendering options
 * @returns {HTMLElement} Rendered DOM element
 */
export const SessionItem = (item, options = {}) => { ... };
```

---

## 9. Testing Infrastructure

### Current Issues
- No tests at all
- Difficult to add tests due to tight coupling
- Electron dependency makes unit testing hard

### Proposed Changes
```
tests/
├── unit/
│   ├── utils/
│   │   ├── tokenEstimator.test.js
│   │   └── sessionParser.test.js
│   └── components/
│       └── SessionItem.test.js
├── integration/
│   └── sessionService.test.js
└── __mocks__/
    └── electronAPI.js
```

```javascript
// tests/unit/utils/tokenEstimator.test.js
import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateContextSize } from '../../src/utils/tokenEstimator.js';

describe('tokenEstimator', () => {
  it('estimates tokens for short text', () => {
    expect(estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25 -> ceil = 2
  });

  it('calculates context size for session', () => {
    const session = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' }
    ];
    expect(estimateContextSize(session)).toBe(5);
  });
});
```

---

## 10. Build & Development

### Current Issues
- No build process
- No development tooling
- No linting or formatting
- No hot reload

### Proposed Changes
```json
{
  "name": "llm-session-viewer",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src/",
    "format": "prettier --write src/",
    "test": "vitest"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 11. Documentation

### Current Issues
- Minimal inline documentation
- No API documentation
- No contribution guidelines
- No architecture overview

### Proposed Changes
```
docs/
├── README.md              # Project overview
├── ARCHITECTURE.md        # System design
├── API.md                 # Component/service APIs
├── CONTRIBUTING.md        # Development guide
└── DEPLOYMENT.md          # Deployment instructions
```

---

## 12. CSS Organization

### Current Issues
- Single large CSS file
- No clear naming conventions
- No CSS variables for all values
- Media queries not organized

### Proposed Changes
```
styles/
├── base/
│   ├── variables.css      # CSS custom properties
│   ├── reset.css          # Base styles
│   └── typography.css     # Typography
├── components/
│   ├── session-browser.css
│   ├── session-renderer.css
│   ├── session-item.css
│   └── buttons.css
├── utilities/
│   └── helpers.css        # Utility classes
└── main.css               # Entry point that imports all
```

---

## 13. Performance Optimizations

### Current Issues
- Full re-render on strategy change
- No memoization of expensive operations
- Token estimation runs on every render
- Large sessions may freeze UI

### Proposed Changes
```javascript
// Memoize expensive operations
const createMemoizedRenderer = () => {
  const cache = new Map();
  
  return (item, strategy) => {
    const key = `${strategy}-${JSON.stringify(item)}`;
    if (cache.has(key)) return cache.get(key).cloneNode(true);
    
    const rendered = renderSessionItem(item, strategy);
    cache.set(key, rendered);
    return rendered;
  };
};

// Virtual scrolling for large sessions
const VirtualList = ({ items, itemHeight, containerHeight }) => {
  const visibleRange = calculateVisibleRange(scrollTop, itemHeight, containerHeight);
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  // Render only visible items
};
```

---

## 14. Accessibility

### Current Issues
- No ARIA labels
- Keyboard navigation not implemented
- No screen reader support
- Focus management missing

### Proposed Changes
```javascript
// Accessible session list item
const SessionListItem = (file, isActive, onSelect) => dom([
  'li', {
    role: 'button',
    tabindex: '0',
    'aria-selected': isActive,
    'aria-label': `Session: ${file}`,
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(file);
      }
    },
    onclick: () => onSelect(file)
  },
  file
]);
```

---

## Migration Priority

### High Priority (Do First)
1. Extract configuration to separate file
2. Remove code duplication (token estimation)
3. Add error handling layer
4. Create service layer for IPC calls

### Medium Priority
5. Reorganize module structure
6. Add JSDoc type annotations
7. Split CSS into components
8. Add basic tests

### Low Priority
9. Set up build tooling
10. Add comprehensive documentation
11. Accessibility improvements
12. Performance optimizations