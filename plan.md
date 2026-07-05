# Development Plan

## 1. Thinking Level Control

- [ ] Add dropdown UI component to session renderer
- [ ] Create reactive state for thinking level in frontend
- [x] Research how to add thinking level parameter to zAPI
- [ ] Update `runAgentTurn` and `startAgentLoop` to accept thinking level parameter
- [ ] Pass thinking level to zAPI request body
- [ ] Connect frontend dropdown to agent calls

> documentation for parameter: 
reasoning_effort
enum<string>
default:max 
Controls the model's reasoning effort level, takes effect when thinking is enabled. Default is max. Only supported by GLM-5.2. For compatibility with other protocols, passing none or minimal will cause the model to skip thinking; low and medium will be mapped to high; xhigh will be mapped to max.
Available options: max, xhigh, high, medium, low, minimal, none
Example: "max"

> UI will manage thinking level state. When changed, frontend passes it to agent on next prompt. No events needed for UI updates. Session persistence not required.

## 2. CodeMirror Editor for Prompt Input

- [x] Add CodeMirror static JS files to repo
- [x] Replace `<textarea>` with CodeMirror editor instance
- [x] Configure basic options (line numbers, markdown mode, theme)
- [x] Map keyboard shortcuts (Enter to submit, Shift+Enter for newline, Cmd/Ctrl+Enter to submit)
- [x] Implement auto-resize behavior
- [ ] Set up focus management (auto-focus on load and after submission)
- [ ] Create custom autocompletion source using `fs.listFiles`
- [ ] Trigger autocomplete on `/`, `./`, `~` characters
- [ ] Configure syntax highlighting for markdown, JavaScript, JSON, Python

> CodeMirror will be imported as static, pre-compiled JS files for browser use—no Node.js required. No caching for autocomplete results.
> **Completed:** Basic CodeMirror with vim mode and `:w` to submit. Auto-resize with max-height 300px. Took 25 mins.

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

## 9. Root Directory for Tool Calls (CWD) — Research Task

- [ ] Research where session/project state should live (session file, separate project config, in-memory)
- [ ] Research how tool path resolution should be handled (`agent/callFunction.js`, `agent/tools.js`, or `fs.js`)
- [ ] Determine how to pass `cwd` through `startAgentLoop` → `runAgentTurn` → `callFunction`
- [ ] Decide if `cwd` should persist across reloads and where (session metadata vs project config)
- [ ] Decide UI location for cwd display/control (`sessionRenderer.js` session header, prompt area, etc.)
- [ ] Check if OpenCode Go API supports cwd-aware tool calls natively or if resolution happens locally
- [ ] Document findings before implementation

## 10. Folder-Based Session Organization

- [ ] **Research**: Review https://github.com/Dwsy/pi-session-manager/tree/main for design patterns
- [ ] Update `listSessions` function to handle folder paths (e.g., `sessions/project1/session.json`)
- [ ] Create folder metadata file or use directory structure for folders
- [ ] Add "New Folder" button in session list UI
- [ ] Implement `createFolder(path)` and `deleteFolder(path)` in fs layer
- [ ] Update session renderer to show hierarchical folder/tree structure
- [ ] Add folder collapse/expand in session list
- [ ] Add drag-and-drop to move sessions between folders
- [ ] Update session file paths when folders are renamed/moved

## 11. Per-Message Tool Selection

- [ ] Create tool selection UI panel before message submission (checkboxes for each available tool)
- [ ] Modify `agent/tools.js` `tools` array to be filterable per call
- [ ] Pass `selectedTools` to `startAgentLoop` in `agent.js`
- [ ] Filter tools before sending to API in `callZAPI` function
- [ ] Add visual indicator of active tools in session UI

## 12. Model Selection

- [ ] Research available models in OpenCode Go API (endpoint, model list, parameter format)
- [ ] Create a file documenting available model details (e.g., `models.json` or `models.md`)
- [ ] Add `model` reactive state in frontend
- [ ] Add model selection dropdown UI in session header
- [ ] Update `callZAPI` in `agent/agent.js` to use selected model instead of hardcoded `GLM-4.7`
- [ ] Selected model is used per message, no persistence required

## 13. Token Usage Tracking

- [ ] Research how to extract token usage from OpenCode Go API responses
- [ ] Add token usage display in session UI (per message and total session)
- [ ] Accumulate token counts across assistant/tool turns
- [ ] Add cost estimation if model pricing is available
- [ ] Display context window utilization (used vs max tokens)

## Notes
- CodeMirror static files: Will import pre-compiled JS for browser use
- Thinking level: Research zAPI documentation for exact parameter name and format
- Session metadata: Requires significant file structure redesign—consult PI's design first
- Permissions & bash: Research-heavy tasks, may require additional runs for implementation
- CWD: Implementation approach TBD pending research
- Model selection: `callZAPI` already targets OpenCode Go API, only needs model parameter wiring
