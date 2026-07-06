import type {
  TextContent,
  ThinkingContent,
  ToolCall,
  SessionHeader,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Usage,
  StopReason,
} from "../sessionTypes.ts";

const CWD = "/Users/aaryan/Downloads/projects/llm-electron";

export const createTextContent = (text: string): TextContent => ({ type: "text", text });

export const createThinkingContent = (thinking: string): ThinkingContent => ({
  type: "thinking",
  thinking,
});

export const createToolCall = (id: string, name: string, args: any): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: JSON.stringify(args),
});

export const generateId = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const createSessionHeader = (
  id: string,
  parentSession?: string
): SessionHeader => ({
  type: "session",
  id,
  timestamp: Date.now(),
  cwd: CWD,
  parentSession,
});

export const createSystemMessage = (
  text: string,
  timestamp: number = Date.now()
): SystemMessage => ({
  type: "message",
  role: "system",
  content: [createTextContent(text)],
  timestamp,
});

export const createUserMessage = (
  text: string,
  timestamp: number = Date.now()
): UserMessage => ({
  type: "message",
  role: "user",
  content: [createTextContent(text)],
  timestamp,
});

export const createAssistantMessage = ({
  content,
  model,
  stopReason,
  usage,
  errorMessage,
  timestamp = Date.now(),
}: {
  content: (TextContent | ThinkingContent | ToolCall)[];
  model: string;
  stopReason: StopReason;
  errorMessage?: string;
  usage: Usage;
  timestamp?: number;
}): AssistantMessage => ({
  type: "message",
  role: "assistant",
  content,
  model,
  usage,
  stopReason,
  errorMessage,
  timestamp,
});

export const createToolResultMessage = (
  toolCallId: string,
  toolName: string,
  result: any,
  isError: boolean,
  timestamp: number = Date.now()
): ToolResultMessage => ({
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
