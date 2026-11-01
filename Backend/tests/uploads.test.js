// Upload validation. Run with MAX_IMAGE_MB / MAX_CHAT_MEDIA_MB / MAX_VIDEO_MB small, or defaults (mode "defaults").
const h = require("./harness"), crypto = require("crypto");
const sha = (p) => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5768, B = "http://127.0.0.1:" + PORT, MODE = process.argv[3] || "small";
const out = [];
const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const finish = () => { const f = out.filter((x) => x.startsWith("FAIL")); process.stdout.write((f.length ? f.join("\n") + "\n" : "") + `${f.length} failed of ${out.length}\n`); process.exit(0); };
process.on("uncaughtException", (e) => { out.push("FAIL crashed: " + e.message); finish(); });
setTimeout(() => { out.push("FAIL timed out"); finish(); }, 90000).unref();
const MB = 1024 * 1024;
const post = async (path, parts, tok, method = "POST") => {
  const fd = new FormData();
  for (const p of parts) { if (p.file) fd.append(p.field, new Blob([p.bytes ?? Buffer.alloc(16, 1)], { type: p.type }), p.name); else fd.append(p.field, p.value); }
  const r = await fetch(B + path, { method, headers: tok ? { Authorization: "Bearer " + tok } : {}, body: fd });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const f = (field, name, type, bytes) => ({ file: true, field, name, type, bytes });
const login = (e) => fetch(B + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: "pw" }) }).then((r) => r.json()).then((j) => j.token);

