# Frontend Architecture Report

## What is the Frontend

The frontend is a **session viewer** application for viewing LLM chat sessions stored as JSON files. It runs in an Electron environment and provides:

- File browsing for LLM session files from a directory (`~/.llm_sessions/`)
- Session rendering with support for different message types (system, user, assistant, tool)
- Markdown rendering for message content
- Tool call visualization (function name, arguments, results)
- Toggle between rendered (MD) and raw JSON views

---

## Main Components

### 1. **Entry Point** (`index.html`)
Minimal HTML shell that loads `renderer.js` module and `styles.css`.

### 2. **Session Browser** (`renderer.js`)
- Lists available session files from the sessions directory
- Handles session selection
- Manages global state for current session path

### 3. **Session Renderer** (`sessionRenderer.js`)
- Parses and renders session JSON content
- Supports multiple rendering strategies (MD/RAW)
- Handles different message types and tool calls

### 4. **DOM Library** (`lib/dom.js`)
- Custom declarative DOM creation system
- Array-based component syntax
- Built-in reactivity support

### 5. **Reactivity System** (`lib/chowk.js`)
- Simple reactive state management
- Subscription-based updates
- `reactive()` and `memo()` utilities

### 6. **Markdown Parser** (`md.js`)
- Wrapper around `markdown-it`
- Converts markdown to DOM-compatible array format

---

## Structure

```
frontend/
├── index.html              # Entry point
├── styles.css              # Global styles
├── renderer.js             # Main application logic
├── sessionRenderer.js      # Session rendering logic
├── md.js                   # Markdown to DOM converter
├── archive.js              # Legacy/unused file
├── structure.md            # Development notes
└── lib/
    ├── dom.js              # DOM creation library
    ├── chowk.js            # Reactivity primitives
    └── markdown-it/        # Markdown parsing library
```

---

## Main Classes, IDs, and Structure

### IDs
- `#sessionList` - Session file list container
- `#fileInput` - File path input (archived)
- `#output` - Textarea for file content (archived)

### Classes
- `.session` - Session container wrapper
- `.session-renderer` - Main renderer container
- `.session-item` - Individual message item
- `.session-item.system` - System message styling
- `.role` - Message role label (system/user/assistant/tool)
- `.tool-calls` - Tool calls container
- `.tool-call` - Individual tool call
- `.tool-name` - Function name display
- `.tool-args` - Tool arguments container
- `.buttons` - Toggle button container

### Data Structure
**Session JSON format:**
```javascript
[
  {
    role: 'system' | 'user' | 'assistant' | 'tool',
    content: string,
    tool_calls?: [{          // for assistant
      id: string,
      function: {
        name: string,
        arguments: string   // JSON stringified
      }
    }],
    tool_call_id?: string    // for tool responses
  }
]
```

---

## Programming Patterns

### 1. **DOM Creation - Declarative Array Syntax**

The `dom()` function accepts an array-based syntax for creating elements:

```javascript
// Format: [selector?, attributes?, ...children]
dom(['ul#sessionList',
  ['li', { onclick: handler }, filename],
  ['li', { class: 'active' }, 'other.txt']
])
```

**Selector parsing:**
- `.class` - CSS classes
- `#id` - Element ID
- First token without prefix = element tag name
- Default element is `div`

### 2. **Reactivity System**

**State creation with `reactive()`:**
```javascript
let currentSession = reactive('')

// Subscribe to changes
currentSession.subscribe((path) => {
  console.log('New path:', path)
})

// Update value
currentSession.next('/path/to/file')
```

**Computed values with `memo()`:**
```javascript
let derived = memo(() => state.currentSession.value().toUpperCase(), [state.currentSession])
```

### 3. **Reactive DOM Integration**

The `dom()` function automatically handles reactive values:

```javascript
// Reactive text content
dom(['span', reactiveValue])

// Reactive attributes
dom(['input', { value: reactiveValue }])

// Reactive children (arrays)
dom(['ul', reactiveList])
```

### 4. **Subscription-based Updates**

Instead of direct DOM manipulation, components subscribe to state changes:

```javascript
state.currentSession.subscribe(async (path) => {
  const content = await readFile(path)
  state.parsedSession = parseSessionContent(content)
  renderSession(state.parsedSession)
})
```

### 5. **Markdown to DOM Pipeline**

```
Markdown string
    ↓
markdown-it.parse() → Token array
    ↓
eat() → DOM array format
    ↓
dom() → Actual DOM elements
```

### 6. **Strategy Pattern for Rendering**

```javascript
const STRATEGY = reactive('MD') // 'MD' | 'RAW'

const renderSessionItem = (item) => {
  if (STRATEGY.value() == 'RAW') return sessionItemRAW(item)
  else return sessionItemMD(item)
}
```

### 7. **Electron IPC Bridge**

```javascript
const readFile = async (filePath) => window.electronAPI.readFile([filePath])
const writeFile = async (path, content) => window.electronAPI.writeFile([path, content])
const listFiles = async (path) => window.electronAPI.listFiles([path])
```

### 8. **Progressive Enhancement Pattern**

Tool call results are appended to their corresponding requests via a mapping:

```javascript
const toolCallRequests = {} // Maps tool_call_id to DOM element

// Create tool call with ID
toolCallRequests[tool_call.id] = dom(['div.tool-call', ...])

// Later, append result to same element
toolCallRequests[item.tool_call_id]?.appendChild(toolResult)
```

---

## Key Design Principles

1. **Minimal HTML** - Almost all UI is generated via JavaScript
2. **Array-based DSL** - Components are described as nested arrays
3. **Push-based reactivity** - Updates flow through subscriptions
4. **Separation of concerns** - Browsing, rendering, and parsing are separate modules
5. **No virtual DOM** - Direct DOM manipulation with diffing for reactive arrays