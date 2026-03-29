import {
  type KyselyPlugin,
  OperationNodeTransformer,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
} from "kysely";

/**
 * Returns true for plain objects ({}) and arrays that should be
 * JSON.stringified before being sent to PostgreSQL JSONB columns.
 *
 * Leaves primitives, null, undefined, Date, Buffer, and other
 * non-plain-object types untouched.
 */
function shouldStringify(value: unknown): value is Record<string, unknown> | unknown[] {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  if (value instanceof Date) return false;
  if (Buffer.isBuffer(value)) return false;
  // Plain object or array
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null || Array.isArray(value);
}

class JsonbTransformer extends OperationNodeTransformer {
  protected override transformValue(node: ValueNode): ValueNode {
    if (shouldStringify(node.value)) {
      return { ...node, value: JSON.stringify(node.value) };
    }
    return node;
  }
}

/**
 * Kysely plugin that automatically JSON.stringify() plain objects and arrays
 * in INSERT/UPDATE values so that JSONB columns work without manual
 * `JSON.stringify(...) as any` at each call site.
 */
export class JsonbStringifyPlugin implements KyselyPlugin {
  readonly #transformer = new JsonbTransformer();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.#transformer.transformNode(args.node);
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }
}
