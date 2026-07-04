# Development Plan

## 1. Thinking Level Control

- [ ] Add dropdown UI component to session renderer
- [ ] Create reactive state for thinking level in frontend
- [ ] Research how to add thinking level parameter to zAPI
- [ ] Update `runAgentTurn` and `startAgentLoop` to accept thinking level parameter
- [ ] Pass thinking level to zAPI request body
- [ ] Connect frontend dropdown to agent calls

> UI will manage thinking level state. When changed, frontend passes it to agent on next prompt. No events needed for UI updates. Session persistence not required.

## 2. CodeMirror Editor for Prompt Input

- [ ] Add CodeMirror static JS files to repo
- [ ] Replace `<textarea>` with CodeMirror editor instance
- [ ] Configure basic options (line numbers, markdown mode, theme)
- [ ] Map keyboard shortcuts (Enter to submit, Shift+Enter for newline, Cmd/Ctrl+Enter to submit)
- [ ] Implement auto-resize behavior
- [ ] Set up focus management (auto-focus on load and after submission)
- [ ] Create custom autocompletion source using `fs.listFiles`
- [ ] Trigger autocomplete on `/`, `./`, `~` characters
- [ ] Configure syntax highlighting for markdown, JavaScript, JSON, Python

> CodeMirror will be imported as static, pre-compiled JS files for browser use—no Node.js required. No caching for autocomplete results.

## 3. CodeMirror for Code Blocks in Messages

- [ ] Modify `md.js` to detect language in markdown code blocks
- [ ] Replace `<pre>` code blocks with CodeMirror instances for multi-line blocks
- [ ] Add styling for code block editors (read-only, minimal UI)
- [ ] Ensure code blocks remain collapsible within foldable messages

> Only multi-line `<pre>` items will get CodeMirror. Language will be detected during markdown parsing in `md.js`.

## 4. Session Forking

- [ ] Add "Fork" button to each session in session list
- [ ] Create modal for naming forked session
- [ ] Implement `copySessionFile(originalPath, newPath)` function
- [ ] Handle unique naming conflicts (append `_1`, `_2`, etc.)
- [ ] Refresh session list after forking
- [ ] Automatically load new forked session after creation
- [ ] Add "Forked from: {original}" indicator in session header
- [ ] Add fork icon/badge in session list

> Metadata tracking requires complete session file redesign. Research PI's design for this. Also add timestamps.

## 5. Session File Redesign

- [ ] Research PI's session file design
- [ ] Design new session file structure with metadata section
- [ ] Add fields: `created_at`, `updated_at`, `forked_from`, `thinking_level`, etc.
- [ ] Migrate existing session files to new format (or support both)
- [ ] Update file read/write functions to handle new structure

> Complete redesign needed to support metadata like timestamps and fork tracking.

## 6. Session Management Enhancements

- [ ] Add delete button to session items
- [ ] Implement delete session function (with confirmation)
- [ ] Add rename button to session items
- [ ] Implement rename session function (reusing existing modal)
- [ ] Update session list refresh after delete/rename operations

## 7. Permissions Gate

- [ ] Research permission gating implementation
- [ ] Design permission model (read/write/execute per directory or file)
- [ ] Create permission checking functions
- [ ] Integrate with tool execution layer
- [ ] Add UI for managing permissions

> Research required for permissions gate and bash execution.

## 8. Bash Execution

- [ ] Research bash execution implementation in browser environment
- [ ] Design safe execution model (sandboxed, limited commands)
- [ ] Implement bash tool for agent
- [ ] Add output streaming for bash commands
- [ ] Add permission checks before execution

> Research required for permissions gate and bash execution.

---

# Plan of Action

## Implementation Order & Time Estimates

### Run 1 (45 min) - CodeMirror Setup for Prompt Input
- Add CodeMirror static JS files to repo
- Replace `<textarea>` with CodeMirror instance
- Configure basic options and test basic functionality

### Run 2 (45 min) - CodeMirror Input Enhancements
- Implement keyboard shortcuts
- Add auto-resize and focus management
- Test submission flow

### Run 3 (45 min) - Thinking Level UI & State
- Add dropdown to session renderer
- Create reactive state for thinking level
- Test dropdown functionality

### Run 4 (45 min) - Thinking Level Agent Integration
- Research zAPI thinking level parameter
- Update agent functions to accept thinking level
- Connect frontend to agent calls
- Test different thinking levels

### Run 5 (45 min) - File Autocomplete
- Create custom autocompletion source using `fs.listFiles`
- Implement trigger characters and suggestions
- Test autocomplete for file paths

### Run 6 (45 min) - Code Blocks in Messages (Part 1)
- Modify `md.js` to detect code block languages
- Add logic to identify multi-line code blocks

### Run 7 (45 min) - Code Blocks in Messages (Part 2)
- Replace multi-line `<pre>` blocks with CodeMirror instances
- Style read-only code editors
- Test with various languages

### Run 8 (45 min) - Session Forking (Part 1)
- Add fork button and rename modal
- Implement `copySessionFile` function
- Test basic forking flow

### Run 9 (45 min) - Session Forking (Part 2)
- Handle unique naming conflicts
- Add visual indicators (forked from, badges)
- Test full forking workflow

### Run 10 (45 min) - Session Management
- Add delete and rename functionality
- Implement confirmation dialogs
- Test all session management operations

### Run 11 (45 min) - Session File Redesign (Part 1)
- Research PI's session file design
- Design new structure with metadata section

### Run 12 (45 min) - Session File Redesign (Part 2)
- Implement new file structure read/write
- Add migration logic for existing files
- Test backward compatibility

### Run 13 (45 min) - Permissions Research & Design
- Research permission gating implementation
- Design permission model
- Document approach

### Run 14 (45 min) - Bash Execution Research & Design
- Research bash execution in browser
- Design safe execution model
- Document approach

### Run 15 (45 min) - Polish & Testing
- Full integration testing
- Bug fixes
- UI polish

---

## Notes

- CodeMirror static files: Will import pre-compiled JS for browser use
- Thinking level: Research zAPI documentation for exact parameter name and format
- Session metadata: Requires significant file structure redesign—consult PI's design first
- Permissions & bash: Research-heavy tasks, may require additional runs for implementation