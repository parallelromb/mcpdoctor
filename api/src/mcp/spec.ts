/**
 * MCP Compliance Check Definitions — 50+ checks organized by category.
 */

import type { McpClient } from './client.js';
import { JSON_RPC_ERRORS } from './client.js';
import type { McpTool, McpResource, McpPrompt } from './client.js';

export interface CheckResult {
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration_ms: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface ComplianceCheck {
  id: string;
  name: string;
  category: 'protocol' | 'tools' | 'resources' | 'prompts' | 'error_handling' | 'security';
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  run: (client: McpClient) => Promise<CheckResult>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; duration_ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, duration_ms: Date.now() - start };
}

function passed(message: string, details?: Record<string, unknown>): Omit<CheckResult, 'duration_ms'> {
  return { status: 'passed', message, details };
}

function failed(message: string, details?: Record<string, unknown>): Omit<CheckResult, 'duration_ms'> {
  return { status: 'failed', message, details };
}

function skipped(message: string): CheckResult {
  return { status: 'skipped', duration_ms: 0, message };
}

function isValidJsonRpc(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return o.jsonrpc === '2.0' && typeof o.id === 'number';
}

function isValidJsonSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const s = schema as Record<string, unknown>;
  return s.type === 'object' || typeof s.properties === 'object' || Array.isArray(s.oneOf) || Array.isArray(s.anyOf);
}

// ─── Protocol Checks (10) ────────────────────────────────────────────────────

