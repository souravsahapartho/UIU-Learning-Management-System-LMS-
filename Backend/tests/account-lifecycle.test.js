// Account lifecycle regression: scrypt hashes, legacy upgrade, password change and deletion with a token.
const h = require("./harness"), crypto = require("crypto");
const sha = (p) => crypto.createHash("sha256").update(p).digest("hex");
const B = "http://127.0.0.1:5793";
const call = (m, u, b, tok) =>
  fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const U = (e) => h.users.find((u) => u.email === e);
const wait = () => new Promise((r) => setTimeout(r, 50));
const finish = () => {
  const f = out.filter((x) => x.startsWith("FAIL"));
  process.stdout.write((f.length ? f.join("\n") + "\n" : "") + `${f.length} failed of ${out.length}\n`);
  process.exit(0);
};
process.on("uncaughtException", (e) => { out.push("FAIL crashed: " + e.message); finish(); });
setTimeout(() => { out.push("FAIL timed out"); finish(); }, 30000).unref();
(async () => {
  await h.start(process.argv[2], 5793);
  await call("POST", "/signup", { name: "N", email: "n@x.io", password: "password-one", role: "student" });
  U("n@x.io").status = "Approved";
  t("new hash is scrypt", U("n@x.io").password.startsWith("scrypt$"));
  let r = await call("POST", "/login", { email: "n@x.io", password: "password-one" });
  t("login correct 200 with token", r.s === 200 && !!r.j.token);
  const tok = r.j.token;
  t("login wrong 401", (await call("POST", "/login", { email: "n@x.io", password: "x" })).s === 401);
  t("typed stored hash 401", (await call("POST", "/login", { email: "n@x.io", password: U("n@x.io").password })).s === 401);
  h.users.push({ id: 50, email: "l@x", password: sha("old"), role: "student", status: "Approved" }, { id: 51, email: "p@x", password: "plain", role: "student", status: "Approved" });
  t("legacy sha typed hash 401", (await call("POST", "/login", { email: "l@x", password: sha("old") })).s === 401);
  t("legacy sha login 200", (await call("POST", "/login", { email: "l@x", password: "old" })).s === 200); await wait();
  t("legacy upgraded to scrypt", U("l@x").password.startsWith("scrypt$"));
  t("plaintext login 200 + upgraded", (await call("POST", "/login", { email: "p@x", password: "plain" })).s === 200 && (await wait(), U("p@x").password.startsWith("scrypt$")));
  t("update-password wrong old 401", (await call("PUT", "/update-password", { oldPassword: "bad", newPassword: "password-two" }, tok)).s === 401);
  t("update-password ok", (await call("PUT", "/update-password", { oldPassword: "password-one", newPassword: "password-two" }, tok)).s === 200);
  t("new password works, old fails", (await call("POST", "/login", { email: "n@x.io", password: "password-two" })).s === 200 && (await call("POST", "/login", { email: "n@x.io", password: "password-one" })).s === 401);
  t("delete without token 401, kept", (await call("DELETE", "/delete-account", { password: "password-two" })).s === 401 && !!U("n@x.io"));
  t("delete without password 401, kept", (await call("DELETE", "/delete-account", {}, tok)).s === 401 && !!U("n@x.io"));
  t("delete with token + password 200, removed", (await call("DELETE", "/delete-account", { password: "password-two" }, tok)).s === 200 && !U("n@x.io"));
  finish();
})();
