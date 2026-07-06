/**
 * Core types for the LLM session file format.
 *
 * Session files are stored as JSONL:
 *   - Line 1 is always a `SessionHeader`.
 *   - Every following line is a `Message`.
 *
 * Each line is an independent JSON object. The top-level `type` field tells
 * a parser whether it is reading the header (`"session"`) or a message
 * (`"message"`), so consumers don't need to rely on line position alone.
 *
 * The header is small so tooling can scan many session files cheaply by
 * reading only the first line of each file.
 */

// ----------------------------------------------------------------------------
// Header
// ----------------------------------------------------------------------------

export interface SessionHeader {
	type: "session";
	id: string;
	/** Unix timestamp in milliseconds. */
	timestamp: number;
	cwd: string;
	parentSession?: string;
}

// ----------------------------------------------------------------------------
// Shared content / call types
// ----------------------------------------------------------------------------

export interface TextContent {
	type: "text";
	text: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	/** JSON-encoded arguments string. */
	arguments: string;
}

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning?: number;
	totalTokens: number;
}

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// ----------------------------------------------------------------------------
// Messages
// ----------------------------------------------------------------------------

export interface SystemMessage {
	type: "message";
	role: "system";
	content: TextContent[];
	/** Unix timestamp in milliseconds. */
	timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage | SystemMessage;

export interface UserMessage {
	type: "message";
	role: "user";
	content: TextContent[];
	/** Unix timestamp in milliseconds. */
	timestamp: number;
}

export interface AssistantMessage {
	type: "message";
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	model: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	/** Unix timestamp in milliseconds. */
	timestamp: number;
}

export interface ToolResultMessage {
	type: "message";
	role: "tool";
	toolCallId: string;
	toolName: string;
	content: TextContent[];
	isError: boolean;
	/** Unix timestamp in milliseconds. */
	timestamp: number;
}

// ----------------------------------------------------------------------------
// Important notes
// ----------------------------------------------------------------------------

/**
 * 1. Self-describing lines
 *    Every JSONL line has a top-level `type` field. Headers use `"session"`,
 *    message lines use `"message"`. This lets a reader know what it is
 *    looking at without relying on line index alone.
 *
 * 2. Role is message-only
 *    The `role` field only appears on messages (`user`, `assistant`, `tool`).
 *    It is intentionally not used for header-vs-message discrimination.
 *
 * 3. Timestamps
 *    All timestamps are Unix epoch milliseconds (`number`). The header and
 *    every message use the same unit for consistency.
 *
 * 4. Content arrays
 *    Message content is always an array of typed content objects.
 *    Plain strings are not used as content items.
 *
 * 5. Tool arguments
 *    Tool call arguments are stored as a JSON string. Consumers must
 *    `JSON.parse` the value when they need the structured arguments.
 *
 * 6. Images / binary
 *    Image and binary content types are intentionally omitted for now.
 *    Adding them later will be a backward-compatible extension of the
 *    content unions.
 *
 * 7. No versioning field
 *    The format is intentionally versionless at this stage. If a version
 *    becomes necessary later, it can be added to the header as an optional
 *    field with a default of `1`.
 *
 * 8. Tool result role
 *    Tool result messages use `role: "tool"` to match common LLM API
 *    conventions, even though they are persisted as separate message lines.
 */
