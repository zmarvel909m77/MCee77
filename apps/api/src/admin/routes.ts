import type { FastifyInstance } from "fastify";
import type { UserRepository } from "@mcee77/db";
import type { MatchmakingService } from "../air-hockey/matchmaking.js";
import {
  adminConfigured,
  adminCookieHeader,
  extractAdminSecret,
  isValidAdminSecret,
  requireAdmin,
} from "./auth.js";
import { renderAdminLoginPage, renderAdminStatsPage } from "./page.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  opts: {
    users: UserRepository;
    matchmaking: MatchmakingService;
  },
): void {
  app.get("/api/v1/admin/stats", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const live = opts.matchmaking.stats;
    const stats = opts.users.getAdminStats({
      airHockey: {
        activeRooms: live.activeRooms,
        queueDepth: live.queueDepth,
      },
      topLimit: 5,
    });
    return stats;
  });

  app.get("/admin/", async (_request, reply) =>
    reply.redirect("/admin", 302),
  );

  app.get("/admin", async (request, reply) => {
    if (!adminConfigured()) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    const query = request.query as { key?: string; need_key?: string };
    const candidate = extractAdminSecret(request);
    const secure =
      request.protocol === "https" ||
      request.headers["x-forwarded-proto"] === "https";

    // Gate via ?key=SECRET → set cookie and land on clean /admin
    if (typeof query.key === "string" && query.key.trim()) {
      if (!isValidAdminSecret(query.key.trim())) {
        return reply
          .code(403)
          .type("text/html; charset=utf-8")
          .send(
            renderAdminLoginPage({
              error: "Kalit noto‘g‘ri",
            }),
          );
      }
      reply.header(
        "Set-Cookie",
        adminCookieHeader(query.key.trim(), secure),
      );
      return reply.redirect("/admin", 302);
    }

    if (!isValidAdminSecret(candidate)) {
      const error =
        query.need_key === "1"
          ? "Sessiya tugadi — qayta kiring"
          : undefined;
      return reply
        .code(401)
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .send(renderAdminLoginPage({ error }));
    }

    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(renderAdminStatsPage());
  });
}
