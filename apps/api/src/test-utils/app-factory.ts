import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppEnv, SessionUser } from "../lib/auth.js";

export function createTestApp(
  mountPath: string,
  routes: Hono<AppEnv>,
  user: SessionUser,
  middleware?: MiddlewareHandler<AppEnv>[]
) {
  const app = new Hono<AppEnv>();
  app.use("/*", async (c, next) => {
    c.set("user", user);
    await next();
  });
  if (middleware) {
    for (const mw of middleware) {
      app.use(`${mountPath}/*`, mw);
    }
  }
  app.route(mountPath, routes);
  return app;
}
