// Login hardening: fail-loud without AUTH_SECRET, per-email lockout, signup validation, token-based password change and deletion.
const h = require("./harness"), crypto = require("crypto");
const sha = (p) => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5769, B = "http://127.0.0.1:" + PORT, on = (process.env.AUTH_SECRET || "").length >= 32;
const raw = (m, u, b, tok) => fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) });
const call = (m, u, b, tok) => raw(m, u, b, tok).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})), ra: r.headers.get("retry-after") }));
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const finish = () => { const f = out.filter((x) => x.startsWith("FAIL")); process.stdout.write((f.length ? f.join("\n") + "\n" : "") + `${f.length} failed of ${out.length}\n`); process.exit(0); };
process.on("uncaughtException", (e) => { out.push("FAIL crashed: " + e.message); finish(); });
setTimeout(() => { out.push("FAIL timed out"); finish(); }, 60000).unref();

(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, pw, role = "student") => h.users.push({ id, name: "N-" + email, email, password: sha(pw), role, status: "Approved" });
  mk(1, "a@x.io", "pass-word-A"); mk(2, "b@x.io", "pass-word-B"); mk(3, "c@x.io", "pass-word-C"); mk(4, "d@x.io", "pass-word-D");
  const U = (e) => h.users.find((u) => u.email === e);
  if (!on) {
    const n = h.logp.length; const r = await call("POST", "/login", { email: "a@x.io", password: "pass-word-A" });
    t("no AUTH_SECRET: login -> 503 naming the missing setting", r.s === 503 && /AUTH_SECRET/.test(r.j.error) && !r.j.token && !r.j.user);
    t("no AUTH_SECRET: login does not touch the database", h.logp.slice(n).length === 0);
    finish(); return;
  }
  const login = (e, p) => call("POST", "/login", { email: e, password: p });
  const tokA = (await login("a@x.io", "pass-word-A")).j.token;

  // Lockout: 10 failures per email, then 429 even with the right password.
  for (let i = 0; i < 10; i++) await login("b@x.io", "wrong-" + i);
  let r = await login("b@x.io", "pass-word-B");
  t("after 10 failures the account is locked: correct password -> 429", r.s === 429 && /Too many/.test(r.j.error) && !r.j.token);
  t("429 carries Retry-After in seconds (<= 900)", Number(r.ra) > 0 && Number(r.ra) <= 900);
  t("lockout ignores email case and spaces", (await login("  B@X.IO ", "pass-word-B")).s === 429);
  t("other accounts are unaffected", (await login("a@x.io", "pass-word-A")).s === 200);
  for (let i = 0; i < 9; i++) await login("c@x.io", "wrong-" + i);
  t("9 failures: not locked yet, correct password -> 200", (await login("c@x.io", "pass-word-C")).s === 200);
  for (let i = 0; i < 9; i++) await login("c@x.io", "wrong-" + i);
  t("success cleared the count: 9 more failures, still not locked", (await login("c@x.io", "pass-word-C")).s === 200);
  for (let i = 0; i < 10; i++) await login("ghost@x.io", "wrong");
  t("unknown emails are limited the same way (no account probing)", (await login("ghost@x.io", "wrong")).s === 429);
  r = await login("d@x.io", "wrong"); t("a single failure is a plain 401", r.s === 401 && r.j.error === "Invalid email or password");

  // Signup validation.
  const su = (b) => call("POST", "/signup", b);
  const base = { name: "New User", email: "new@x.io", password: "password-1", role: "student" };
  const bad = { "missing name": { ...base, name: undefined }, "blank name": { ...base, name: "   " }, "name too long": { ...base, name: "n".repeat(101) }, "name not a string": { ...base, name: ["x"] },
    "missing email": { ...base, email: undefined }, "email without domain": { ...base, email: "new@x" }, "email with spaces": { ...base, email: "a b@x.io" }, "email too long": { ...base, email: "a".repeat(97) + "@x.io" }, "email not a string": { ...base, email: { a: 1 } },
    "missing password": { ...base, password: undefined }, "7-character password": { ...base, password: "1234567" }, "201-character password": { ...base, password: "p".repeat(201) }, "password not a string": { ...base, password: 12345678 } };
  for (const [label, b] of Object.entries(bad)) { const n = h.logp.length; const x = await su(b); t(`signup rejected (400, no insert): ${label}`, x.s === 400 && !h.logp.slice(n).some((q) => /^INSERT INTO users/.test(q.sql))); }
  t("signup: valid input -> 200", (await su(base)).s === 200 && !!U("new@x.io"));
  t("signup: 8-character and 200-character passwords are accepted", (await su({ ...base, email: "p8@x.io", password: "12345678" })).s === 200 && (await su({ ...base, email: "p200@x.io", password: "p".repeat(200) })).s === 200);

  // Password change: signed-in user only, identity from the token, shares the lockout.
  const put = (b, tok) => call("PUT", "/update-password", b, tok);
  t("update-password: no token -> 401", (await put({ email: "a@x.io", oldPassword: "pass-word-A", newPassword: "new-password-1" })).s === 401);
  const beforeA = U("a@x.io").password;
  t("update-password: weak new password -> 400, unchanged", (await put({ oldPassword: "pass-word-A", newPassword: "short" }, tokA)).s === 400 && U("a@x.io").password === beforeA);
  let n = h.logp.length; r = await put({ email: "b@x.io", oldPassword: "pass-word-A", newPassword: "new-password-1" }, tokA);
  const upd = h.logp.slice(n).find((q) => /^UPDATE users SET password/.test(q.sql));
  t("update-password: body email ignored, token user's password changed", r.s === 200 && upd && upd.p[1] === "a@x.io" && U("b@x.io").password === sha("pass-word-B"));
  t("update-password: new password works, old one does not", (await login("a@x.io", "new-password-1")).s === 200 && (await login("a@x.io", "pass-word-A")).s === 401);
  const tokD = (await login("d@x.io", "wrong") && (await login("d@x.io", "pass-word-D"))).j.token;
  const beforeD = U("d@x.io").password;
  for (let i = 0; i < 10; i++) await put({ oldPassword: "wrong-" + i, newPassword: "new-password-2" }, tokD);
  t("update-password: 10 wrong current passwords lock the account", (await put({ oldPassword: "pass-word-D", newPassword: "new-password-2" }, tokD)).s === 429 && U("d@x.io").password === beforeD);
  t("the same lockout blocks login", (await login("d@x.io", "pass-word-D")).s === 429);

  // Account deletion: token + password, own account only.
  mk(50, "e@x.io", "pass-word-E"); mk(60, "f@x.io", "pass-word-F");
  const tokE = (await login("e@x.io", "pass-word-E")).j.token;
  const del = (b, tok) => call("DELETE", "/delete-account", b, tok);
  t("delete-account: no token -> 401, kept", (await del({ email: "e@x.io", password: "pass-word-E" })).s === 401 && !!U("e@x.io"));
  t("delete-account: wrong password -> 401, kept", (await del({ password: "nope" }, tokE)).s === 401 && !!U("e@x.io"));
  t("delete-account: body email naming another user is ignored", (await del({ email: "f@x.io", password: "pass-word-F" }, tokE)).s === 401 && !!U("f@x.io") && !!U("e@x.io"));
  const dr = await del({ email: "f@x.io", password: "pass-word-E" }, tokE);
  t("delete-account: token + own password -> 200, only that account removed (got " + dr.s + " " + JSON.stringify(dr.j) + ")", dr.s === 200 && !U("e@x.io") && !!U("f@x.io"));
  finish();
})();
