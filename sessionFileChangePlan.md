# Session File Format Change Plan

## Goal
Move message storage and rendering from the current OpenAI-compatible format to the typed `sessionTypes.ts` format. Files stay JavaScript without type annotations.

- `agent/agent.js` persists and operates on session-format messages.
- `frontend/sessionRenderer.js` loads/renders session-format messages as JSONL.
- A transformation layer converts session-format messages to OpenAI format only for API calls.

---

## Decisions

- **Clean break**: old JSON-array session files are no longer loaded.
- **File format**: JSONL (header line + one message per line).
- **System messages**: included in `sessionTypes.ts`, content is hardcoded in renderer.
- **Assistant text and tool calls**: kept as separate persisted messages (note for future reflection).
- **Empty text assistant messages**: skipped if no text/thinking content was produced.
- **Error tool results**: store just the error text with `isError: true`.
- **Stop reason**: stored as the raw API `finish_reason`.
- **Usage**: skipped entirely for now.
- **`cwd`**: hardcoded as a `CWD` constant in `agent/sessionFormat.js`.

---

## `sessionTypes.ts` Changes

### Add `SystemMessage`

```ts
export interface SystemMessage {
  type: "message";
  role: "system";
  content: TextContent[];
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage | SystemMessage;
```

### Remove `cost` from `Usage`

```ts
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
  totalTokens: number;
}
```

---

## `frontend/jsonl.js`

Add a stringify helper to match the existing parse helper.

```js
function parse(jsonl) {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function stringify(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

export const JSONL = { parse, stringify };
```

---

## New File: `agent/sessionFormat.js`

Contains data-shape helpers and the `CWD` constant.

```js
const CWD = "/your/hardcoded/path";

export const createTextContent = (text) => ({ type: "text", text });
export const createThinkingContent = (thinking) => ({ type: "thinking", thinking });
export const createToolCall = (id, name, args) => ({
  type: "toolCall",
  id,
  name,
  arguments: JSON.stringify(args),
});

export const generateId = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const createSessionHeader = (id, parentSession) => ({
  type: "session",
  id,
  timestamp: Date.now(),
  cwd: CWD,
  parentSession,
});

export const createSystemMessage = (text, timestamp = Date.now()) => ({
  type: "message",
  role: "system",
  content: [createTextContent(text)],
  timestamp,
});

export const createUserMessage = (text, timestamp = Date.now()) => ({
  type: "message",
  role: "user",
  content: [createTextContent(text)],
  timestamp,
});

export const createAssistantMessage = ({
  content,
  model,
  stopReason,
  errorMessage,
  timestamp = Date.now(),
}) => ({
  type: "message",
  role: "assistant",
  content,
  model,
  stopReason,
  errorMessage,
  timestamp,
});

export const createToolResultMessage = (
  toolCallId,
  toolName,
  result,
  isError,
  timestamp = Date.now()
) => ({
  type: "message",
  role: "tool",
  toolCallId,
  toolName,
  content: [
    createTextContent(typeof result === "string" ? result : JSON.stringify(result)),
  ],
  isError,
  timestamp,
});
```

---

## `agent/agent.js` Changes

### Add `toOpenAIMessages`

Converts session-format messages to OpenAI API format only at API time.

```js
function toOpenAIMessages(sessionMessages) {
  return sessionMessages.map((m) => {
    if (m.role === "system" || m.role === "user") {
      return {
        role: m.role,
        content: m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
      };
    }

    if (m.role === "assistant") {
      const text = m.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      const reasoning = m.content
        .filter((c) => c.type === "thinking")
        .map((c) => c.thinking)
        .join("");
      const toolCalls = m.content
        .filter((c) => c.type === "toolCall")
        .map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        }));

      const msg = { role: "assistant", content: text };
      if (reasoning) msg.reasoning_content = reasoning;
      if (toolCalls.length > 0) msg.tool_calls = toolCalls;
      return msg;
    }

    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
      };
    }

    throw new Error(`Unknown message role: ${m.role}`);
  });
}
```

### Update `runAgentTurn`

1. Accept `sessionMessages` in session format.
2. Before API call: `const apiMessages = toOpenAIMessages(sessionMessages)`.
3. During streaming, accumulate:
   - `textContent`
   - `thinkingContent`
   - tool calls via existing assembler
4. At end of stream:
   - Build `content` array.
   - Add `TextContent` if `textContent` is non-empty.
   - Add `ThinkingContent` if `thinkingContent` is non-empty.
   - If `content` is empty, skip pushing a text assistant message.
   - Otherwise push `createAssistantMessage({ content, model, stopReason: finishReason })`.
5. If tool calls exist:
   - For each tool call, push `createAssistantMessage({ content: [createToolCall(...)], model, stopReason: 'toolUse' })`.
   - Execute tool.
   - On success, push `createToolResultMessage(toolCallId, toolName, result, false)`.
   - On error, push `createToolResultMessage(toolCallId, toolName, error.message, true)`.
6. Recursive `runAgentTurn` call uses the same `sessionMessages` array.

### Tool executor plumbing

`toolExecutor` / `callFunction` should accept the session-format `ToolCall` directly and `JSON.parse(toolCall.arguments)` when needed.

---

## `frontend/sessionRenderer.js` Changes

### Loading

Use `JSONL.parse` and separate header from messages.

```js
const rows = JSONL.parse(content);
const [sessionHeader, ...sessionMessages] = rows;
```

### Saving

Use `JSONL.stringify`.

```js
await writeFile(currentSessionPath, JSONL.stringify([sessionHeader, ...sessionMessages]));
```

### New session

```js
sessionHeader = createSessionHeader(generateId());
sessionMessages = [createSystemMessage("You are a helpful coding assistant.")];
```

### Prompt submit

```js
const userMessage = createUserMessage(prompt);
sessionMessages.push(userMessage);
handleAgentEvent(createEvent(EventTypes.USER_MESSAGE, userMessage));
await startAgentLoop(sessionMessages, handleAgentEvent, currentModel.value());
```

### Rendering

Update helpers to read typed content arrays.

- Text: `message.content.filter((c) => c.type === "text").map((c) => c.text).join("")`
- Thinking: same for `thinking`
- Tool calls: `message.content.filter((c) => c.type === "toolCall")`
- Tool results: `role === "tool"` messages using `toolCallId`, `toolName`, `isError`

Remove old OpenAI-shape branches (`tool_calls`, `tool_call_id`, `reasoning_content`).

### Context size

Use stored assistant messages only; usage is skipped so fall back to content length.

```js
const estimateContextSize = (messages) =>
  messages
    .filter((m) => m.role === "assistant")
    .reduce((sum, m) => {
      const text = m.content
        .filter((c) => c.type === "text" || c.type === "thinking")
        .map((c) => (c.type === "text" ? c.text : c.thinking))
        .join("");
      return sum + estimateTokenCount(text);
    }, 0);
```

---

## Open Questions

None remaining. All prior decisions are incorporated above.
