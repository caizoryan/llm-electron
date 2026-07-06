const CWD = "/Users/aaryan/Downloads/projects/llm-electron";

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
