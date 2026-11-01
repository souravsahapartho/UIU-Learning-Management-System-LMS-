// PR C: admin-only routes must use the verified token, not client-supplied email/role.
const h = require("./harness"), crypto = require("crypto"); const sha = p => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5779, B = "http://127.0.0.1:" + PORT, on = (process.env.AUTH_SECRET || "").length >= 32;
const call = (m, u, b, tok) => fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = []; const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const wrote = (since, re) => h.log.slice(since).some(q => re.test(q));
(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, role, status = "Approved") => h.users.push({ id, name: email, email, password: sha("pw"), role, status });
  mk(1, "admin@x", "admin"); mk(2, "inst@x", "instructor"); mk(3, "stu@x", "student"); mk(4, "target@x", "student", "Pending"); mk(5, "banadm@x", "admin");
  const tok = {}; for (const e of ["admin@x", "inst@x", "stu@x", "banadm@x"]) tok[e] = (await call("POST", "/login", { email: e, password: "pw" })).j.token;
  if (!on) {
    t("no AUTH_SECRET: login refused (503), no token", tok["admin@x"] === undefined);
    const r = await call("PUT", "/update-user-status", { email: "target@x", status: "Approved" });
    t("no AUTH_SECRET: admin route fails closed with 401, no write", r.s === 401 && h.users.find(u => u.id === 4).status === "Pending");
  } else {
    h.users.find(u => u.id === 5).status = "Banned";
    const callers = { "no token": null, "invalid token": "abc.def", "student token": tok["stu@x"], "instructor token": tok["inst@x"], "banned admin token": tok["banadm@x"] };
    const want = { "no token": 401, "invalid token": 401, "student token": 403, "instructor token": 403, "banned admin token": 401 };
    const routes = [
      ["account approve/ban", "PUT", "/update-user-status", { email: "target@x", status: "Approved", role: "admin" }, /^UPDATE users SET status/],
      ["course approval", "PUT", "/course-status", { id: 7, status: "Approved", requester_role: "admin" }, /^UPDATE courses SET status/],
      ["read all complaints", "GET", "/all-complaints", null, /FROM complaints/],
      ["ban-request decision", "PUT", "/ban-requests/9", { status: "Approved", studentEmail: "stu@x", instEmail: "inst@x", studentName: "S", courseId: 1, requester_role: "admin" }, /^UPDATE (ban_requests|enrollments)|^INSERT INTO notifications/],
    ];
    for (const [name, m, u, b, re] of routes) {
      for (const [who, tk] of Object.entries(callers)) { const n = h.log.length; const r = await call(m, u, b, tk); t(`${name}: ${who} -> ${want[who]}, no DB access`, r.s === want[who] && !wrote(n, re)); }
      const n = h.log.length; const r = await call(m, u, b, tok["admin@x"]); t(`${name}: admin token -> 200 and runs its query`, r.s === 200 && wrote(n, re));
    }
    t("account approve by admin actually updated status", h.users.find(u => u.id === 4).status === "Approved");
    t("student claiming role/requester_role 'admin' in body still 403", (await call("PUT", "/update-user-status", { email: "stu@x", status: "Banned", role: "admin", requester_role: "admin" }, tok["stu@x"])).s === 403 && h.users.find(u => u.id === 3).status === "Approved");
    t("admin cannot be impersonated with a token for another user id", (await call("PUT", "/course-status", { id: 1, status: "Rejected" }, tok["inst@x"])).s === 403);
    // Chat moderation: admin override comes from the token, not requester_role.
    h.chats.push({ id: 1, user_email: "inst@x" }, { id: 2, user_email: "inst@x" }, { id: 3, user_email: "stu@x" });
    t("chat delete: student claiming requester_role admin -> 403, kept", (await call("DELETE", "/course-chats/1", { requester_email: "stu@x", requester_role: "admin" }, tok["stu@x"])).s === 403 && h.chats.some(c => c.id === 1));
    t("chat delete: no token claiming admin -> 401, kept", (await call("DELETE", "/course-chats/1", { requester_email: "x@x", requester_role: "admin" })).s === 401 && h.chats.some(c => c.id === 1));
    t("chat delete: admin token removes someone else's message", (await call("DELETE", "/course-chats/2", { requester_email: "admin@x" }, tok["admin@x"])).s === 200 && !h.chats.some(c => c.id === 2));
    t("chat delete: author deletes own message with their token", (await call("DELETE", "/course-chats/3", {}, tok["stu@x"])).s === 200 && !h.chats.some(c => c.id === 3));
    t("chat delete: missing message still 404", (await call("DELETE", "/course-chats/99", { requester_email: "stu@x" }, tok["admin@x"])).s === 404);
    // Shared routes stay open (not admin-only).
    t("GET /users still open to non-admins", (await call("GET", "/users", null, tok["stu@x"])).s === 200);
    t("GET /ban-requests still open to instructors", (await call("GET", "/ban-requests", null, tok["inst@x"])).s === 200);
  }
  process.stdout.write(out.join("\n") + `\n${out.filter(x => x.startsWith("FAIL")).length} failed of ${out.length}\n`); process.exit(0);
})();
