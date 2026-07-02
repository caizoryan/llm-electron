export const EventTypes = {
  RESPONSE_START: 'response_start',
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  RESPONSE_END: 'response_end',
  ERROR: 'error',
  USER_MESSAGE: 'user_message',
}

export const createEvent = (type, data = {}) => ({
  type,
  ...data,
  timestamp: Date.now(),
})