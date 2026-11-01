// CORS allowlist from ALLOWED_ORIGINS.
const h = require("./harness");
const PORT = 5767, B = "http://127.0.0.1:" + PORT, list = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const finish = () => { const f = out.filter((x) => x.startsWith("FAIL")); process.stdout.write((f.length ? f.join("\n") + "\n" : "") + `${f.length} failed of ${out.length}\n`); process.exit(0); };
process.on("uncaughtException", (e) => { out.push("FAIL crashed: " + e.message); finish(); });
setTimeout(() => { out.push("FAIL timed out"); finish(); }, 30000).unref();
const pre = (origin) => fetch(B + "/users", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" } });
const get = (origin) => fetch(B + "/courses", { headers: origin ? { Origin: origin } : {} });
(async () => {
  await h.start(process.argv[2], PORT);
  if (list.length === 0) {
    const r = await pre("https://anything.example"); t("unset: any origin allowed (*), as before", r.headers.get("access-control-allow-origin") === "*" && r.status === 204);
    t("unset: Authorization header allowed in preflight", /authorization/i.test(r.headers.get("access-control-allow-headers") || ""));
  } else {
    for (const o of list) {
      const r = await pre(o); t(`listed origin ${o}: preflight allowed and reflected`, r.status === 204 && r.headers.get("access-control-allow-origin") === o && /authorization/i.test(r.headers.get("access-control-allow-headers") || ""));
      const g = await get(o); t(`listed origin ${o}: normal request carries the allow header`, g.status === 200 && g.headers.get("access-control-allow-origin") === o);
      t(`listed origin ${o}: Vary: Origin is set`, /origin/i.test(g.headers.get("vary") || ""));
    }
    for (const o of ["https://evil.example", list[0] + ".evil.example", list[0].replace("https://", "http://"), "null"].filter((o) => !list.includes(o))) {
      const r = await pre(o); t(`unlisted origin ${o}: no allow header on preflight`, !r.headers.get("access-control-allow-origin"));
      const g = await get(o); t(`unlisted origin ${o}: no allow header on the response`, !g.headers.get("access-control-allow-origin"));
    }
    const g = await get(null); t("requests without an Origin header (curl, server to server) still work", g.status === 200);
    t("no wildcard is ever sent when a list is set", !(await pre("https://evil.example")).headers.get("access-control-allow-origin"));
  }
  finish();
})();