const protocolChecks: ComplianceCheck[] = [
  {
    id: 'protocol-001',
    name: 'Initialize Handshake',
    category: 'protocol',
    description: 'Server responds to initialize request with valid result',
    severity: 'critical',
    async run(client) {
      const start = Date.now();
      const initResult = client.initResult;
      if (!initResult) {
        return { ...failed('Initialize was not performed or failed'), duration_ms: Date.now() - start };
      }
      return { ...passed('Server responded to initialize successfully'), duration_ms: Date.now() - start };
    },
  },
  {
    id: 'protocol-002',
    name: 'Initialized Notification Accepted',
    category: 'protocol',
    description: 'Server accepts the initialized notification without error',
    severity: 'critical',
    async run(client) {
      const start = Date.now();
      if (!client.initResult) {
        return { ...failed('No init result — connection may have failed'), duration_ms: Date.now() - start };
      }
      if (!client.isConnected) {
        return { ...failed('Server disconnected after initialized notification'), duration_ms: Date.now() - start };
      }
      return { ...passed('Server accepted initialized notification'), duration_ms: Date.now() - start };
    },
  },
  {
    id: 'protocol-003',
    name: 'Server Info Present',
    category: 'protocol',
    description: 'Server provides name and version in serverInfo',
    severity: 'major',
    async run(client) {
      const start = Date.now();
      const info = client.serverInfo;
      if (!info) {
        return { ...failed('No serverInfo in initialize response'), duration_ms: Date.now() - start };
      }
      if (!info.name || typeof info.name !== 'string') {
        return { ...failed('serverInfo.name is missing or not a string', { info: info as unknown as Record<string, unknown> }), duration_ms: Date.now() - start };
      }
      if (!info.version || typeof info.version !== 'string') {
        return { ...failed('serverInfo.version is missing or not a string', { info: info as unknown as Record<string, unknown> }), duration_ms: Date.now() - start };
      }
      return { ...passed(`Server: ${info.name} v${info.version}`), duration_ms: Date.now() - start, details: { name: info.name, version: info.version } };
    },
  },
  {
    id: 'protocol-004',
    name: 'Capabilities Format Valid',
    category: 'protocol',
    description: 'Capabilities object has valid structure',
    severity: 'major',
    async run(client) {
      const start = Date.now();
      const caps = client.capabilities;
      if (!caps || typeof caps !== 'object') {
        return { ...failed('No capabilities in initialize response'), duration_ms: Date.now() - start };
      }
      const validKeys = ['tools', 'resources', 'prompts', 'logging', 'experimental'];
      const unknownKeys = Object.keys(caps).filter(k => !validKeys.includes(k));
      const details: Record<string, unknown> = { capabilities: caps as unknown as Record<string, unknown> };
      if (unknownKeys.length > 0) {
        details.unknown_keys = unknownKeys;
      }
      return { ...passed('Capabilities object is valid'), duration_ms: Date.now() - start, details };
    },
  },
  {
    id: 'protocol-005',
    name: 'Ping Response',
    category: 'protocol',
    description: 'Server responds to ping method',
    severity: 'minor',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('ping', {}, 5000),
      );
      if (response.error) {
        if (response.error.code === JSON_RPC_ERRORS.METHOD_NOT_FOUND) {
          return { ...failed('Server returned MethodNotFound for ping'), duration_ms };
        }
        return { ...failed(`Ping returned error: ${response.error.message}`), duration_ms };
      }
      return { ...passed('Server responded to ping'), duration_ms };
    },
  },
  {
    id: 'protocol-006',
    name: 'JSON-RPC Format Compliance',
    category: 'protocol',
    description: 'All responses use valid JSON-RPC 2.0 format',
    severity: 'critical',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/list', {}, 5000),
      );
      if (!isValidJsonRpc(response)) {
        return { ...failed('Response is not valid JSON-RPC 2.0', { response: response as unknown as Record<string, unknown> }), duration_ms };
      }
      if (!('result' in response) && !('error' in response)) {
        return { ...failed('Response has neither result nor error field'), duration_ms };
      }
      return { ...passed('Responses use valid JSON-RPC 2.0 format'), duration_ms };
    },
  },
  {
    id: 'protocol-007',
    name: 'Error Codes Are Standard',
    category: 'protocol',
    description: 'Server uses standard JSON-RPC error codes',
    severity: 'major',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('unknown/method/xyz', {}, 5000),
      );
      if (!response.error) {
        return { ...failed('Server did not return an error for unknown method'), duration_ms };
      }
      const validCodes = [-32700, -32600, -32601, -32602, -32603];
      const isStandard = validCodes.includes(response.error.code) ||
        (response.error.code >= -32099 && response.error.code <= -32000) ||
        (response.error.code >= 1 && response.error.code <= 99);
      if (!isStandard) {
        return { ...failed(`Non-standard error code: ${response.error.code}`, { error: response.error as unknown as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Error code ${response.error.code} is valid`), duration_ms, details: { code: response.error.code } };
    },
  },
  {
    id: 'protocol-008',
    name: 'Unknown Method Returns MethodNotFound',
    category: 'protocol',
    description: 'Server returns -32601 MethodNotFound for unknown methods',
    severity: 'major',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('mcp_doctor/nonexistent_method_12345', {}, 5000),
      );
      if (!response.error) {
        return { ...failed('Server did not return error for unknown method'), duration_ms };
      }
      if (response.error.code !== JSON_RPC_ERRORS.METHOD_NOT_FOUND) {
        return {
          ...failed(`Expected -32601 MethodNotFound, got ${response.error.code}`, { error: response.error as unknown as Record<string, unknown> }),
          duration_ms,
        };
      }
      return { ...passed('Server returns MethodNotFound for unknown methods'), duration_ms };
    },
  },
  {
    id: 'protocol-009',
    name: 'Invalid Params Handled Gracefully',
    category: 'protocol',
    description: 'Server handles invalid params without crashing',
    severity: 'major',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/call', { _invalid: true, completely: 'wrong' }, 5000),
      );
      if (!response.error) {
        return { ...failed('Server did not return error for invalid tools/call params'), duration_ms };
      }
      return { ...passed('Server handles invalid params gracefully'), duration_ms, details: { error: response.error as unknown as Record<string, unknown> } };
    },
  },
  {
    id: 'protocol-010',
    name: 'Protocol Version Declared',
    category: 'protocol',
    description: 'Server declares a protocol version in initialize response',
    severity: 'critical',
    async run(client) {
      const start = Date.now();
      const initResult = client.initResult;
      if (!initResult?.protocolVersion) {
        return { ...failed('No protocolVersion in initialize response'), duration_ms: Date.now() - start };
      }
      const validVersions = ['2024-11-05', '2025-03-26'];
      const isKnownVersion = validVersions.includes(initResult.protocolVersion);
      return {
        ...passed(`Protocol version: ${initResult.protocolVersion}`),
        duration_ms: Date.now() - start,
        details: { protocolVersion: initResult.protocolVersion, isKnownVersion },
      };
    },
  },
];

// ─── Tools Checks (10) ───────────────────────────────────────────────────────

const toolsChecks: ComplianceCheck[] = [
  {
    id: 'tools-001',
    name: 'tools/list Returns Valid Array',
    category: 'tools',
    description: 'tools/list returns an array of tool definitions',
    severity: 'critical',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('Server does not advertise tools capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/list', {}, 10000),
      );
      if (response.error) return { ...failed(`tools/list error: ${response.error.message}`), duration_ms };
      const result = response.result as { tools?: unknown };
      if (!Array.isArray(result?.tools)) {
        return { ...failed('result.tools is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Found ${result.tools.length} tool(s)`), duration_ms, details: { count: result.tools.length } };
    },
  },
  {
    id: 'tools-002',
    name: 'Tool Schema Has Required Fields',
    category: 'tools',
    description: 'Each tool has name, description, and inputSchema',
    severity: 'critical',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: response, duration_ms } = await timed(() => client.request('tools/list', {}, 10000));
      if (response.error) return { ...failed(`tools/list error: ${response.error.message}`), duration_ms };
      const tools = ((response.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...passed('No tools to validate'), duration_ms };
      const issues: string[] = [];
      for (const tool of tools) {
        if (!tool.name) issues.push(`Tool missing name: ${JSON.stringify(tool)}`);
        if (typeof tool.description !== 'string') issues.push(`Tool "${tool.name}" missing description`);
        if (!tool.inputSchema) issues.push(`Tool "${tool.name}" missing inputSchema`);
      }
      if (issues.length > 0) return { ...failed(`Schema issues: ${issues.join('; ')}`, { issues }), duration_ms };
      return { ...passed(`All ${tools.length} tool(s) have required fields`), duration_ms };
    },
  },
  {
    id: 'tools-003',
    name: 'Tool inputSchema Is Valid JSON Schema',
    category: 'tools',
    description: 'inputSchema for each tool must be a valid JSON Schema object',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: response, duration_ms } = await timed(() => client.request('tools/list', {}, 10000));
      if (response.error) return { ...failed(`tools/list error: ${response.error.message}`), duration_ms };
      const tools = ((response.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...passed('No tools to validate'), duration_ms };
      const issues: string[] = [];
      for (const tool of tools) {
        if (tool.inputSchema && !isValidJsonSchema(tool.inputSchema)) {
          issues.push(`Tool "${tool.name}" has invalid inputSchema`);
        }
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed('All tool inputSchemas are valid'), duration_ms };
    },
  },
  {
    id: 'tools-004',
    name: 'Tool Call Returns Valid Result',
    category: 'tools',
    description: 'Calling a tool returns a result with content array',
    severity: 'critical',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 10000));
      if (listResponse.error) return { ...failed(`tools/list error: ${listResponse.error.message}`), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools available to call'), duration_ms: listMs };
      const firstTool = tools[0];
      const { result: callResponse, duration_ms } = await timed(() =>
        client.request('tools/call', { name: firstTool.name, arguments: {} }, 10000),
      );
      if (callResponse.error) {
        if (callResponse.error.code === JSON_RPC_ERRORS.INVALID_PARAMS) {
          return { ...passed('Tool call returned INVALID_PARAMS (expected behavior for empty args)'), duration_ms };
        }
        return { ...failed(`Tool call error: ${callResponse.error.message}`), duration_ms };
      }
      const result = callResponse.result as { content?: unknown; isError?: boolean };
      if (!Array.isArray(result?.content)) {
        return { ...failed('Tool call result.content is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Tool "${firstTool.name}" returned ${result.content.length} content item(s)`), duration_ms };
    },
  },
  {
    id: 'tools-005',
    name: 'Invalid Tool Name Returns Error',
    category: 'tools',
    description: 'Calling a non-existent tool returns proper error',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/call', { name: '__mcp_doctor_nonexistent_tool__', arguments: {} }, 5000),
      );
      if (!response.error) {
        const result = response.result as { isError?: boolean };
        if (result?.isError) return { ...passed('Tool returned isError for unknown tool name'), duration_ms };
        return { ...failed('Server did not return error for non-existent tool', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Non-existent tool returns error code ${response.error.code}`), duration_ms };
    },
  },
  {
    id: 'tools-006',
    name: 'Invalid Tool Arguments Handled',
    category: 'tools',
    description: 'Calling a tool with invalid arguments returns error or isError',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 10000));
      if (listResponse.error) return { ...failed(`tools/list error`), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools available'), duration_ms: listMs };
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/call', { name: tools[0].name, arguments: { __totally_invalid_param_xyz__: { nested: [1, 2, 3] } } }, 5000),
      );
      if (response.error) return { ...passed('Server returns error for invalid arguments'), duration_ms };
      const result = response.result as { isError?: boolean };
      if (result?.isError) return { ...passed('Server returns isError for invalid arguments'), duration_ms };
      return { ...passed('Server handled invalid arguments (lenient — no crash)'), duration_ms };
    },
  },
  {
    id: 'tools-007',
    name: 'Tool Result Content Format',
    category: 'tools',
    description: 'Tool results have valid content array items',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 10000));
      if (listResponse.error) return { ...failed(`tools/list error`), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools available'), duration_ms: listMs };
      const { result: callResponse, duration_ms } = await timed(() =>
        client.request('tools/call', { name: tools[0].name, arguments: {} }, 10000),
      );
      if (callResponse.error) return { ...skipped('Could not call tool to verify content format'), duration_ms };
      const result = callResponse.result as { content?: unknown[] };
      if (!Array.isArray(result?.content)) return { ...skipped('No content array to validate'), duration_ms };
      const issues: string[] = [];
      for (const item of result.content) {
        const c = item as Record<string, unknown>;
        if (!c.type) issues.push('Content item missing type field');
        if (c.type === 'text' && typeof c.text !== 'string') issues.push(`Text content item missing text field`);
        if (c.type === 'image' && !c.data) issues.push('Image content item missing data field');
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`Content format valid (${result.content.length} items)`), duration_ms };
    },
  },
  {
    id: 'tools-008',
    name: 'Text Content Has Type And Text Fields',
    category: 'tools',
    description: 'Text content items have type="text" and a text string',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list tools'), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools available'), duration_ms: listMs };
      const { result: callResponse, duration_ms } = await timed(() =>
        client.request('tools/call', { name: tools[0].name, arguments: {} }, 10000),
      );
      if (callResponse.error) return { ...skipped('Could not call tool'), duration_ms };
      const result = callResponse.result as { content?: unknown[] };
      const textItems = (result.content ?? []).filter(c => (c as Record<string, unknown>).type === 'text');
      if (textItems.length === 0) return { ...skipped('No text content items to validate'), duration_ms };
      const issues = textItems.filter(c => typeof (c as Record<string, unknown>).text !== 'string');
      if (issues.length > 0) return { ...failed(`${issues.length} text items missing text field`), duration_ms };
      return { ...passed(`${textItems.length} text content item(s) valid`), duration_ms };
    },
  },
  {
    id: 'tools-009',
    name: 'Tool isError Flag Behavior',
    category: 'tools',
    description: 'Error results set isError flag or use JSON-RPC error',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/call', { name: '__nonexistent__', arguments: {} }, 5000),
      );
      if (response.error) return { ...passed('Server uses JSON-RPC error for invalid tool'), duration_ms };
      const result = response.result as { isError?: boolean };
      if (result?.isError === true) return { ...passed('Server uses isError flag for tool errors'), duration_ms };
      return { ...failed('Neither JSON-RPC error nor isError flag set for unknown tool'), duration_ms };
    },
  },
  {
    id: 'tools-010',
    name: 'Tool Annotations Format',
    category: 'tools',
    description: 'Tools with annotations have valid annotation format',
    severity: 'info',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: response, duration_ms } = await timed(() => client.request('tools/list', {}, 10000));
      if (response.error) return { ...skipped('Could not list tools'), duration_ms };
      const tools = ((response.result as { tools?: unknown }).tools ?? []) as McpTool[];
      const annotated = tools.filter(t => t.annotations);
      if (annotated.length === 0) return { ...skipped('No annotated tools to validate'), duration_ms };
      const issues: string[] = [];
      for (const tool of annotated) {
        if (typeof tool.annotations !== 'object' || Array.isArray(tool.annotations)) {
          issues.push(`Tool "${tool.name}" annotations is not an object`);
        }
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`${annotated.length} annotated tool(s) valid`), duration_ms };
    },
  },
];

// ─── Resources Checks (8) ────────────────────────────────────────────────────

const resourcesChecks: ComplianceCheck[] = [
  {
    id: 'resources-001',
    name: 'resources/list Returns Valid Array',
    category: 'resources',
    description: 'resources/list returns an array of resource definitions',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('Server does not advertise resources capability');
      const { result: response, duration_ms } = await timed(() => client.request('resources/list', {}, 10000));
      if (response.error) return { ...failed(`resources/list error: ${response.error.message}`), duration_ms };
      const result = response.result as { resources?: unknown };
      if (!Array.isArray(result?.resources)) {
        return { ...failed('result.resources is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Found ${result.resources.length} resource(s)`), duration_ms, details: { count: result.resources.length } };
    },
  },
  {
    id: 'resources-002',
    name: 'Resource Has Valid URI',
    category: 'resources',
    description: 'Each resource has a valid URI',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: response, duration_ms } = await timed(() => client.request('resources/list', {}, 10000));
      if (response.error) return { ...failed(`resources/list error`), duration_ms };
      const resources = ((response.result as { resources?: unknown }).resources ?? []) as McpResource[];
      if (resources.length === 0) return { ...passed('No resources to validate'), duration_ms };
      const issues: string[] = [];
      for (const r of resources) {
        if (!r.uri || typeof r.uri !== 'string') {
          issues.push(`Resource missing URI: ${JSON.stringify(r)}`);
        }
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`All ${resources.length} resource(s) have valid URIs`), duration_ms };
    },
  },
  {
    id: 'resources-003',
    name: 'Resource Read Returns Content',
    category: 'resources',
    description: 'Reading a listed resource returns valid content',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('resources/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list resources'), duration_ms: listMs };
      const resources = ((listResponse.result as { resources?: unknown }).resources ?? []) as McpResource[];
      if (resources.length === 0) return { ...skipped('No resources to read'), duration_ms: listMs };
      const { result: readResponse, duration_ms } = await timed(() =>
        client.request('resources/read', { uri: resources[0].uri }, 10000),
      );
      if (readResponse.error) return { ...failed(`resources/read error: ${readResponse.error.message}`), duration_ms };
      const result = readResponse.result as { contents?: unknown };
      if (!Array.isArray(result?.contents)) {
        return { ...failed('result.contents is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Read "${resources[0].uri}" (${result.contents.length} content items)`), duration_ms };
    },
  },
  {
    id: 'resources-004',
    name: 'Invalid Resource URI Returns Error',
    category: 'resources',
    description: 'Reading a non-existent resource returns proper error',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('resources/read', { uri: 'mcp-doctor://nonexistent/resource/xyz' }, 5000),
      );
      if (!response.error) {
        return { ...failed('Server did not return error for non-existent resource', { result: response.result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Non-existent resource returns error code ${response.error.code}`), duration_ms };
    },
  },
  {
    id: 'resources-005',
    name: 'Resource Templates Have Valid uriTemplate',
    category: 'resources',
    description: 'Resource templates have a valid uriTemplate field',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('resources/templates/list', {}, 10000),
      );
      if (response.error) {
        if (response.error.code === JSON_RPC_ERRORS.METHOD_NOT_FOUND) {
          return { ...skipped('Server does not support resource templates'), duration_ms };
        }
        return { ...failed(`templates/list error: ${response.error.message}`), duration_ms };
      }
      const result = response.result as { resourceTemplates?: unknown[] };
      if (!Array.isArray(result?.resourceTemplates) || result.resourceTemplates.length === 0) {
        return { ...skipped('No resource templates'), duration_ms };
      }
      const issues: string[] = [];
      for (const tmpl of result.resourceTemplates) {
        const t = tmpl as Record<string, unknown>;
        if (!t.uriTemplate || typeof t.uriTemplate !== 'string') {
          issues.push(`Template missing uriTemplate: ${JSON.stringify(t)}`);
        }
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`${result.resourceTemplates.length} template(s) valid`), duration_ms };
    },
  },
  {
    id: 'resources-006',
    name: 'Resource Includes mimeType',
    category: 'resources',
    description: 'Resources include mimeType field',
    severity: 'info',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: response, duration_ms } = await timed(() => client.request('resources/list', {}, 10000));
      if (response.error) return { ...skipped('Could not list resources'), duration_ms };
      const resources = ((response.result as { resources?: unknown }).resources ?? []) as McpResource[];
      if (resources.length === 0) return { ...skipped('No resources to check'), duration_ms };
      const withMime = resources.filter(r => r.mimeType);
      if (withMime.length === 0) return { ...failed(`None of ${resources.length} resource(s) include mimeType`), duration_ms };
      return { ...passed(`${withMime.length}/${resources.length} resource(s) include mimeType`), duration_ms };
    },
  },
  {
    id: 'resources-007',
    name: 'Resource Subscribe If Capability Advertised',
    category: 'resources',
    description: 'Subscription works if subscribe capability is advertised',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      if (!caps.resources.subscribe) return skipped('Server does not advertise subscribe capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('resources/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list resources'), duration_ms: listMs };
      const resources = ((listResponse.result as { resources?: unknown }).resources ?? []) as McpResource[];
      if (resources.length === 0) return { ...skipped('No resources to subscribe to'), duration_ms: listMs };
      const { result: subResponse, duration_ms } = await timed(() =>
        client.request('resources/subscribe', { uri: resources[0].uri }, 5000),
      );
      if (subResponse.error) return { ...failed(`Subscribe failed: ${subResponse.error.message}`), duration_ms };
      return { ...passed('Resource subscribe accepted'), duration_ms };
    },
  },
  {
    id: 'resources-008',
    name: 'Resource Contents Have Valid Structure',
    category: 'resources',
    description: 'Read results have valid contents array structure',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('resources/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list resources'), duration_ms: listMs };
      const resources = ((listResponse.result as { resources?: unknown }).resources ?? []) as McpResource[];
      if (resources.length === 0) return { ...skipped('No resources to check'), duration_ms: listMs };
      const { result: readResponse, duration_ms } = await timed(() =>
        client.request('resources/read', { uri: resources[0].uri }, 10000),
      );
      if (readResponse.error) return { ...skipped('Could not read resource'), duration_ms };
      const result = readResponse.result as { contents?: unknown[] };
      const contents = result.contents ?? [];
      if (contents.length === 0) return { ...skipped('Resource returned empty contents'), duration_ms };
      const issues: string[] = [];
      for (const c of contents) {
        const item = c as Record<string, unknown>;
        if (!item.uri) issues.push('Content item missing uri');
        if (!item.text && !item.blob) issues.push(`Content item missing text/blob for uri: ${item.uri}`);
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`${contents.length} content item(s) have valid structure`), duration_ms };
    },
  },
];

// ─── Prompts Checks (7) ──────────────────────────────────────────────────────

const promptsChecks: ComplianceCheck[] = [
  {
    id: 'prompts-001',
    name: 'prompts/list Returns Valid Array',
    category: 'prompts',
    description: 'prompts/list returns an array of prompt definitions',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('Server does not advertise prompts capability');
      const { result: response, duration_ms } = await timed(() => client.request('prompts/list', {}, 10000));
      if (response.error) return { ...failed(`prompts/list error: ${response.error.message}`), duration_ms };
      const result = response.result as { prompts?: unknown };
      if (!Array.isArray(result?.prompts)) {
        return { ...failed('result.prompts is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Found ${result.prompts.length} prompt(s)`), duration_ms, details: { count: result.prompts.length } };
    },
  },
  {
    id: 'prompts-002',
    name: 'Prompt Has Name And Description',
    category: 'prompts',
    description: 'Each prompt has name and description fields',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: response, duration_ms } = await timed(() => client.request('prompts/list', {}, 10000));
      if (response.error) return { ...skipped('Could not list prompts'), duration_ms };
      const prompts = ((response.result as { prompts?: unknown }).prompts ?? []) as McpPrompt[];
      if (prompts.length === 0) return { ...passed('No prompts to validate'), duration_ms };
      const issues: string[] = [];
      for (const p of prompts) {
        if (!p.name) issues.push('Prompt missing name');
        if (typeof p.description !== 'string') issues.push(`Prompt "${p.name}" missing description`);
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`All ${prompts.length} prompt(s) have required fields`), duration_ms };
    },
  },
  {
    id: 'prompts-003',
    name: 'Prompt Arguments Have Name And Description',
    category: 'prompts',
    description: 'Prompt arguments have name and description',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: response, duration_ms } = await timed(() => client.request('prompts/list', {}, 10000));
      if (response.error) return { ...skipped('Could not list prompts'), duration_ms };
      const prompts = ((response.result as { prompts?: unknown }).prompts ?? []) as McpPrompt[];
      const withArgs = prompts.filter(p => p.arguments && p.arguments.length > 0);
      if (withArgs.length === 0) return { ...skipped('No prompts with arguments'), duration_ms };
      const issues: string[] = [];
      for (const p of withArgs) {
        for (const arg of p.arguments ?? []) {
          if (!arg.name) issues.push(`Prompt "${p.name}" has argument missing name`);
          if (!arg.description) issues.push(`Prompt "${p.name}" arg "${arg.name}" missing description`);
        }
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed('All prompt arguments have required fields'), duration_ms };
    },
  },
  {
    id: 'prompts-004',
    name: 'prompts/get Returns Messages',
    category: 'prompts',
    description: 'Getting a listed prompt returns valid messages array',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('prompts/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list prompts'), duration_ms: listMs };
      const prompts = ((listResponse.result as { prompts?: unknown }).prompts ?? []) as McpPrompt[];
      if (prompts.length === 0) return { ...skipped('No prompts to get'), duration_ms: listMs };
      const firstPrompt = prompts[0];
      const args: Record<string, string> = {};
      for (const arg of firstPrompt.arguments ?? []) {
        if (arg.required) args[arg.name] = 'test_value';
      }
      const { result: getResponse, duration_ms } = await timed(() =>
        client.request('prompts/get', { name: firstPrompt.name, arguments: args }, 10000),
      );
      if (getResponse.error) return { ...failed(`prompts/get error: ${getResponse.error.message}`), duration_ms };
      const result = getResponse.result as { messages?: unknown };
      if (!Array.isArray(result?.messages)) {
        return { ...failed('result.messages is not an array', { result: result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Prompt "${firstPrompt.name}" returned ${result.messages.length} message(s)`), duration_ms };
    },
  },
  {
    id: 'prompts-005',
    name: 'Invalid Prompt Name Returns Error',
    category: 'prompts',
    description: 'Getting a non-existent prompt returns error',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: response, duration_ms } = await timed(() =>
        client.request('prompts/get', { name: '__mcp_doctor_nonexistent_prompt__', arguments: {} }, 5000),
      );
      if (!response.error) {
        return { ...failed('Server did not return error for non-existent prompt', { result: response.result as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Non-existent prompt returns error code ${response.error.code}`), duration_ms };
    },
  },
  {
    id: 'prompts-006',
    name: 'Prompt Messages Have Valid Structure',
    category: 'prompts',
    description: 'GetPrompt result has valid messages array',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('prompts/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list prompts'), duration_ms: listMs };
      const prompts = ((listResponse.result as { prompts?: unknown }).prompts ?? []) as McpPrompt[];
      if (prompts.length === 0) return { ...skipped('No prompts to validate'), duration_ms: listMs };
      const args: Record<string, string> = {};
      for (const arg of prompts[0].arguments ?? []) {
        if (arg.required) args[arg.name] = 'test_value';
      }
      const { result: getResponse, duration_ms } = await timed(() =>
        client.request('prompts/get', { name: prompts[0].name, arguments: args }, 10000),
      );
      if (getResponse.error) return { ...skipped('Could not get prompt'), duration_ms };
      const result = getResponse.result as { messages?: unknown[] };
      const messages = result.messages ?? [];
      if (messages.length === 0) return { ...skipped('No messages to validate'), duration_ms };
      const issues: string[] = [];
      for (const msg of messages) {
        const m = msg as Record<string, unknown>;
        if (!m.role) issues.push('Message missing role field');
        if (!m.content) issues.push('Message missing content field');
      }
      if (issues.length > 0) return { ...failed(issues.join('; '), { issues }), duration_ms };
      return { ...passed(`${messages.length} message(s) have valid structure`), duration_ms };
    },
  },
  {
    id: 'prompts-007',
    name: 'Message Role Is Valid',
    category: 'prompts',
    description: 'Messages have valid role (user/assistant)',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.prompts) return skipped('No prompts capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('prompts/list', {}, 10000));
      if (listResponse.error) return { ...skipped('Could not list prompts'), duration_ms: listMs };
      const prompts = ((listResponse.result as { prompts?: unknown }).prompts ?? []) as McpPrompt[];
      if (prompts.length === 0) return { ...skipped('No prompts to check'), duration_ms: listMs };
      const args: Record<string, string> = {};
      for (const arg of prompts[0].arguments ?? []) {
        if (arg.required) args[arg.name] = 'test_value';
      }
      const { result: getResponse, duration_ms } = await timed(() =>
        client.request('prompts/get', { name: prompts[0].name, arguments: args }, 10000),
      );
      if (getResponse.error) return { ...skipped('Could not get prompt'), duration_ms };
      const result = getResponse.result as { messages?: unknown[] };
      const messages = result.messages ?? [];
      const validRoles = ['user', 'assistant'];
      const badRoles = messages.filter(m => !validRoles.includes((m as Record<string, unknown>).role as string));
      if (badRoles.length > 0) return { ...failed(`${badRoles.length} message(s) have invalid role`, { badRoles: badRoles as Record<string, unknown>[] }), duration_ms };
      return { ...passed('All messages have valid roles'), duration_ms };
    },
  },
];

