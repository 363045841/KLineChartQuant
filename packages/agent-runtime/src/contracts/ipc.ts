import { Type, type Static, type TSchema } from 'typebox'
import { Value } from 'typebox/value'

import { AgentRuntimeError } from './errors.js'

export const AGENT_IPC_PROTOCOL_VERSION = 2 as const
export const AGENT_IPC_PAYLOAD_VERSION = 3 as const
export const AGENT_IPC_MAX_PAYLOAD_BYTES = 256 * 1024

const Strict = { additionalProperties: false } as const
const Id = Type.String({ minLength: 1, maxLength: 160 })
const BaseEnvelope = {
  protocolVersion: Type.Literal(AGENT_IPC_PROTOCOL_VERSION),
  payloadVersion: Type.Literal(AGENT_IPC_PAYLOAD_VERSION),
  windowId: Id,
  chartId: Id,
  requestId: Id,
  deadlineAt: Type.Number({ minimum: 0 }),
}

const NoPayload = Type.Object({}, Strict)
const SessionPayload = Type.Object({ sessionId: Id }, Strict)
const RunPayload = Type.Object({ runId: Id }, Strict)
const ProviderApiProtocolSchema = Type.Union([
  Type.Literal('openai-completions'),
  Type.Literal('openai-responses'),
])

export const AgentIpcRequestSchema = Type.Union([
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('session.list'), payload: NoPayload },
    Strict,
  ),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('session.create'), payload: NoPayload },
    Strict,
  ),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('session.open'), payload: SessionPayload },
    Strict,
  ),
  Type.Object(
    {
      ...BaseEnvelope,
      command: Type.Literal('session.rename'),
      payload: Type.Object(
        { sessionId: Id, title: Type.String({ minLength: 1, maxLength: 160 }) },
        Strict,
      ),
    },
    Strict,
  ),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('session.delete'), payload: SessionPayload },
    Strict,
  ),
  Type.Object(
    {
      ...BaseEnvelope,
      command: Type.Literal('run.start'),
      payload: Type.Object(
        {
          sessionId: Id,
          prompt: Type.String({ minLength: 1, maxLength: 64 * 1024 }),
          readOnly: Type.Boolean(),
        },
        Strict,
      ),
    },
    Strict,
  ),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('run.cancel'), payload: RunPayload },
    Strict,
  ),
  Type.Object({ ...BaseEnvelope, command: Type.Literal('run.retry'), payload: RunPayload }, Strict),
  Type.Object(
    {
      ...BaseEnvelope,
      command: Type.Literal('tool.confirm'),
      payload: Type.Object(
        {
          confirmationId: Id,
          decision: Type.Union([Type.Literal('confirmed'), Type.Literal('rejected')]),
        },
        Strict,
      ),
    },
    Strict,
  ),
  Type.Object({ ...BaseEnvelope, command: Type.Literal('turn.undo'), payload: RunPayload }, Strict),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('provider.status'), payload: NoPayload },
    Strict,
  ),
  Type.Object(
    {
      ...BaseEnvelope,
      command: Type.Literal('provider.models'),
      payload: Type.Object(
        {
          baseUrl: Type.String({ minLength: 1, maxLength: 2048 }),
          apiKey: Type.Optional(Type.String({ minLength: 1, maxLength: 8192 })),
          protocol: ProviderApiProtocolSchema,
        },
        Strict,
      ),
    },
    Strict,
  ),
  Type.Object(
    {
      ...BaseEnvelope,
      command: Type.Literal('provider.test'),
      payload: Type.Object(
        {
          baseUrl: Type.String({ minLength: 1, maxLength: 2048 }),
          apiKey: Type.Optional(Type.String({ minLength: 1, maxLength: 8192 })),
          model: Type.String({ minLength: 1, maxLength: 256 }),
          protocol: ProviderApiProtocolSchema,
        },
        Strict,
      ),
    },
    Strict,
  ),
  Type.Object(
    { ...BaseEnvelope, command: Type.Literal('provider.delete'), payload: NoPayload },
    Strict,
  ),
])

export type AgentIpcRequest = Static<typeof AgentIpcRequestSchema>

function assertSchema<TSchema_ extends TSchema>(
  schema: TSchema_,
  value: unknown,
): Static<TSchema_> {
  if (!Value.Check(schema, value)) {
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Agent command payload is invalid.')
  }
  return value as Static<TSchema_>
}

export function parseAgentIpcRequest(value: unknown, now = Date.now()): AgentIpcRequest {
  let serialized: string
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('The payload is not JSON serializable.')
    serialized = encoded
  } catch {
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Agent command payload is invalid.')
  }
  const byteLength = new TextEncoder().encode(serialized).byteLength
  if (byteLength > AGENT_IPC_MAX_PAYLOAD_BYTES) {
    throw new AgentRuntimeError('PAYLOAD_TOO_LARGE', 'The Agent command payload is too large.')
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'protocolVersion' in value &&
    value.protocolVersion !== AGENT_IPC_PROTOCOL_VERSION
  ) {
    throw new AgentRuntimeError(
      'INVALID_PROTOCOL',
      'The Agent IPC protocol version is not supported.',
    )
  }
  const request = assertSchema(AgentIpcRequestSchema, value)
  if (request.deadlineAt <= now) {
    throw new AgentRuntimeError('DEADLINE_EXCEEDED', 'The Agent command deadline has expired.', {
      retryable: true,
    })
  }
  return request
}
