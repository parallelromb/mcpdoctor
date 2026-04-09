/**
 * MCP Protocol Client
 *
 * Full implementation of the MCP protocol client for testing MCP servers.
 * Supports stdio (spawn child process) and SSE/HTTP transports.
 * Uses JSON-RPC 2.0 framing as specified in the MCP spec.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';

export interface ServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

const DEFAULT_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Pending request waiting for a JSON-RPC response.
 */
interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * MCP Client — connects to an MCP server and provides a typed interface
 * for testing protocol compliance.
 */
export class McpClient extends EventEmitter {
  private serverConfig: ServerConfig;
  private _connected = false;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  // Stdio transport state
  private childProcess: ChildProcessWithoutNullStreams | null = null;
  private stderrLines: string[] = [];

  // Initialize result (cached after successful handshake)
  private _initResult: InitializeResult | null = null;

  constructor(config: ServerConfig) {
    super();
    this.serverConfig = config;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get config(): ServerConfig {
    return this.serverConfig;
  }

  get capabilities(): McpCapabilities | null {
    return this._initResult?.capabilities ?? null;
  }

  get serverInfo(): McpServerInfo | null {
    return this._initResult?.serverInfo ?? null;
  }

  get initResult(): InitializeResult | null {
    return this._initResult;
  }

  get stderrOutput(): string[] {
    return [...this.stderrLines];
  }

  /**
   * Connect to the MCP server and perform the initialize handshake.
   */
  async connect(): Promise<InitializeResult> {
    if (this._connected) {
      throw new Error('Already connected');
    }

    const { transport } = this.serverConfig;

    if (transport === 'stdio') {
      await this._connectStdio();
    } else if (transport === 'sse' || transport === 'streamable-http') {
      await this._connectHttp();
    } else {
      throw new Error(`Unsupported transport: ${transport}`);
    }

    // Perform MCP initialize handshake
    const initResult = await this._initialize();
    this._initResult = initResult;

    // Send initialized notification (required by spec)
    await this.notify('notifications/initialized', {});

    return initResult;
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  async request(
    method: string,
    params?: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<JsonRpcResponse> {
    if (!this._connected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const { transport } = this.serverConfig;

    if (transport === 'sse' || transport === 'streamable-http') {
      return this._sendHttpRequest(method, params, timeoutMs);
    }

    const id = ++this.requestId;
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this._sendStdioMessage(message);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  async notify(method: string, params?: unknown): Promise<void> {
    if (!this._connected) {
      throw new Error('Client not connected.');
    }

    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    if (this.serverConfig.transport === 'stdio') {
      this._sendStdioMessage(message);
    } else {
      // Fire-and-forget HTTP notification
      const { url } = this.serverConfig;
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        }).catch(() => {/* ignore */});
      }
    }
  }

  /**
   * Send raw bytes to the server (for testing malformed input handling).
   */
  sendRaw(raw: string): void {
    if (this.childProcess?.stdin) {
      this.childProcess.stdin.write(raw + '\n');
    }
  }

  /**
   * Disconnect and clean up resources.
   */
  async disconnect(): Promise<void> {
    this._connected = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    if (this.childProcess) {
      try {
        this.childProcess.stdin.end();
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            this.childProcess?.kill('SIGTERM');
            setTimeout(() => {
              this.childProcess?.kill('SIGKILL');
              resolve();
            }, 1000);
          }, 2000);

          this.childProcess!.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch {
        // ignore cleanup errors
      }
      this.childProcess = null;
    }

    this.removeAllListeners();
  }

  // ─── Private: Stdio Transport ────────────────────────────────────────────────

  private async _connectStdio(): Promise<void> {
    const { command, args = [], env = {} } = this.serverConfig;
    if (!command) {
      throw new Error('stdio transport requires a command');
    }

    // Parse command into executable + initial args
    const parts = command.trim().split(/\s+/);
    const executable = parts[0];
    const cmdArgs = [...parts.slice(1), ...args];

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    };

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const connectTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Process spawn timeout after ${CONNECT_TIMEOUT_MS}ms`));
        }
      }, CONNECT_TIMEOUT_MS);

      try {
        this.childProcess = spawn(executable, cmdArgs, {
          env: childEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
      } catch (err) {
        clearTimeout(connectTimer);
        return reject(new Error(`Failed to spawn process "${executable}": ${String(err)}`));
      }

      this.childProcess.on('error', (err) => {
        clearTimeout(connectTimer);
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to spawn process: ${err.message}`));
        } else {
          // Reject any pending requests
          for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Process error: ${err.message}`));
            this.pendingRequests.delete(id);
          }
        }
      });

      this.childProcess.on('exit', (code, signal) => {
        this._connected = false;
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Process exited with ${reason}`));
          this.pendingRequests.delete(id);
        }
        this.emit('exit', code, signal);
      });

      // Capture stderr for diagnostics
      this.childProcess.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        this.stderrLines.push(...lines);
        if (this.stderrLines.length > 100) {
          this.stderrLines = this.stderrLines.slice(-100);
        }
      });

      // Set up readline for newline-delimited JSON
      const rl = createInterface({ input: this.childProcess.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        this._handleIncomingLine(trimmed);
      });

      // Process spawned successfully — mark connected
      this._connected = true;
      clearTimeout(connectTimer);
      if (!settled) {
        settled = true;
        resolve();
      }
    });
  }

  // ─── Private: HTTP/SSE Transport ────────────────────────────────────────────

  private async _connectHttp(): Promise<void> {
    const { url } = this.serverConfig;
    if (!url) {
      throw new Error('sse/streamable-http transport requires a URL');
    }
    // For HTTP, just verify the URL is reachable
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(url, { method: 'GET', signal: controller.signal }).catch(() => {
        /* ignore — server may not support GET */
      });
      clearTimeout(timer);
    } catch {
      // ignore connectivity pre-check errors
    }
    this._connected = true;
  }

  // ─── Private: Message Handling ───────────────────────────────────────────────

  private _sendStdioMessage(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.childProcess?.stdin) {
      throw new Error('No stdin available');
    }
    const line = JSON.stringify(message) + '\n';
    this.childProcess.stdin.write(line);
  }

  private _handleIncomingLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.emit('parse_error', line);
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) return;

    const obj = parsed as Record<string, unknown>;

    // Check if it's a response (has numeric 'id')
    if ('id' in obj && typeof obj.id === 'number') {
      const response = parsed as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      }
    } else if ('method' in obj) {
      // It's a server notification
      this.emit('notification', parsed);
    }
  }

  // ─── Private: HTTP request for SSE/streamable-http transport ────────────────

  private async _sendHttpRequest(
    method: string,
    params?: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<JsonRpcResponse> {
    const { url } = this.serverConfig;
    if (!url) throw new Error('No URL configured');

    const id = ++this.requestId;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      const text = await res.text();
      const data = JSON.parse(text) as JsonRpcResponse;
      return data;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`HTTP request timeout after ${timeoutMs}ms: ${method}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Private: MCP Initialize Handshake ──────────────────────────────────────

  private async _initialize(): Promise<InitializeResult> {
    const initParams = {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'MCP Doctor',
        version: '1.0.0',
      },
    };

    const response = await this.request('initialize', initParams, CONNECT_TIMEOUT_MS);

    if (response.error) {
      throw new Error(
        `Initialize failed: ${response.error.message} (code: ${response.error.code})`,
      );
    }

    const result = response.result as InitializeResult;
    if (!result?.protocolVersion) {
      throw new Error('Initialize response missing protocolVersion');
    }

    return result;
  }
}
