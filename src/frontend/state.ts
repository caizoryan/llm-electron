import { reactive } from "./lib/chowk.js";
import type { SessionManager } from "../agent/sessionManager.js";


// ===============================
// STATE MANAGEMENT
// ===============================
export const DEFAULT_CWD = '/Users/aaryan/';

export const state = {
  currentSession: reactive(''),
  parsedSession: '',
  sessionManager: null as SessionManager | null,
  isAgentRunning: reactive(false),
  isCwdModalOpen: reactive(false),
  currentCwd: reactive(DEFAULT_CWD),
  currentModel: reactive('kimi-k2.7-code'),
  thinkingMode: reactive('low'),
  renderingStrategy: reactive('MD')
};
