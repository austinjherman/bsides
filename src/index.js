const COOKIE = "lj_session";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function sessionToken(password) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("lyrics-journal-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const [k, ...v] = part.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function asset(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (!env.PASSWORD) return new Response("Set the PASSWORD secret: npx wrangler secret put PASSWORD", { status: 500 });
    const token = await sessionToken(env.PASSWORD);
    const secure = url.protocol === "https:" ? "; Secure" : "";

    // --- auth routes ---
    if (pathname === "/login" && method === "POST") {
      const form = await request.formData();
      if (safeEqual(String(form.get("password") || ""), env.PASSWORD)) {
        return new Response(null, {
          status: 303,
          headers: {
            location: "/",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
          },
        });
      }
      return Response.redirect(new URL("/?error=1", url), 303);
    }
    if (pathname === "/logout") {
      return new Response(null, {
        status: 303,
        headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` },
      });
    }

    const authed = safeEqual(getCookie(request, COOKIE), token);

    if (!pathname.startsWith("/api/")) {
      if (pathname === "/" || pathname === "/index.html") {
        return asset(env, request, authed ? "/app" : "/login");
      }
      if (pathname.startsWith("/app") && !pathname.endsWith(".js")) return Response.redirect(new URL("/", url), 302);
      return env.ASSETS.fetch(request);
    }

    if (!authed) return json({ error: "unauthorized" }, 401);

    // --- API ---
    const now = Date.now();
    const match = pathname.match(/^\/api\/entries(?:\/([\w-]+))?$/);
    if (!match) return json({ error: "not found" }, 404);
    const id = match[1];

    if (!id && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const sql = q
        ? "SELECT id, title, substr(body, 1, 140) AS preview, updated_at FROM entries WHERE title LIKE ?1 OR body LIKE ?1 ORDER BY updated_at DESC"
        : "SELECT id, title, substr(body, 1, 140) AS preview, updated_at FROM entries ORDER BY updated_at DESC";
      const stmt = env.DB.prepare(sql);
      const { results } = await (q ? stmt.bind(`%${q}%`) : stmt).all();
      return json(results);
    }

    if (!id && method === "POST") {
      const { title = "", body = "" } = await request.json().catch(() => ({}));
      const newId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO entries (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(newId, String(title), String(body), now, now).run();
      return json({ id: newId, title, body, created_at: now, updated_at: now }, 201);
    }

    if (id && method === "GET") {
      const row = await env.DB.prepare("SELECT * FROM entries WHERE id = ?").bind(id).first();
      return row ? json(row) : json({ error: "not found" }, 404);
    }

    if (id && method === "PUT") {
      const { title = "", body = "" } = await request.json().catch(() => ({}));
      const res = await env.DB.prepare("UPDATE entries SET title = ?, body = ?, updated_at = ? WHERE id = ?")
        .bind(String(title), String(body), now, id).run();
      return res.meta.changes ? json({ id, updated_at: now }) : json({ error: "not found" }, 404);
    }

    if (id && method === "DELETE") {
      await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  },
};
