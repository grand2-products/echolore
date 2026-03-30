import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import { describe, expect, it } from "vitest";
import { JsonbStringifyPlugin } from "./jsonb-stringify-plugin.js";

interface TestDatabase {
  test_table: {
    id: string;
    name: string;
    count: number;
    data: string | null;
    createdAt: Date;
  };
}

function createDb() {
  // biome-ignore lint/suspicious/noExplicitAny: pool stub for compile-only usage
  return new Kysely<TestDatabase>({
    dialect: new PostgresDialect({ pool: {} as never }),
    plugins: [new CamelCasePlugin(), new JsonbStringifyPlugin()],
  });
}

describe("JsonbStringifyPlugin", () => {
  it("stringifies arrays in INSERT values", () => {
    const db = createDb();
    const q = db
      .insertInto("test_table")
      .values({
        id: "1",
        name: "",
        count: 0,
        data: [{ key: "value" }] as unknown as string,
        createdAt: new Date(),
      })
      .compile();

    const dataParam = q.parameters[3];
    expect(typeof dataParam).toBe("string");
    expect(dataParam).toBe('[{"key":"value"}]');
  });

  it("stringifies plain objects in INSERT values", () => {
    const db = createDb();
    const q = db
      .insertInto("test_table")
      .values({
        id: "1",
        name: "",
        count: 0,
        data: { key: "value" } as unknown as string,
        createdAt: new Date(),
      })
      .compile();

    const dataParam = q.parameters[3];
    expect(typeof dataParam).toBe("string");
    expect(dataParam).toBe('{"key":"value"}');
  });

  it("leaves null unchanged", () => {
    const db = createDb();
    const q = db
      .insertInto("test_table")
      .values({ id: "1", name: "", count: 0, data: null, createdAt: new Date() })
      .compile();

    expect(q.parameters[3]).toBeNull();
  });

  it("leaves strings and numbers unchanged", () => {
    const db = createDb();
    const q = db
      .insertInto("test_table")
      .values({ id: "1", name: "hello", count: 42, data: null, createdAt: new Date() })
      .compile();

    expect(q.parameters[1]).toBe("hello");
    expect(q.parameters[2]).toBe(42);
  });

  it("leaves Date unchanged", () => {
    const db = createDb();
    const date = new Date("2026-01-01");
    const q = db
      .insertInto("test_table")
      .values({ id: "1", name: "", count: 0, data: null, createdAt: date })
      .compile();

    expect(q.parameters[4]).toBeInstanceOf(Date);
  });

  it("stringifies objects in UPDATE set", () => {
    const db = createDb();
    const q = db
      .updateTable("test_table")
      .set({ data: [{ key: "value" }] as unknown as string })
      .where("id", "=", "1")
      .compile();

    const dataParam = q.parameters[0];
    expect(typeof dataParam).toBe("string");
    expect(dataParam).toBe('[{"key":"value"}]');
  });
});
