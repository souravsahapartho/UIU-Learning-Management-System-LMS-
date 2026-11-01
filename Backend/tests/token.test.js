// Token groundwork: signing, expiry, invalid tokens, no enforcement, CORS. Mode from AUTH_SECRET env.
const h = require("./harness"), crypto = require("crypto"); const sha = p => crypto.createHash("sha256").update(p).digest("hex");
const PORT = +process.argv[3], B = "http://127.0.0.1:" + PORT, S = process.env.AUTH_SECRET || "", on = S.length >= 32;
const req = (m, u, b, hdr = {}) => fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...hdr }, body: b && JSON.stringify(b) });
const call = (m, u, b, tok) => req(m, u, b, tok ? { Authorization: "Bearer " + tok } : {}).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = []; const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const forge = (claims, secret) => { const p = b64(claims); return p + "." + crypto.createHmac("sha256", secret).update(p).digest("base64url"); };
(async () => {
  await h.start(process.argv[2], PORT);
  h.users.push({ id: 1, name: "Stu", email: "s@x", password: sha("pw"), role: "student", status: "Approved" }, { id: 2, name: "B", email: "b@x", password: sha("pw"), role: "student", status: "Approved" }, { id: 3, name: "P", email: "p@x", password: sha("pw"), role: "student", status: "Pending" });
  const login = await call("POST", "/login", { email: "s@x", password: "pw" });
  t("admin signup still rejected (PR #6 kept)", (await call("POST", "/signup", { email: "e@x", password: "p", role: "admin" })).s === 400);
  if (on) {
    t("login 200 returns user without password", login.s === 200 && login.j.user.email === "s@x" && !("password" in login.j.user));
    t("Pending login still 403, no token (PR #6 kept)", await call("POST", "/login", { email: "p@x", password: "pw" }).then(r => r.s === 403 && !r.j.token));
  }
  if (!on) {
    t("login refused with 503 and no token when AUTH_SECRET " + (S ? "too short" : "unset"), login.s === 503 && /AUTH_SECRET/.test(login.j.error) && !login.j.token && !login.j.user);
    t("token forged with the short/empty secret ignored", (await call("GET", "/auth/me", null, forge({ sub: 1, exp: 9e9 }, S || "x"))).s === 401);
  } else {
    const tok = login.j.token, [p64, sig] = tok.split("."), claims = JSON.parse(Buffer.from(p64, "base64url"));
    t("token has 2 parts; claims sub/iat/exp only", tok.split(".").length === 2 && Object.keys(claims).sort().join() === "exp,iat,sub" && claims.sub === 1);
    t("token lifetime is 7 days", claims.exp - claims.iat === 604800 && Math.abs(claims.iat - Date.now() / 1000) < 5);
    t("signature is HMAC-SHA256(payload, AUTH_SECRET)", sig === crypto.createHmac("sha256", S).update(p64).digest("base64url"));
    t("token does not contain email/role/password", !/s@x|student|scrypt|password/.test(Buffer.from(p64, "base64url").toString()));
    const me = await call("GET", "/auth/me", null, tok); t("/auth/me with valid token -> that user, no password", me.s === 200 && me.j.user.id === 1 && !("password" in me.j.user));
    const bad = { "payload swapped to another user": b64({ sub: 2, iat: 1, exp: 9e9 }) + "." + sig, "wrong secret": forge({ sub: 1, exp: 9e9 }, "y".repeat(64)),
      "expired (exp in past)": forge({ sub: 1, iat: 1, exp: Math.floor(Date.now() / 1000) - 1 }, S), "missing exp": forge({ sub: 1 }, S), "missing sub": forge({ exp: 9e9 }, S),
      "non-JSON payload": (() => { const p = Buffer.from("notjson").toString("base64url"); return p + "." + crypto.createHmac("sha256", S).update(p).digest("base64url"); })(),
      "three parts": tok + ".x", "empty": "", "garbage": "abc.def", "alg-none style": b64({ alg: "none" }) + "." + p64 + "." };
    for (const [n, v] of Object.entries(bad)) t("rejected: " + n, (await call("GET", "/auth/me", null, v)).s === 401);
    t("rejected: lowercase 'bearer' scheme", (await req("GET", "/auth/me", null, { Authorization: "bearer " + tok })).status === 401);
    t("rejected: user deleted after token issued", (await call("GET", "/auth/me", null, forge({ sub: 99, exp: 9e9 }, S))).s === 401);
    const banTok = (await call("POST", "/login", { email: "b@x", password: "pw" })).j.token; h.users.find(u => u.id === 2).status = "Banned";
    t("rejected: user banned after token issued", (await call("GET", "/auth/me", null, banTok)).s === 401);
    // No enforcement: every GET route answers the same with no token, a bad token, and a valid token.
    const gets = ["/", "/courses"];
    let same = 0; for (const g of gets) { const a = (await call("GET", g)).s, b2 = (await call("GET", g, null, "garbage")).s, c = (await call("GET", g, null, tok)).s; if (a === b2 && b2 === c) same++; else out.push(`  differs ${g}: ${a}/${b2}/${c}`); }
    t(`no enforcement: ${same}/${gets.length} GET routes identical without/with bad/with valid token`, same === gets.length);
    const w = [["PUT", "/update-profile", { email: "s@x", name: "N", avatar: "U" }], ["POST", "/course-chats", { course_id: 1, user_email: "s@x", user_name: "S", message: "hi" }], ["PUT", "/notifications/read", { identifier: "s@x" }]];
    let wsame = 0; for (const [m, u, b] of w) { const a = (await call(m, u, b)).s, c = (await call(m, u, b, "garbage")).s; if (a === c) wsame++; else out.push(`  differs ${m} ${u}: ${a}/${c}`); }
    t(`no enforcement: ${wsame}/${w.length} write routes identical without/with bad token`, wsame === w.length);
    t("unknown route still 404 with token", (await call("GET", "/nope", null, tok)).s === 404);
  }
  const pre = await fetch(B + "/auth/me", { method: "OPTIONS", headers: { Origin: "https://example.netlify.app", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" } });
  t("CORS preflight allows Authorization header", pre.status === 204 && /authorization/i.test(pre.headers.get("access-control-allow-headers") || "") && pre.headers.get("access-control-allow-origin") === "*");
  process.stdout.write(out.join("\n") + `\n${out.filter(x => x.startsWith("FAIL")).length} failed of ${out.filter(x => /^(PASS|FAIL)/.test(x)).length}\n`); process.exit(0);
})();
