# Implementation Phases

## Phase E — File Redesign (Critical Path)

**Session File Redesign (#5)**
- [x] Research PI's session file design
- [x] Design new schema: `created_at`, `updated_at`, `forked_from`, `thinking_level`, etc.
- [x] Migrate existing sessions or support both formats
- [x] Update read/write functions

> Blocks #4, #9, #10.


## Phase D — Session Management

**Session Management Enhancements (#6)**
- [ ] Delete button on session items (with confirmation)
- [ ] Delete session function in fs layer
- [ ] Rename button on session items
- [ ] Rename session function (reuse existing modal)
- [ ] Refresh session list after operations


## Phase F — Forking

**Session Forking (#4)**
- [ ] Fork button in session list
- [ ] Naming modal with conflict resolution (`_1`, `_2`, etc.)
- [ ] `copySessionFile()` in fs layer
- [ ] Refresh session list, auto-load new session
- [ ] "Forked from: {original}" indicator in header


## Phase G — CWD

**Root Directory for Tool Calls (#9)**
- [ ] Research: where state lives, path resolution, OpenCode Go API support
- [ ] Determine `cwd` threading path (`startAgentLoop` → `callFunction`)
- [ ] UI placement for cwd display/control
- [ ] Implement after findings



## Phase H — Folder Organization

**Folder-Based Sessions (#10)**
- [ ] Research PI's session-manager design patterns
- [ ] Update `listSessions` for hierarchical paths
- [ ] `createFolder` / `deleteFolder` in fs layer
- [ ] Tree UI: collapse/expand, new folder button, drag-and-drop
- [ ] Update paths when folders renamed/moved



## Phase A — Polish & Wiring

**Prompt Input (#2 — remaining)**
- [ ] Focus management — auto-focus on load and after submission
- [ ] Custom autocomplete source using `fs.listFiles`
- [ ] Trigger autocomplete on `/`, `./`, `~`

**Custom Model Dropdown (#13)**
- [ ] Replace native `<select>` with custom styled dropdown
- [ ] Click-to-open, option overlay, close on outside click
- [ ] Animate open/close, match app aesthetic

**Thinking Level (#1)**
- [ ] Add reactive state in frontend
- [ ] Add dropdown UI to session renderer
- [ ] Thread `thinking_level` through `startAgentLoop` → `runAgentTurn` → API
- [ ] Same wiring pattern as model selection (#12)

**Token Usage Tracking (#14)**
- [ ] Extract token counts from OpenCode Go API response
- [ ] Display per-message and session totals in UI
- [ ] Accumulate across assistant/tool turns
- [ ] Add cost estimation where pricing is available



## Phase B — CodeMirror in Messages

**CodeMirror for Code Blocks (#3)**
- [ ] Modify `md.js` to detect language in fenced code blocks
- [ ] Replace multi-line `<pre>` blocks with read-only CodeMirror instances
- [ ] Styling for inline code editors
- [ ] Keep collapsible behavior within foldable messages



## Phase C — Tool Selection

**Per-Message Tool Selection (#11)**
- [ ] Checkbox panel in UI before message submission
- [ ] Make `tools` array filterable per call
- [ ] Pass `selectedTools` through `startAgentLoop` → API
- [ ] Visual indicator of active tools in session header



## Phase I — Permissions & Bash

**Permissions Gate (#7)**
- [ ] Research and design permission model (r/w/x per path)
- [ ] Permission checking functions
- [ ] Integrate with tool execution layer
- [ ] UI for managing permissions

**Bash Execution (#8)**
- [ ] Research sandboxed browser execution
- [ ] Implement bash tool for agent
- [ ] Stream output, check permissions before execution

> Bash depends on #7.



