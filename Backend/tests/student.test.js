// PR E: student and own-data routes use the verified token, not client-supplied emails.
const h = require("./harness"), crypto = require("crypto");
const sha = (p) => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5777, B = "http://127.0.0.1:" + PORT;
const call = (m, u, b, tok) =>
  fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) })
    .then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const after = (n, re) => h.logp.slice(n).filter((q) => re.test(q.sql));

(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, role) => h.users.push({ id, name: "N-" + email, email, password: sha("pw"), role, status: "Approved" });
  mk(1, "admin@x", "admin"); mk(2, "instA@x", "instructor"); mk(3, "instB@x", "instructor"); mk(4, "stuA@x", "student"); mk(5, "stuB@x", "student");
  h.courses.push({ id: 1, instructor_email: "instA@x" }, { id: 2, instructor_email: "instB@x" });
  h.enrollments.push({ id: 10, course_id: 1, student_email: "stuA@x" }, { id: 11, course_id: 1, student_email: "stuB@x" }, { id: 12, course_id: 2, student_email: "stuB@x" }, { id: 13, course_id: 2, student_email: "stuB@x" });
  h.submissions.push({ id: 20, course_id: 1, student_email: "stuA@x" }, { id: 21, course_id: 1, student_email: "stuB@x" });
  h.banRequests.push({ id: 30, inst_email: "instA@x" }, { id: 31, inst_email: "instB@x" });
  const T = {};
  for (const e of ["admin@x", "instA@x", "instB@x", "stuA@x", "stuB@x"]) T[e] = (await call("POST", "/login", { email: e, password: "pw" })).j.token;
  const A = T["stuA@x"], Bs = T["stuB@x"], IA = T["instA@x"], IB = T["instB@x"], AD = T["admin@x"];
  let n, r;

  // Profile: always the token user.
  t("update-profile: no token -> 401", (await call("PUT", "/update-profile", { email: "stuB@x", name: "X" })).s === 401);
  n = h.logp.length; r = await call("PUT", "/update-profile", { email: "stuB@x", name: "Hacked", avatar: "U" }, A);
  const up = after(n, /^UPDATE users SET name/)[0];
  t("update-profile: body email ignored, updates token user only", r.s === 200 && up && up.p.includes("stuA@x") && !up.p.includes("stuB@x"));

  // Lists need a login.
  for (const u of ["/users", "/enrollments", "/assignments/1", "/module-videos/1"]) {
    t(`GET ${u}: no token -> 401`, (await call("GET", u)).s === 401);
    t(`GET ${u}: any signed-in user -> 200`, (await call("GET", u, null, Bs)).s === 200);
  }

  // Enrolling: students only, as themselves.
  t("enroll: no token -> 401", (await call("POST", "/enrollments", { course_id: 1 })).s === 401);
  t("enroll: instructor -> 403", (await call("POST", "/enrollments", { course_id: 2, student_email: "stuA@x" }, IA)).s === 403);
  n = h.logp.length; r = await call("POST", "/enrollments", { course_id: 2, course_title: "C", student_email: "stuB@x", student_name: "B", instructor_email: "instB@x", date: "d" }, A);
  const en = after(n, /^INSERT INTO enrollments/)[0];
  t("enroll: student enrols as token user, body email ignored", r.s === 200 && en && en.p.includes("stuA@x") && en.p.includes("N-stuA@x") && !en.p.includes("stuB@x"));

  // Leaving or removing an enrollment: the student, the course instructor, or an admin.
  const has = (id) => h.enrollments.some((e) => e.id === id);
  t("unenroll: no token -> 401, kept", (await call("DELETE", "/enrollments/10")).s === 401 && has(10));
  t("unenroll: other student -> 403, kept", (await call("DELETE", "/enrollments/10", null, Bs)).s === 403 && has(10));
  t("unenroll: other course's instructor -> 403, kept", (await call("DELETE", "/enrollments/10", null, IB)).s === 403 && has(10));
  t("unenroll: the student -> 200, removed", (await call("DELETE", "/enrollments/10", null, A)).s === 200 && !has(10));
  t("unenroll: course instructor -> 200, removed", (await call("DELETE", "/enrollments/11", null, IA)).s === 200 && !has(11));
  t("unenroll: admin -> 200, removed", (await call("DELETE", "/enrollments/12", null, AD)).s === 200 && !has(12));
  t("unenroll: missing -> 404", (await call("DELETE", "/enrollments/99", null, AD)).s === 404);

  // Submissions list: students see only their own rows; instructors must own the course.
  t("submissions list: no token -> 401", (await call("GET", "/assignment-submissions/1")).s === 401);
  r = await call("GET", "/assignment-submissions/1", null, A);
  t("submissions list: student gets only own rows", r.s === 200 && r.j.length === 1 && r.j[0].student_email === "stuA@x");
  t("submissions list: other course's instructor -> 403", (await call("GET", "/assignment-submissions/1", null, IB)).s === 403);
  r = await call("GET", "/assignment-submissions/1", null, IA); t("submissions list: course instructor gets all rows", r.s === 200 && r.j.length === 2);
  r = await call("GET", "/assignment-submissions/1", null, AD); t("submissions list: admin gets all rows", r.s === 200 && r.j.length === 2);

  // Submitting: students only, as themselves.
  t("submit: no token -> 401", (await call("POST", "/assignment-submissions", { course_id: 1 })).s === 401);
  t("submit: instructor -> 403", (await call("POST", "/assignment-submissions", { course_id: 1, student_email: "stuA@x" }, IA)).s === 403);
  n = h.logp.length; r = await call("POST", "/assignment-submissions", { assignment_id: 1, course_id: 1, student_email: "stuB@x", student_name: "B", submission_text: "x" }, A);
  const sb = after(n, /^INSERT INTO assignment_submissions/)[0];
  t("submit: recorded for token user, body email ignored", r.s === 200 && sb && sb.p.includes("stuA@x") && !sb.p.includes("stuB@x"));

  // Progress and activity writes: always the token user.
  for (const [u, b, re] of [["/module-progress", { course_id: 1, student_email: "stuB@x", module_index: 0 }, /^INSERT INTO module_progress/], ["/student-activity", { student_email: "stuB@x", activity_date: "2026-11-01" }, /^INSERT INTO student_activity/]]) {
    t(`POST ${u}: no token -> 401`, (await call("POST", u, b)).s === 401);
    n = h.logp.length; r = await call("POST", u, b, A);
    const w = after(n, re)[0]; t(`POST ${u}: recorded for token user, body email ignored`, r.s === 200 && w && w.p.includes("stuA@x") && !w.p.includes("stuB@x"));
  }

  // Reading a student's progress/activity: self, admin, or an instructor who teaches them.
  h.enrollments.push({ id: 14, course_id: 1, student_email: "stuA@x" });
  for (const u of ["/module-progress/1/stuA@x", "/student-activity/stuA@x"]) {
    t(`GET ${u}: no token -> 401`, (await call("GET", u)).s === 401);
    t(`GET ${u}: the student -> 200`, (await call("GET", u, null, A)).s === 200);
    t(`GET ${u}: another student -> 403`, (await call("GET", u, null, Bs)).s === 403);
    t(`GET ${u}: their instructor -> 200`, (await call("GET", u, null, IA)).s === 200);
    t(`GET ${u}: an instructor who doesn't teach them -> 403`, (await call("GET", u, null, IB)).s === 403);
    t(`GET ${u}: admin -> 200`, (await call("GET", u, null, AD)).s === 200);
  }

  // Notifications.
  t("notifications read: no token -> 401", (await call("GET", "/notifications/stuA@x")).s === 401);
  t("notifications read: own inbox -> 200", (await call("GET", "/notifications/stuA@x", null, A)).s === 200);
  t("notifications read: someone else's inbox -> 403", (await call("GET", "/notifications/stuB@x", null, A)).s === 403);
  t("notifications read: all_users broadcast -> 200", (await call("GET", "/notifications/all_users", null, A)).s === 200);
  t("notifications read: admin inbox as student -> 403", (await call("GET", "/notifications/admin", null, A)).s === 403);
  t("notifications read: admin inbox as admin -> 200", (await call("GET", "/notifications/admin", null, AD)).s === 200);
  n = h.logp.length; t("mark read: someone else's inbox -> 403, no update", (await call("PUT", "/notifications/read", { identifier: "stuB@x" }, A)).s === 403 && after(n, /^UPDATE notifications/).length === 0);
  t("mark read: own inbox -> 200", (await call("PUT", "/notifications/read", { identifier: "stuA@x" }, A)).s === 200);
  t("mark read: admin inbox as admin -> 200", (await call("PUT", "/notifications/read", { identifier: "admin" }, AD)).s === 200);
  t("mark read: admin inbox as student -> 403", (await call("PUT", "/notifications/read", { identifier: "admin" }, A)).s === 403);
  t("send notification: no token -> 401", (await call("POST", "/notifications", { identifier: "stuB@x", text: "x" })).s === 401);
  t("send notification: signed-in user -> 200", (await call("POST", "/notifications", { identifier: "instA@x", text: "x" }, A)).s === 200);

  // Chat read state: own only.
  t("unread counts: no token -> 401", (await call("GET", "/unread-counts/stuA@x")).s === 401);
  t("unread counts: own -> 200", (await call("GET", "/unread-counts/stuA@x", null, A)).s === 200);
  t("unread counts: someone else's -> 403", (await call("GET", "/unread-counts/stuB@x", null, A)).s === 403);
  n = h.logp.length; r = await call("POST", "/mark-chat-read", { user_email: "stuB@x", course_id: 1, last_message_id: 5 }, A);
  const mr = after(n, /^INSERT INTO chat_read_status/)[0];
  t("mark chat read: recorded for token user, body email ignored", r.s === 200 && mr && mr.p.includes("stuA@x") && !mr.p.includes("stuB@x"));

  // Ban requests list: admin all, instructors their own, students none.
  t("ban requests list: no token -> 401", (await call("GET", "/ban-requests")).s === 401);
  t("ban requests list: student -> 403", (await call("GET", "/ban-requests", null, A)).s === 403);
  r = await call("GET", "/ban-requests", null, IA); t("ban requests list: instructor sees only own", r.s === 200 && r.j.length === 1 && r.j[0].inst_email === "instA@x");
  r = await call("GET", "/ban-requests", null, AD); t("ban requests list: admin sees all", r.s === 200 && r.j.length === 2);

  const fails = out.filter((x) => x.startsWith("FAIL"));
  process.stdout.write((fails.length ? fails.join("\n") + "\n" : "") + `${fails.length} failed of ${out.length}\n`);
  process.exit(0);
})();