(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, role) => h.users.push({ id, name: "N-" + email, email, password: sha("pw"), role, status: "Approved" });
  mk(1, "admin@x.io", "admin"); mk(2, "inst@x.io", "instructor"); mk(3, "stu@x.io", "student");
  h.courses.push({ id: 1, instructor_email: "inst@x.io" });
  const TA = await login("admin@x.io"), TI = await login("inst@x.io"), TS = await login("stu@x.io");
  const n0 = () => h.uploads.length;
  const sizes = MODE === "defaults" ? { img: 5 * MB, chat: 50 * MB, vid: 200 * MB } : { img: 1 * MB, chat: 2 * MB, vid: 3 * MB };

  if (MODE === "defaults") {
    let n = n0(), r = await post("/upload-profile-pic", [f("profilePic", "a.png", "image/png", Buffer.alloc(5 * MB - 1))], TS);
    t("default image cap: 5 MB minus 1 byte accepted", r.s === 200 && n0() === n + 1);
    n = n0(); r = await post("/upload-profile-pic", [f("profilePic", "a.png", "image/png", Buffer.alloc(5 * MB + 1))], TS);
    t("default image cap: 5 MB plus 1 byte -> 413", r.s === 413 && /too large/i.test(r.j.error));
    finish(); return;
  }

  // Profile pictures.
  let n = n0(), r = await post("/upload-profile-pic", [f("profilePic", "me.png", "image/png"), { field: "name", value: "N" }, { field: "email", value: "stu@x.io" }, { field: "role", value: "student" }], null);
  t("profile pic: no token -> 401, nothing uploaded", r.s === 401 && n0() === n);
  for (const [label, name, type] of [["png", "me.png", "image/png"], ["jpeg", "me.jpeg", "image/jpeg"], ["jpg", "ME.JPG", "image/jpeg"], ["webp", "me.webp", "image/webp"]]) {
    n = n0(); r = await post("/upload-profile-pic", [f("profilePic", name, type), { field: "name", value: "N" }, { field: "email", value: "stu@x.io" }, { field: "role", value: "student" }], TS);
    t(`profile pic: ${label} accepted`, r.s === 200 && n0() === n + 1);
  }
  const up = h.uploads[h.uploads.length - 1];
  t("profile pic: stored under elms/profile_pics as an image", up.folder === "elms/profile_pics" && up.resource_type === "image");
  for (const [label, name, type] of [["exe", "run.exe", "application/x-msdownload"], ["html as image type", "page.html", "image/png"], ["png name, html type", "pic.png", "text/html"], ["script", "a.js", "application/javascript"], ["svg", "x.svg", "image/svg+xml"], ["gif", "x.gif", "image/gif"], ["double extension", "pic.png.exe", "image/png"], ["no extension", "pic", "image/png"], ["video as pic", "v.mp4", "video/mp4"], ["php", "shell.php", "image/png"]]) {
    n = n0(); r = await post("/upload-profile-pic", [f("profilePic", name, type)], TS);
    t(`profile pic: rejected (400, nothing stored): ${label}`, r.s === 400 && n0() === n);
  }
  n = n0(); r = await post("/upload-profile-pic", [f("profilePic", "big.png", "image/png", Buffer.alloc(sizes.img + 1))], TS); t("profile pic: over the size cap -> 413, no upload record", r.s === 413 && n0() === n);
  n = n0(); r = await post("/upload-profile-pic", [f("profilePic", "ok.png", "image/png", Buffer.alloc(sizes.img - 1))], TS); t("profile pic: just under the cap accepted", r.s === 200);
  n = n0(); r = await post("/upload-profile-pic", [f("avatar", "a.png", "image/png")], TS); t("profile pic: unexpected field name -> 400", r.s === 400 && n0() === n);
  n = n0(); r = await post("/upload-profile-pic", [f("profilePic", "a.png", "image/png"), f("profilePic", "b.png", "image/png")], TS); t("profile pic: two files -> 400", r.s === 400);
  n = n0(); await post("/upload-profile-pic", [f("profilePic", "../../etc/passwd.png", "image/png"), { field: "name", value: "N" }, { field: "email", value: "stu@x.io" }, { field: "role", value: "student" }], TS);
  const safe = h.uploads[h.uploads.length - 1];
  t("filenames: public_id is a random UUID, never the client's name", /^[0-9a-f-]{36}$/.test(safe.public_id) && !/passwd|\.\./.test(safe.public_id));
  const ids = h.uploads.map((u) => u.public_id); t("filenames: every upload so far has a distinct public_id", new Set(ids).size === ids.length);

  // Chat media (images and the same video types as before).
  n = n0(); r = await post("/upload-chat-media", [f("media", "a.png", "image/png")], null); t("chat media: no token -> 401", r.s === 401 && n0() === n);
  for (const [label, name, type] of [["png", "a.png", "image/png"], ["mp4", "a.mp4", "video/mp4"], ["webm", "a.webm", "video/webm"], ["mov", "a.mov", "video/quicktime"], ["mkv", "a.mkv", "video/x-matroska"]]) { n = n0(); r = await post("/upload-chat-media", [f("media", name, type)], TS); t(`chat media: ${label} accepted`, r.s === 200 && n0() === n + 1); }
  for (const [label, name, type] of [["exe", "a.exe", "application/octet-stream"], ["pdf", "a.pdf", "application/pdf"], ["gif", "a.gif", "image/gif"], ["html", "a.html", "text/html"], ["zip", "a.zip", "application/zip"], ["mp4 name, png type", "a.mp4", "image/png"]]) { n = n0(); r = await post("/upload-chat-media", [f("media", name, type)], TS); t(`chat media: rejected: ${label}`, r.s === 400 && n0() === n); }
  n = n0(); r = await post("/upload-chat-media", [f("media", "big.mp4", "video/mp4", Buffer.alloc(sizes.chat + 1))], TS); t("chat media: over the size cap -> 413", r.s === 413 && n0() === n);

  // Module videos: course owner or admin only, and videos only.
  n = n0(); r = await post("/upload-module-video", [f("moduleVideo", "a.mp4", "video/mp4")], null); t("module video: no token -> 401", r.s === 401 && n0() === n);
  r = await post("/upload-module-video", [f("moduleVideo", "a.mp4", "video/mp4")], TS); t("module video: student -> 403, nothing uploaded", r.s === 403 && n0() === n);
  for (const [label, name, type] of [["mp4", "a.mp4", "video/mp4"], ["webm", "a.webm", "video/webm"], ["mov", "a.mov", "video/quicktime"], ["mkv", "a.mkv", "video/x-matroska"]]) { n = n0(); r = await post("/upload-module-video", [f("moduleVideo", name, type)], TI); t(`module video: instructor uploads ${label}`, r.s === 200 && n0() === n + 1 && h.uploads[h.uploads.length - 1].resource_type === "video"); }
  n = n0(); r = await post("/upload-module-video", [f("moduleVideo", "a.mp4", "video/mp4")], TA); t("module video: admin allowed", r.s === 200);
  for (const [label, name, type] of [["image", "a.png", "image/png"], ["exe", "a.exe", "video/mp4"], ["avi", "a.avi", "video/x-msvideo"], ["script", "a.sh", "text/x-sh"]]) { n = n0(); r = await post("/upload-module-video", [f("moduleVideo", name, type)], TI); t(`module video: rejected: ${label}`, r.s === 400 && n0() === n); }
  n = n0(); r = await post("/upload-module-video", [f("moduleVideo", "big.mp4", "video/mp4", Buffer.alloc(sizes.vid + 1))], TI); t("module video: over the size cap -> 413", r.s === 413 && n0() === n);

  // Course creation with a thumbnail and a video.
  const course = (extra = []) => [{ field: "title", value: "T" }, { field: "description", value: "D" }, { field: "category", value: "C" }, { field: "difficulty", value: "Easy" }, { field: "total_lessons", value: "1" }, ...extra];
  for (const path of ["/upload-course", "/upload-course-with-media"]) {
    n = n0(); r = await post(path, course([f("thumbnail", "t.png", "image/png"), f("video", "v.mp4", "video/mp4")]), TI); t(`${path}: instructor, thumbnail + video accepted`, r.s === 200 && n0() === n + 2);
    const pair = h.uploads.slice(-2); t(`${path}: video goes to the video folder, both get random ids`, pair.some((u) => u.folder === "elms/course_videos" && u.resource_type === "video") && pair.every((u) => /^[0-9a-f-]{36}$/.test(u.public_id)));
    n = n0(); r = await post(path, course([f("thumbnail", "t.exe", "image/png")]), TI); t(`${path}: bad thumbnail extension -> 400`, r.s === 400 && n0() === n);
    n = n0(); r = await post(path, course([f("thumbnail", "t.mp4", "video/mp4")]), TI); t(`${path}: video in the thumbnail slot -> 400`, r.s === 400 && n0() === n);
    n = n0(); r = await post(path, course([f("video", "v.png", "image/png")]), TI); t(`${path}: image in the video slot -> 400`, r.s === 400 && n0() === n);
    n = n0(); r = await post(path, course([f("attachment", "x.png", "image/png")]), TI); t(`${path}: unexpected field -> 400`, r.s === 400 && n0() === n);
    n = n0(); r = await post(path, course([f("thumbnail", "a.png", "image/png"), f("video", "v.mp4", "video/mp4"), f("video", "w.mp4", "video/mp4")]), TI); t(`${path}: extra file -> 400`, r.s === 400);
    n = n0(); r = await post(path, course([f("video", "big.mp4", "video/mp4", Buffer.alloc(sizes.vid + 1))]), TI); t(`${path}: oversized video -> 413`, r.s === 413 && n0() === n);
    n = n0(); r = await post(path, course([f("thumbnail", "t.png", "image/png")]), TS); t(`${path}: student -> 403, nothing uploaded`, r.s === 403 && n0() === n);
    n = n0(); r = await post(path, course([f("thumbnail", "t.png", "image/png")]), null); t(`${path}: no token -> 401`, r.s === 401 && n0() === n);
  }
  n = n0(); r = await post("/update-course/1", course([f("thumbnail", "t.png", "image/png")]), TI, "PUT"); t("update-course: course owner uploads a thumbnail", r.s === 200 && n0() === n + 1);
  n = n0(); r = await post("/update-course/1", course([f("thumbnail", "t.exe", "image/png")]), TI, "PUT"); t("update-course: bad thumbnail -> 400", r.s === 400 && n0() === n);
  n = n0(); r = await post("/update-course/1", course([f("thumbnail", "t.png", "image/png")]), TS, "PUT"); t("update-course: student -> 403, nothing uploaded", r.s === 403 && n0() === n);
  finish();
})();
