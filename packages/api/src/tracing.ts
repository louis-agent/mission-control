import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Tracer,
  type Span,
  type Context,
} from '@opentelemetry/api';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'mission-control';
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | null = null;

/**
 * Initialise the OpenTelemetry SDK.
 * Call this once, as early as possible in the process lifecycle.
 * Set OTEL_ENABLED=true to activate; no-ops otherwise.
 */
export function initTracing(): void {
  if (!OTEL_ENABLED) return;

  const exporter = new OTLPTraceExporter({ url: `${OTLP_ENDPOINT}/v1/traces` });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy filesystem instrumentation
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Gracefully shut down the SDK (flushes pending spans).
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) await sdk.shutdown();
}

// ── Manual span helpers ───────────────────────────────────────────────────────

export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAME, '0.1.0');
}

/**
 * Run `fn` inside a new span, setting error status if it throws.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
  parentCtx?: Context,
): Promise<T> {
  const tracer = getTracer();
  const ctx = parentCtx ?? context.active();

  return tracer.startActiveSpan(name, { attributes }, ctx, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Propagate the active trace context into a plain JS object for storage/passing
 * through task payloads (e.g. so downstream steps can continue the trace).
 */
export function extractTraceContext(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!OTEL_ENABLED) return headers;
  propagation.inject(context.active(), headers);
  return headers;
}