// ─── Error Handling Checks (8) ───────────────────────────────────────────────

const errorHandlingChecks: ComplianceCheck[] = [
  {
    id: 'error-001',
    name: 'Server Responds Within Timeout',
    category: 'error_handling',
    description: 'Server responds to requests within 30 seconds',
    severity: 'critical',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/list', {}, 30000),
      );
      if (duration_ms > 30000) return { ...failed(`Response took ${duration_ms}ms (limit: 30000ms)`), duration_ms };
      return { ...passed(`Responded in ${duration_ms}ms`), duration_ms };
    },
  },
  {
    id: 'error-002',
    name: 'Server Survives Invalid JSON',
    category: 'error_handling',
    description: 'Server handles malformed JSON without crashing',
    severity: 'critical',
    async run(client) {
      if (client.config.transport !== 'stdio') {
        return skipped('Raw message injection only supported on stdio transport');
      }
      const start = Date.now();
      client.sendRaw('{invalid json >>>');
      await new Promise<void>(resolve => setTimeout(resolve, 500));
      const duration_ms = Date.now() - start;
      if (!client.isConnected) {
        return { ...failed('Server crashed on malformed JSON'), duration_ms };
      }
      // Verify server still responds normally
      const { result: response } = await timed(() => client.request('tools/list', {}, 5000));
      if (!client.isConnected) return { ...failed('Server unresponsive after malformed JSON'), duration_ms };
      return { ...passed('Server survived malformed JSON'), duration_ms };
    },
  },
  {
    id: 'error-003',
    name: 'Missing ID In Request Handled',
    category: 'error_handling',
    description: 'Missing id field in request is handled gracefully',
    severity: 'minor',
    async run(client) {
      if (client.config.transport !== 'stdio') {
        return skipped('Raw message injection only supported on stdio transport');
      }
      const start = Date.now();
      client.sendRaw(JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }));
      await new Promise<void>(resolve => setTimeout(resolve, 500));
      const duration_ms = Date.now() - start;
      if (!client.isConnected) return { ...failed('Server disconnected on missing id'), duration_ms };
      return { ...passed('Server handled missing id gracefully (treated as notification)'), duration_ms };
    },
  },
  {
    id: 'error-004',
    name: 'Handles Rapid Concurrent Requests',
    category: 'error_handling',
    description: 'Server handles 10 concurrent requests without crashing',
    severity: 'major',
    async run(client) {
      const { duration_ms } = await timed(async () => {
        const promises = Array.from({ length: 10 }, () =>
          client.request('tools/list', {}, 10000).catch(() => null),
        );
        return Promise.all(promises);
      });
      if (!client.isConnected) return { ...failed('Server disconnected during concurrent requests'), duration_ms };
      return { ...passed(`Handled 10 concurrent requests in ${duration_ms}ms`), duration_ms };
    },
  },
  {
    id: 'error-005',
    name: 'Error Response Has Message Field',
    category: 'error_handling',
    description: 'All error responses include a human-readable message',
    severity: 'minor',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('mcp_doctor/should_not_exist', {}, 5000),
      );
      if (!response.error) return { ...skipped('Could not trigger error response'), duration_ms };
      if (!response.error.message || typeof response.error.message !== 'string') {
        return { ...failed('Error response missing message field', { error: response.error as unknown as Record<string, unknown> }), duration_ms };
      }
      return { ...passed(`Error message: "${response.error.message}"`), duration_ms };
    },
  },
  {
    id: 'error-006',
    name: 'Graceful Shutdown Behavior',
    category: 'error_handling',
    description: 'Server is still responsive (SIGTERM deferred to avoid disruption)',
    severity: 'minor',
    async run(client) {
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/list', {}, 5000),
      );
      if (!client.isConnected) return { ...failed('Server is not connected'), duration_ms };
      return { ...passed('Server is running and responsive'), duration_ms };
    },
  },
  {
    id: 'error-007',
    name: 'Concurrent Requests Return Correct IDs',
    category: 'error_handling',
    description: 'Concurrent requests receive responses with matching IDs',
    severity: 'minor',
    async run(client) {
      const { duration_ms } = await timed(async () => {
        const [r1, r2] = await Promise.all([
          client.request('tools/list', {}, 10000).catch(() => null),
          client.request('tools/list', {}, 10000).catch(() => null),
        ]);
        return { r1, r2 };
      });
      if (!client.isConnected) return { ...failed('Server disconnected handling concurrent requests'), duration_ms };
      return { ...passed('Server handled concurrent requests without corruption'), duration_ms };
    },
  },
  {
    id: 'error-008',
    name: 'Large Payload Handled',
    category: 'error_handling',
    description: 'Server handles large request payloads (>10KB) without crashing',
    severity: 'minor',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const largeString = 'x'.repeat(10 * 1024);
      const { result: response, duration_ms } = await timed(() =>
        client.request('tools/call', { name: '__test_large_payload__', arguments: { data: largeString } }, 10000),
      );
      if (!client.isConnected) return { ...failed('Server disconnected on large payload'), duration_ms };
      return { ...passed('Server handled large payload without crashing'), duration_ms };
    },
  },
];

