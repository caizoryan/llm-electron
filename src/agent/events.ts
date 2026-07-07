import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '../sessionTypes.js'

export type EventType =
  | 'response_start'
  | 'text_delta'
  | 'reasoning_delta'
  | 'tool_call'
  | 'tool_result'
  | 'response_end'
  | 'error'
  | 'user_message'

export const EventTypes: Record<string, EventType> = {
  RESPONSE_START: 'response_start',
  TEXT_DELTA: 'text_delta',
  REASONING_DELTA: 'reasoning_delta',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  RESPONSE_END: 'response_end',
  ERROR: 'error',
  USER_MESSAGE: 'user_message',
} as const


export interface ResponseStartEvent {
  type: 'response_start'
  model: string
  timestamp: number
}

export interface TextDeltaEvent {
  type: 'text_delta'
  part: TextContent
  timestamp: number
}

export interface ReasoningDeltaEvent {
  type: 'reasoning_delta'
  part: ThinkingContent
  timestamp: number
}

export interface ToolCallEvent {
  type: 'tool_call'
  part: ToolCall
  timestamp: number
}

export interface ToolResultEvent {
  type: 'tool_result'
  message: ToolResultMessage
  timestamp: number
}

export interface ResponseEndEvent {
  type: 'response_end'
  message: AssistantMessage
  timestamp: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
  timestamp: number
}

export interface UserMessageEvent {
  type: 'user_message'
  message: UserMessage
  timestamp: number
}

export type AgentEvent =
  | ResponseStartEvent
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | ResponseEndEvent
  | ErrorEvent
  | UserMessageEvent

export function createEvent<T extends AgentEvent['type']>(
  type: T,
  payload: Omit<Extract<AgentEvent, { type: T }>, 'type' | 'timestamp'> = {} as any
): Extract<AgentEvent, { type: T }> {
  return { type, ...payload, timestamp: Date.now() } as Extract<AgentEvent, { type: T }>
}
