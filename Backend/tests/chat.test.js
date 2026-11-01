// PR F: chat, feedback, complaints and uploads use the verified token.
const h = require("./harness"), crypto = require("crypto");
const sha = (p) => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5776, B = "http://127.0.0.1:" + PORT;
const call = (m, u, b, tok) =>
  fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) })
    .then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const after = (n, re) => h.logp.slice(n).filter((q) => re.test(q.sql));

(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, role) => h.users.push({ id, name: "N-" + email, email, password: sha("pw"), role, status: "Approved" });
  mk(1, "admin@x", "admin"); mk(2, "instA@x", "instructor"); mk(3, "instB@x", "instructor"); mk(4, "stuA@x", "student"); mk(5, "stuP@x", "student"); mk(6, "stuO@x", "student");
  h.courses.push({ id: 1, instructor_email: "instA@x" }, { id: 2, instructor_email: "instB@x" });
  h.enrollments.push({ id: 10, course_id: 1, student_email: "stuA@x", status: "Approved" }, { id: 11, course_id: 1, student_email: "stuP@x", status: "Pending" });
  h.chats.push({ id: 1, course_id: "1", user_email: "stuA@x" }, { id: 2, course_id: "1", user_email: "instA@x" }, { id: 3, course_id: "1", user_email: "stuA@x" });
  const T = {};
  for (const e of ["admin@x", "instA@x", "instB@x", "stuA@x", "stuP@x", "stuO@x"]) T[e] = (await call("POST", "/login", { email: e, password: "pw" })).j.token;
  const AD = T["admin@x"], IA = T["instA@x"], IB = T["instB@x"], SA = T["stuA@x"], SP = T["stuP@x"], SO = T["stuO@x"];

  // Reading a course chat: course instructor, approved students, admins.
  for (const u of ["/course-chats/1", "/course-chats-latest/1"]) {
    t(`GET ${u}: no token -> 401`, (await call("GET", u)).s === 401);
    t(`GET ${u}: invalid token -> 401`, (await call("GET", u, null, "abc.def")).s === 401);
    t(`GET ${u}: approved student -> 200`, (await call("GET", u, null, SA)).s === 200);
    t(`GET ${u}: course instructor -> 200`, (await call("GET", u, null, IA)).s === 200);
    t(`GET ${u}: admin -> 200`, (await call("GET", u, null, AD)).s === 200);
    t(`GET ${u}: pending student -> 403`, (await call("GET", u, null, SP)).s === 403);
    t(`GET ${u}: student not enrolled -> 403`, (await call("GET", u, null, SO)).s === 403);
    t(`GET ${u}: other course's instructor -> 403`, (await call("GET", u, null, IB)).s === 403);
  }
  // Broadcast channels: readable by their audience.
  t("broadcast: student reads -> 200", (await call("GET", "/course-chats/broadcast", null, SO)).s === 200);
  t("broadcast_students: student reads -> 200", (await call("GET", "/course-chats/broadcast_students", null, SO)).s === 200);
  t("broadcast_students: instructor reads -> 403", (await call("GET", "/course-chats/broadcast_students", null, IA)).s === 403);
  t("broadcast_instructors: instructor reads -> 200", (await call("GET", "/course-chats/broadcast_instructors", null, IA)).s === 200);
  t("broadcast_instructors: student reads -> 403", (await call("GET", "/course-chats/broadcast_instructors", null, SO)).s === 403);
  t("broadcast: no token -> 401", (await call("GET", "/course-chats/broadcast")).s === 401);

  // Posting: members only; author comes from the token.
  const msg = (room, extra = {}) => ({ course_id: room, course_name: "C", user_name: "Fake", user_email: "victim@x", message: "hi", time: "t", ...extra });
  let n = h.logp.length;
  t("post course chat: no token -> 401, no insert", (await call("POST", "/course-chats", msg("1"))).s === 401 && after(n, /^INSERT INTO course_chats/).length === 0);
  n = h.logp.length; t("post course chat: student not enrolled -> 403, no insert", (await call("POST", "/course-chats", msg("1"), SO)).s === 403 && after(n, /^INSERT INTO course_chats/).length === 0);
  n = h.logp.length; t("post course chat: pending student -> 403, no insert", (await call("POST", "/course-chats", msg("1"), SP)).s === 403 && after(n, /^INSERT INTO course_chats/).length === 0);
  n = h.logp.length; t("post course chat: other course's instructor -> 403", (await call("POST", "/course-chats", msg("1"), IB)).s === 403 && after(n, /^INSERT INTO course_chats/).length === 0);
  n = h.logp.length; let r = await call("POST", "/course-chats", msg("1"), SA);
  const ins = after(n, /^INSERT INTO course_chats/)[0];
  t("post course chat: approved student -> 200, author is token user", r.s === 200 && ins && ins.p.includes("stuA@x") && ins.p.includes("N-stuA@x") && !ins.p.includes("victim@x") && !ins.p.includes("Fake"));
  t("post course chat: course instructor -> 200", (await call("POST", "/course-chats", msg("1"), IA)).s === 200);
  n = h.logp.length; t("post broadcast: student -> 403, no insert", (await call("POST", "/course-chats", msg("broadcast"), SA)).s === 403 && after(n, /^INSERT INTO course_chats/).length === 0);
  t("post broadcast_students: instructor -> 403", (await call("POST", "/course-chats", msg("broadcast_students"), IA)).s === 403);
  t("post broadcast: admin -> 200", (await call("POST", "/course-chats", msg("broadcast"), AD)).s === 200);
  t("post broadcast_instructors: admin -> 200", (await call("POST", "/course-chats", msg("broadcast_instructors"), AD)).s === 200);

  // Deleting: the token's author or an admin; requester_email is ignored.
  const has = (id) => h.chats.some((c) => c.id === id);
  t("delete message: no token claiming author -> 401, kept", (await call("DELETE", "/course-chats/1", { requester_email: "stuA@x" })).s === 401 && has(1));
  t("delete message: other user claiming author -> 403, kept", (await call("DELETE", "/course-chats/1", { requester_email: "stuA@x" }, SO)).s === 403 && has(1));
  t("delete message: course instructor (not author) -> 403, kept", (await call("DELETE", "/course-chats/1", {}, IA)).s === 403 && has(1));
  t("delete message: author -> 200, removed", (await call("DELETE", "/course-chats/1", {}, SA)).s === 200 && !has(1));
  t("delete message: admin -> 200, removed", (await call("DELETE", "/course-chats/2", {}, AD)).s === 200 && !has(2));
  t("delete message: missing -> 404", (await call("DELETE", "/course-chats/99", {}, AD)).s === 404);

  // Feedback and complaints: signed in, author from the token.
  for (const [u, extra, re] of [["/course-feedbacks", { rating: 5, comment: "c" }, /^INSERT INTO feedbacks/], ["/course-complaints", { complaint_text: "c" }, /^INSERT INTO complaints/]]) {
    const body = { course_id: 1, course_name: "C", user_name: "Fake", user_email: "victim@x", date: "d", ...extra };
    n = h.logp.length; t(`POST ${u}: no token -> 401, no insert`, (await call("POST", u, body)).s === 401 && after(n, re).length === 0);
    n = h.logp.length; r = await call("POST", u, body, SA);
    const w = after(n, re)[0]; t(`POST ${u}: author is token user, body ignored`, r.s === 200 && w && w.p.includes("stuA@x") && !w.p.includes("victim@x") && !w.p.includes("Fake"));
  }
  t("GET feedbacks: no token -> 401", (await call("GET", "/course-feedbacks/1")).s === 401);
  t("GET feedbacks: signed-in user -> 200", (await call("GET", "/course-feedbacks/1", null, SO)).s === 200);
  t("GET course complaints: no token -> 401", (await call("GET", "/course-complaints/1")).s === 401);
  t("GET course complaints: student -> 403", (await call("GET", "/course-complaints/1", null, SA)).s === 403);
  t("GET course complaints: other course's instructor -> 403", (await call("GET", "/course-complaints/1", null, IB)).s === 403);
  t("GET course complaints: course instructor -> 200", (await call("GET", "/course-complaints/1", null, IA)).s === 200);
  t("GET course complaints: admin -> 200", (await call("GET", "/course-complaints/1", null, AD)).s === 200);

  // Uploads: sign-in required before anything is sent to Cloudinary.
  for (const u of ["/upload-chat-media", "/upload-profile-pic"]) {
    t(`POST ${u}: no token -> 401`, (await call("POST", u, {})).s === 401);
    t(`POST ${u}: invalid token -> 401`, (await call("POST", u, {}, "abc.def")).s === 401);
    const s = (await call("POST", u, {}, SO)).s; t(`POST ${u}: signed-in user passes the guard (${s})`, s !== 401 && s !== 403);
  }

  const fails = out.filter((x) => x.startsWith("FAIL"));
  process.stdout.write((fails.length ? fails.join("\n") + "\n" : "") + `${fails.length} failed of ${out.length}\n`);
  process.exit(0);
})();
