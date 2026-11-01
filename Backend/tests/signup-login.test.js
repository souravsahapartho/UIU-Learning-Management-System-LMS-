const h = require("./harness"), crypto = require("crypto"); const sha = p => crypto.createHash("sha256").update(p).digest("hex");
const B = "http://127.0.0.1:5794"; const call = (m, u, b) => fetch(B + u, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = []; const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n); const U = e => h.users.find(u => u.email === e);
(async () => {
  await h.start(process.argv[2], 5794);
  let k = 0; const su = async role => { const email = `r${k++}@x.io`; const r = await call("POST", "/signup", { name: "N", email, password: "password-1", ...(role === "__omit" ? {} : { role }) }); return { s: r.s, row: U(email) }; };
  for (const [label, role] of [["admin", "admin"], ["Admin", "Admin"], ["ADMIN", "ADMIN"], ["' admin'", " admin"], ["'student '", "student "], ["superuser", "superuser"], ["['admin']", ["admin"]], ["{role:'admin'}", { role: "admin" }], ["number 1", 1], ["true", true], ["'constructor'", "constructor"]]) {
    const r = await su(role); t(`signup role ${label} -> 400, no row`, r.s === 400 && !r.row);
  }
  for (const [label, role] of [["omitted", "__omit"], ["null", null], ["empty string", ""], ["false", false]]) {
    const r = await su(role); t(`signup role ${label} -> stored as student`, r.s === 200 && r.row && r.row.role === "student");
  }
  for (const role of ["student", "instructor"]) { const r = await su(role); t(`signup ${role} ok, stored ${role}, status Pending`, r.s === 200 && r.row.role === role && r.row.status === "Pending"); }
  const add = (email, role, status) => h.users.push({ id: 100 + h.users.length, email, password: sha("pw"), role, status });
  add("ps@x", "student", "Pending"); add("pi@x", "instructor", "Pending"); add("as@x", "student", "Approved"); add("ai@x", "instructor", "Approved");
  add("bs@x", "student", "Banned"); add("adm-p@x", "admin", "Pending"); add("adm-a@x", "admin", "Approved"); add("adm-null@x", "admin", null); add("adm-b@x", "admin", "Banned");
  const login = e => call("POST", "/login", { email: e, password: "pw" });
  let r = await login("ps@x"); t("Pending student -> 403 Pending message, no user returned", r.s === 403 && /Pending/.test(r.j.error) && !r.j.user);
  r = await login("pi@x"); t("Pending instructor -> 403", r.s === 403 && !r.j.user);
  t("Approved student -> 200", (await login("as@x")).s === 200);
  t("Approved instructor -> 200", (await login("ai@x")).s === 200);
  r = await login("bs@x"); t("Banned student -> 403 suspended", r.s === 403 && /Suspended/.test(r.j.error));
  t("seeded admin with Pending status -> 200", (await login("adm-p@x")).s === 200);
  t("admin Approved -> 200", (await login("adm-a@x")).s === 200);
  t("admin with NULL status -> 200", (await login("adm-null@x")).s === 200);
  t("Banned admin still -> 403", (await login("adm-b@x")).s === 403);
  t("wrong password on Pending account -> 401 (no status leak)", (await call("POST", "/login", { email: "ps@x", password: "bad" })).s === 401);
  t("unknown email -> 401", (await call("POST", "/login", { email: "nope@x", password: "pw" })).s === 401);
  process.stdout.write(out.join("\n") + `\n${out.filter(x => x.startsWith("FAIL")).length} failed of ${out.length}\n`); process.exit(0);
})();
