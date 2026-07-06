will use jsonl
first line will be header, this way I can go through all the files
without having to load all of them to memory, just read the first line of each file.

header will look something like this:

export interface SessionHeader {
	type: "session";
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
}

following that, I will have Messages

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

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
	arguments: string;
}

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning?: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface UserMessage {
	role: "user";
	content: ( string | TextContent )[];
	timestamp: number; // Unix timestamp in milliseconds
}

export interface AssistantMessage {
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	model: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	timestamp: number; // Unix timestamp in milliseconds
}

export interface ToolResultMessage {
	role: "tool";
	toolCallId: string;
	toolName: string;
	content: TextContent[]; 
	isError: boolean;
	timestamp: number; // Unix timestamp in milliseconds
}

