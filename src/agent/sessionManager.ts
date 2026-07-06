import { fs } from '../fs.js';
import { JSONL } from '../jsonl.js';
import { createSessionHeader, generateId } from './sessionFormat.js';
import type { SessionHeader, Message } from '../sessionTypes.ts';

export class SessionManager {
  private path: string;
  private header: SessionHeader;
  private messages: Message[];

  private constructor(path: string, header: SessionHeader, messages: Message[]) {
    this.path = path;
    this.header = header;
    this.messages = messages;
  }

  /** Create a new session file with a fresh header and optional initial messages. */
  static async create(path: string, initialMessages: Message[] = []): Promise<SessionManager> {
    const header = createSessionHeader(generateId());
    const manager = new SessionManager(path, header, initialMessages);
    await manager.write();
    return manager;
  }

  /** Load an existing session file from disk. */
  static async load(path: string): Promise<SessionManager> {
    const content = await fs.readFile(path);
    const rows = JSONL.parse(content);
    const [header, ...messages] = rows;

    if (!header || header.type !== 'session') {
      throw new Error(`Invalid session file: missing or invalid header at ${path}`);
    }

    return new SessionManager(path, header, messages);
  }

  /** Full path to the session file. */
  getPath(): string {
    return this.path;
  }

  /** Session header. */
  getHeader(): SessionHeader {
    return this.header;
  }

  /** Current message list, including system prompt, user messages, etc. */
  getMessages(): Message[] {
    return this.messages;
  }

  /** Append a message to the in-memory session. Does not write to disk. */
  appendMessage(message: Message): void {
    this.messages.push(message);
  }

  /** Persist header + all messages to the session file. */
  async write(): Promise<void> {
    await fs.writeFile(this.path, JSONL.stringify([this.header, ...this.messages]));
  }
}