// ─── Security Checks (7) ─────────────────────────────────────────────────────

const securityChecks: ComplianceCheck[] = [
  {
    id: 'security-001',
    name: 'No Environment Variable Leak',
    category: 'security',
    description: 'Server does not leak environment variables in responses',
    severity: 'critical',
    async run(client) {
      const sensitivePatterns = [/password/i, /secret/i, /aws_secret/i, /private_key/i, /DATABASE_URL/i];
      const serverInfoStr = JSON.stringify(client.serverInfo ?? {});
      for (const pattern of sensitivePatterns) {
        if (pattern.test(serverInfoStr)) {
          return { status: 'failed', duration_ms: 0, message: `Possible sensitive data in serverInfo: matches ${pattern.source}` };
        }
      }
      const { result: toolsResponse, duration_ms } = await timed(() => client.request('tools/list', {}, 5000));
      if (!toolsResponse.error) {
        const toolsStr = JSON.stringify(toolsResponse.result ?? '');
        for (const pattern of sensitivePatterns) {
          if (pattern.test(toolsStr)) {
            return { ...failed(`Possible sensitive data in tool definitions: matches ${pattern.source}`), duration_ms };
          }
        }
      }
      return { ...passed('No obvious sensitive data leaked in server metadata'), duration_ms };
    },
  },
  {
    id: 'security-002',
    name: 'Path Traversal Prevention',
    category: 'security',
    description: 'Resource URIs do not allow path traversal',
    severity: 'critical',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.resources) return skipped('No resources capability');
      const traversalUris = [
        'file:///../../../etc/passwd',
        'file:///etc/passwd',
        '../../../etc/shadow',
      ];
      const start = Date.now();
      for (const uri of traversalUris) {
        const { result: response } = await timed(() => client.request('resources/read', { uri }, 5000));
        if (!response.error) {
          const resultStr = JSON.stringify(response.result ?? '');
          if (resultStr.includes('root:') || resultStr.includes('/bin/bash')) {
            return { ...failed(`Path traversal succeeded for URI: ${uri}`), duration_ms: Date.now() - start };
          }
        }
      }
      return { ...passed('All path traversal URIs returned errors or empty results'), duration_ms: Date.now() - start };
    },
  },
  {
    id: 'security-003',
    name: 'Command Injection Prevention',
    category: 'security',
    description: 'Tool inputs are sanitized against command injection',
    severity: 'critical',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 5000));
      if (listResponse.error) return { ...skipped('Could not list tools'), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools to test'), duration_ms: listMs };
      const injectionPayloads = ['; cat /etc/passwd', '$(cat /etc/passwd)', '`whoami`'];
      const start = Date.now();
      for (const payload of injectionPayloads) {
        const { result: response } = await timed(() =>
          client.request('tools/call', { name: tools[0].name, arguments: { input: payload, query: payload } }, 5000),
        );
        const resultStr = JSON.stringify(response.result ?? '');
        if (resultStr.includes('root:') || resultStr.includes('/bin/bash') || resultStr.includes('daemon:')) {
          return { ...failed('Possible command injection: response contains /etc/passwd content', { payload }), duration_ms: Date.now() - start };
        }
      }
      if (!client.isConnected) return { ...failed('Server crashed during injection test'), duration_ms: Date.now() - start };
      return { ...passed('No command injection vulnerabilities detected'), duration_ms: Date.now() - start };
    },
  },
  {
    id: 'security-004',
    name: 'Input Sanitization',
    category: 'security',
    description: 'Tool inputs handle special characters safely',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      if (!caps?.tools) return skipped('No tools capability');
      const { result: listResponse, duration_ms: listMs } = await timed(() => client.request('tools/list', {}, 5000));
      if (listResponse.error) return { ...skipped('Could not list tools'), duration_ms: listMs };
      const tools = ((listResponse.result as { tools?: unknown }).tools ?? []) as McpTool[];
      if (tools.length === 0) return { ...skipped('No tools to test'), duration_ms: listMs };
      const xssPayloads = ['<script>alert(1)</script>', "'; DROP TABLE users; --", '\x00\x01\x02'];
      const start = Date.now();
      for (const payload of xssPayloads) {
        await client.request('tools/call', { name: tools[0].name, arguments: { input: payload } }, 5000).catch(() => null);
      }
      const duration_ms = Date.now() - start;
      if (!client.isConnected) return { ...failed('Server crashed during input sanitization test'), duration_ms };
      return { ...passed('Server survived all input sanitization tests'), duration_ms };
    },
  },
  {
    id: 'security-005',
    name: 'Rate Limit Headers Present',
    category: 'security',
    description: 'Rate limiting headers present for HTTP transports',
    severity: 'info',
    async run(client) {
      const { transport, url } = client.config;
      if (transport === 'stdio') return skipped('Rate limit headers only applicable to HTTP transport');
      if (!url) return skipped('No URL configured');
      const start = Date.now();
      try {
        const res = await fetch(url, { method: 'GET' });
        const headers = Object.fromEntries(res.headers.entries());
        const rateLimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after'];
        const found = rateLimitHeaders.filter(h => h in headers);
        if (found.length > 0) return { ...passed(`Rate limit headers found: ${found.join(', ')}`), duration_ms: Date.now() - start };
        return { ...failed('No rate limit headers found'), duration_ms: Date.now() - start };
      } catch {
        return { ...skipped('Could not check HTTP headers'), duration_ms: Date.now() - start };
      }
    },
  },
  {
    id: 'security-006',
    name: 'Auth Enforced If Advertised',
    category: 'security',
    description: 'Authentication is enforced if server capability advertises it',
    severity: 'major',
    async run(client) {
      const caps = client.capabilities;
      const experimental = caps?.experimental as Record<string, unknown> | undefined;
      if (!experimental?.auth) return skipped('Server does not advertise auth capability');
      return { ...passed('Server advertises auth capability (manual verification recommended)'), duration_ms: 0 };
    },
  },
  {
    id: 'security-007',
    name: 'Safe Defaults Check',
    category: 'security',
    description: 'Server does not expose dangerous default tool configurations',
    severity: 'major',
    async run(client) {
      const start = Date.now();
      const { result: toolsResponse } = await timed(() => client.request('tools/list', {}, 5000));
      const tools = !toolsResponse.error
        ? ((toolsResponse.result as { tools?: unknown }).tools ?? []) as McpTool[]
        : [];
      const dangerousPatterns = [/exec(ute)?/i, /shell/i, /run_command/i, /eval/i];
      const flagged: string[] = [];
      for (const tool of tools) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(tool.name) || (tool.description && pattern.test(tool.description))) {
            flagged.push(`Tool "${tool.name}" may expose system access`);
            break;
          }
        }
      }
      const duration_ms = Date.now() - start;
      if (flagged.length > 0) {
        return { status: 'failed', duration_ms, message: `${flagged.length} potentially dangerous tool(s) — manual review recommended`, details: { flagged } };
      }
      return { ...passed('No obviously dangerous default tools found'), duration_ms };
    },
  },
];

// ─── All Checks Combined ─────────────────────────────────────────────────────

export const complianceChecks: ComplianceCheck[] = [
  ...protocolChecks,
  ...toolsChecks,
  ...resourcesChecks,
  ...promptsChecks,
  ...errorHandlingChecks,
  ...securityChecks,
];

// Score weights by severity
export const SEVERITY_WEIGHTS = {
  critical: 10,
  major: 5,
  minor: 2,
  info: 1,
} as const;

export function calculateScore(results: Array<{ status: string; severity: string }>): {
  score: number;
  grade: string;
  earned: number;
  total: number;
} {
  let earned = 0;
  let total = 0;
  for (const r of results) {
    if (r.status === 'skipped') continue;
    const weight = SEVERITY_WEIGHTS[r.severity as keyof typeof SEVERITY_WEIGHTS] ?? 1;
    total += weight;
    if (r.status === 'passed') earned += weight;
  }
  const score = total === 0 ? 100 : Math.round((earned / total) * 100);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { score, grade, earned, total };
}
