type Context = Record<string, unknown>;

type Operator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'matches';

interface ParsedCondition {
  field: string;
  op: Operator;
  value: string;
}

const OPERATORS: Operator[] = ['>=', '<=', '!=', '==', '>', '<', 'contains', 'matches'];

function parse(expr: string): ParsedCondition | null {
  const trimmed = expr.trim();
  for (const op of OPERATORS) {
    const idx = trimmed.indexOf(` ${op} `);
    if (idx === -1) continue;
    const field = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + op.length + 2).trim();
    return { field, op, value };
  }
  return null;
}

function coerce(raw: unknown, value: string): { lhs: unknown; rhs: unknown } {
  const num = Number(value);
  if (!isNaN(num) && value !== '') return { lhs: Number(raw), rhs: num };
  if (value === 'true') return { lhs: raw, rhs: true };
  if (value === 'false') return { lhs: raw, rhs: false };
  return { lhs: raw, rhs: value };
}

/**
 * Evaluates a simple condition expression against a context object.
 *
 * Supported operators: == != > >= < <= contains matches
 * Returns false on any parse error or missing field.
 */
export function evaluateCondition(expr: string, ctx: Context): boolean {
  const parsed = parse(expr);
  if (!parsed) return false;

  const { field, op, value } = parsed;
  if (!(field in ctx)) return false;

  const raw = ctx[field];

  try {
    switch (op) {
      case '==': {
        const { lhs, rhs } = coerce(raw, value);
        return lhs === rhs;
      }
      case '!=': {
        const { lhs, rhs } = coerce(raw, value);
        return lhs !== rhs;
      }
      case '>': {
        return Number(raw) > Number(value);
      }
      case '>=': {
        return Number(raw) >= Number(value);
      }
      case '<': {
        return Number(raw) < Number(value);
      }
      case '<=': {
        return Number(raw) <= Number(value);
      }
      case 'contains': {
        if (Array.isArray(raw)) return raw.includes(value);
        if (typeof raw === 'string') return raw.includes(value);
        return false;
      }
      case 'matches': {
        const re = new RegExp(value);
        return re.test(String(raw));
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
