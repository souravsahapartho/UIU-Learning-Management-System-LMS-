// Runs every test suite against Backend/server.js with no database and no Cloudinary:
// the suites replace mysql2 and Cloudinary's storage with in-memory stand-ins (see harness.js).
// Usage: npm test            (from the Backend folder)
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");

const secret = crypto.randomBytes(32).toString("hex");
const shortSecret = "a".repeat(31);
const small = { MAX_IMAGE_MB: "1", MAX_CHAT_MEDIA_MB: "2", MAX_VIDEO_MB: "3" };

// [name, file, extra args, environment]
const suites = [
  ["Signup and login", "signup-login.test.js", [], { AUTH_SECRET: secret }],
  ["Account lifecycle", "account-lifecycle.test.js", [], { AUTH_SECRET: secret }],
  ["Login hardening", "login-hardening.test.js", [], { AUTH_SECRET: secret }],
  ["Login hardening (no AUTH_SECRET)", "login-hardening.test.js", [], {}],
  ["Tokens", "token.test.js", ["5771"], { AUTH_SECRET: secret }],
  ["Tokens (no AUTH_SECRET)", "token.test.js", ["5772"], {}],
  ["Tokens (AUTH_SECRET too short)", "token.test.js", ["5773"], { AUTH_SECRET: shortSecret }],
  ["Admin routes", "admin.test.js", [], { AUTH_SECRET: secret }],
  ["Admin routes (no AUTH_SECRET)", "admin.test.js", [], {}],
  ["Instructor routes", "instructor.test.js", [], { AUTH_SECRET: secret }],
  ["Student routes", "student.test.js", [], { AUTH_SECRET: secret }],
  ["Chat, feedback, complaints", "chat.test.js", [], { AUTH_SECRET: secret }],
  ["Uploads (small limits)", "uploads.test.js", ["small"], { AUTH_SECRET: secret, ...small }],
  ["Uploads (default limits)", "uploads.test.js", ["defaults"], { AUTH_SECRET: secret }],
  ["CORS (no allowlist)", "cors.test.js", [], { AUTH_SECRET: secret }],
  ["CORS (allowlist)", "cors.test.js", [], { AUTH_SECRET: secret, ALLOWED_ORIGINS: "https://uiuelms.netlify.app,http://localhost:5500" }],
];

const backend = path.resolve(__dirname, "..");
let failed = 0;
for (const [name, file, args, env] of suites) {
  const result = spawnSync(process.execPath, [path.join("tests", file), "server.js", ...args], {
    cwd: backend,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    encoding: "utf8",
    timeout: 180000,
  });
  const lines = `${result.stdout || ""}`.split("\n").filter((l) => /^FAIL|failed of/.test(l));
  const summary = lines.find((l) => /failed of/.test(l)) || "no result (crashed or timed out)";
  const bad = !/^0 failed of/.test(summary);
  if (bad) failed++;
  console.log(`${bad ? "FAIL" : "ok  "}  ${name}: ${summary}`);
  if (bad) lines.filter((l) => l.startsWith("FAIL")).forEach((l) => console.log("      " + l));
}
console.log(failed === 0 ? "\nAll suites passed." : `\n${failed} suite(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
