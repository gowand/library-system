
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const slugify = require("slugify");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const SECRET = "supersecretkey";
const DB_PATH = path.join(__dirname, "data", "db.json");

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => Number(x.id) || 0)) + 1 : 1;
}

function seed() {
  const db = readDb();
  let changed = false;

  if (!db.users.find(u => u.email === "admin@ktb.gov.tr")) {
    db.users.push({
      id: nextId(db.users),
      email: "admin@ktb.gov.tr",
      password: bcrypt.hashSync("123456", 10),
      role: "SUPER_ADMIN",
      libraryId: null
    });
    changed = true;
  }

  const library = db.libraries.find(l => l.slug === "yesilyurt");
  if (library && !db.users.find(u => u.email === "yesilyurt@ktb.gov.tr")) {
    db.users.push({
      id: nextId(db.users),
      email: "yesilyurt@ktb.gov.tr",
      password: bcrypt.hashSync("123456", 10),
      role: "LIBRARY_ADMIN",
      libraryId: library.id
    });
    changed = true;
  }

  if (changed) writeDb(db);
}

seed();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

function currentLang(req) {
  return req.cookies.lang === "en" ? "en" : "tr";
}

function isTR(req) {
  return currentLang(req) === "tr";
}


function autoEN(input) {
  if (!input) return "";
  let out = String(input);
  const pairs = [
    ["Kütüphanemiz","Our library"],["etkinlik","event"],["Etkinlik","Event"],
    ["çocuk","child"],["Çocuk","Child"],["oyun","game"],["Oyun","Game"],
    ["zeka","intelligence"],["masal","story"],["Masal","Story"],
    ["atölyesi","workshop"],["Atölyesi","Workshop"],["salonu","hall"],["Salonu","Hall"],
    ["başvuru","application"],["Başvuru","Application"],["arşiv","archive"],["Arşiv","Archive"],
    ["görsel","image"],["fotoğraf","photo"]
  ];
  for (const [a,b] of pairs) out = out.replace(new RegExp(a, "g"), b);
  return out;
}

function sendApplicationNotice(db, library, event, application) {
  db.notifications = db.notifications || [];
  db.notifications.push({
    id: nextId(db.notifications),
    type: "application_received",
    phone: application.phone,
    messageTR: `${library.name}\n"${event.titleTR || event.title || ""}" etkinliği için başvurunuz alınmıştır.\nTarih: ${event.date}\nSaat: ${event.time || ""}\nYer: ${event.locationTR || event.location || ""}`,
    messageEN: `${library.name}\nYour application for "${event.titleEN || autoEN(event.titleTR || event.title || "")}" has been received.\nDate: ${event.date}\nTime: ${event.time || ""}\nLocation: ${event.locationEN || autoEN(event.locationTR || event.location || "")}`,
    createdAt: new Date().toISOString()
  });
}


function text(req, tr, en) {
  return isTR(req) ? tr : en;
}

function isPastEvent(event) {
  if (!event || !event.date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(event.date);
  eventDate.setHours(0, 0, 0, 0);
  return eventDate < today;
}

function value(req, obj, key) {
  if (isTR(req)) return obj[key + "TR"] || obj[key] || "";
  return obj[key + "EN"] || autoEN(obj[key + "TR"] || obj[key] || "");
}

function langSwitch(req) {
  const lang = currentLang(req);
  return `
    <div class="lang">
      <a class="${lang === "tr" ? "active" : ""}" href="/lang/tr">🇹🇷 TR</a>
      <a class="${lang === "en" ? "active" : ""}" href="/lang/en">🇬🇧 EN</a>
    </div>
  `;
}

function page(req, title, body) {
  return `<!doctype html>
<html lang="${currentLang(req)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/public/css/style.css">
</head>
<body>${body}</body>
</html>`;
}


function applyFormPage(req, library, event, count, errorMessage, old = {}) {
  return page(req, "Apply", `
    ${publicNav(req, library)}
    <main class="container grid2">
      <section class="card">
        ${event.poster ? `<img class="card-img" src="${event.poster}">` : ""}
        <h1>${value(req, event, "title")}</h1>
        <p>${value(req, event, "description")}</p>

        <div class="card" style="box-shadow:none;background:#f8fafc">
          <h3>${text(req, "Etkinlik Başvuru Şartları", "Event Application Requirements")}</h3>
          <p><b>${text(req, "Yaş aralığı", "Age range")}:</b> ${event.ageMin}-${event.ageMax}</p>
          <p><b>${text(req, "Kontenjan", "Capacity")}:</b> ${count}/${event.capacity}</p>
          <p><b>${text(req, "Tarih", "Date")}:</b> ${event.date} ${event.time || ""}</p>
          <p><b>${text(req, "Yer", "Location")}:</b> ${value(req, event, "location")}</p>
        </div>
      </section>

      <section class="card">
        <h2>${text(req, "Etkinliğe Başvur", "Apply to Event")}</h2>
        ${errorMessage ? `<div class="alert">${errorMessage}</div>` : ""}
        <form method="POST">
          <input name="name" value="${old.name || ""}" placeholder="${text(req, "Ad", "Name")}" required>
          <input name="surname" value="${old.surname || ""}" placeholder="${text(req, "Soyad", "Surname")}" required>
          <input name="phone" value="${old.phone || "05"}" maxlength="11" placeholder="05XXXXXXXXX" pattern="05[0-9]{9}" title="${text(req, "Telefon 05 ile başlamalı ve toplam 11 haneli olmalı. Örnek: 05537933748", "Phone must start with 05 and be exactly 11 digits. Example: 05537933748")}" required>
          <input type="number" name="age" value="${old.age || ""}" placeholder="${text(req, "Yaş", "Age")}" required>
          <button>${text(req, "Başvuru Gönder", "Submit Application")}</button>
        </form>
      </section>
    </main>
  `);
}


function publicNav(req, library) {
  return `
    <nav class="nav">
      <a class="brand" href="/${library.slug}">
        ${library.logo ? `<img src="${library.logo}" alt="logo">` : ""}
        <b>${library.name}</b>
      </a>
      <div>
        <a href="/${library.slug}/events">${text(req, "Etkinlik Başvuru", "Event Application")}</a>
        <a href="/${library.slug}/archive">${text(req, "Etkinlik Arşivi", "Event Archive")}</a>
        <a href="/${library.slug}/games">${text(req, "Oyunlar", "Games")}</a>
        <a href="/${library.slug}/about">${text(req, "Hakkımızda", "About")}</a>
        <a href="/${library.slug}/contact">${text(req, "İletişim", "Contact")}</a>
        ${langSwitch(req)}
      </div>
    </nav>
  `;
}

function sidebar(req) {
  return `
    <aside class="side">
      <h2>🏛️ ${text(req, "Kütüphane Paneli", "Library Panel")}</h2>
      ${langSwitch(req)}
      <a href="/dashboard">${text(req, "Panel Ana Sayfa", "Dashboard")}</a>
      <a href="/dashboard/profile">Logo & Banner</a>
      <a href="/dashboard/events">${text(req, "Etkinlik / Afiş", "Events / Posters")}</a>
      <a href="/dashboard/applications">${text(req, "Başvurular", "Applications")}</a>
      <a href="/dashboard/games">${text(req, "Oyun Yönetimi", "Game Management")}</a>
      <a href="/dashboard/archive">${text(req, "Arşiv Fotoğrafları", "Archive Photos")}</a>
      <a href="/dashboard/stats">${text(req, "İstatistik", "Statistics")}</a>
      <a href="/dashboard/backup">${text(req, "Yedekle", "Backup")}</a>
      <a href="/logout">${text(req, "Çıkış", "Logout")}</a>
    </aside>
  `;
}

function getUser(req) {
  try {
    const token = req.cookies.token;
    if (!token) return null;
    const decoded = jwt.verify(token, SECRET);
    return readDb().users.find(u => u.id === decoded.id) || null;
  } catch {
    return null;
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const user = getUser(req);
    if (!user) return res.redirect("/login");
    if (role && user.role !== role) return res.status(403).send("Unauthorized");
    req.user = user;
    next();
  };
}

function uploader(folder) {
  const dir = path.join(__dirname, "uploads", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
      }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Images only"));
    }
  });
}

function libraryOfUser(req, db) {
  return db.libraries.find(l => l.id === req.user.libraryId);
}

function getLibraryBySlug(req, res) {
  const db = readDb();
  const library = db.libraries.find(l => l.slug === req.params.slug && l.approved);
  if (!library) {
    res.status(404).send(text(req, "Kütüphane bulunamadı veya onaylanmamış.", "Library not found or not approved."));
    return null;
  }
  return { db, library };
}

app.get("/lang/:lang", (req, res) => {
  const lang = req.params.lang === "en" ? "en" : "tr";
  res.cookie("lang", lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.redirect(req.get("Referrer") || "/");
});

app.get("/", (req, res) => {
  const db = readDb();
  const libraries = db.libraries.filter(l => l.approved);

  res.send(page(req, "Library System", `
    <header class="hero">
      ${langSwitch(req)}
      <h1>${text(req, "Kütüphane Etkinlik Arşivi ve Oyun Sistemi", "Library Event Archive and Games System")}</h1>
      <p>${text(req, "Kütüphaneler kendi sayfalarını oluşturur, etkinlik afişlerini yayınlar, etkinlik sonrası fotoğrafları arşivler ve eğitici oyunlarını sergiler.", "Libraries create their own pages, publish event posters, archive post-event photos and showcase educational games.")}</p>
    </header>

    <main class="container grid2">
      <section class="card">
        <h2>${text(req, "Kütüphane Başvurusu", "Library Application")}</h2>
        <form method="POST" action="/library-apply">
          <input name="name" placeholder="${text(req, "Kütüphane adı", "Library name")}" required>
          <input name="slug" placeholder="${text(req, "Kısa link örn: yesilyurt", "Short link e.g. yesilyurt")}">
          <input name="email" placeholder="@ktb.gov.tr email" required>
          <input type="password" name="password" placeholder="${text(req, "Şifre", "Password")}" required>
          <input name="phone" placeholder="${text(req, "Telefon", "Phone")}">
          <textarea name="aboutTR" placeholder="Hakkımızda (TR)"></textarea>
          <input name="addressTR" placeholder="Adres (TR)">
          <input name="addressEN" placeholder="Address (EN)">
          <button>${text(req, "Başvuru Gönder", "Submit Application")}</button>
        </form>
      </section>

      <section class="card">
        <h2>${text(req, "Onaylı Kütüphaneler", "Approved Libraries")}</h2>
        ${libraries.map(l => `<p><a class="btn small white" href="/${l.slug}">${l.name}</a></p>`).join("") || `<p>${text(req, "Henüz onaylı kütüphane yok.", "No approved libraries yet.")}</p>`}
      </section>
    </main>
  `));
});

app.post("/library-apply", (req, res) => {
  const db = readDb();
  const email = (req.body.email || "").trim().toLowerCase();

  if (!email.endsWith("@ktb.gov.tr")) {
    return res.send(page(req, "Error", `<main class="container"><div class="card alert">${text(req, "Sadece @ktb.gov.tr e-posta kabul edilir.", "Only @ktb.gov.tr emails are accepted.")}</div><a href="/">Back</a></main>`));
  }

  if (db.libraries.find(l => l.email === email)) {
    return res.send(page(req, "Error", `<main class="container"><div class="card alert">${text(req, "Bu e-posta ile başvuru zaten var.", "This email is already registered.")}</div><a href="/">Back</a></main>`));
  }

  let slug = slugify(req.body.slug || req.body.name, { lower: true, strict: true }) || ("kutuphane-" + Date.now());
  if (db.libraries.find(l => l.slug === slug)) slug += "-" + Date.now();

  db.libraries.push({
    id: nextId(db.libraries),
    name: req.body.name,
    slug,
    email,
    passwordPlain: req.body.password || "123456",
    approved: false,
    status: "pending",
    logo: "",
    banner: "",
    theme: "light",
    aboutTR: req.body.aboutTR || "",
    aboutEN: req.body.aboutEN || "",
    addressTR: req.body.addressTR || "",
    addressEN: req.body.addressEN || "",
    phone: req.body.phone || "",
    contactEmail: email
  });

  writeDb(db);

  res.send(page(req, "Success", `<main class="container"><section class="card success"><h2>${text(req, "Başvurunuz alındı.", "Your application has been received.")}</h2><p>${text(req, "Süper admin onayından sonra giriş yapabilirsiniz.", "You can login after super admin approval.")}</p><a class="btn" href="/">Home</a></section></main>`));
});

app.get("/library-login", (req, res) => {
  res.send(page(req, "Library", `
    <div class="login-page">
      <div class="login-card">
        ${langSwitch(req)}
        <h1>${text(req, "Kütüphane", "Library")}</h1>
        <p>${text(req, "Sadece kütüphane yöneticileri giriş yapar.", "Only library administrators login here.")}</p>
        <form method="POST" action="/library-login">
          <label>${text(req, "E-posta", "Email")}</label>
          <input name="email" value="yesilyurt@ktb.gov.tr" required>
          <label>${text(req, "Şifre", "Password")}</label>
          <input type="password" name="password" value="123456" required>
          <button>${text(req, "Giriş Yap", "Login")}</button>
        </form>

      </div>
    </div>
  `));
});

app.get("/admin-login", (req, res) => {
  res.send(page(req, "Super Admin", `
    <div class="login-page">
      <div class="login-card">
        ${langSwitch(req)}
        <h1>${text(req, "Süper Admin", "Super Admin")}</h1>
        <p>${text(req, "Sadece sistem onayı yapan süper admin giriş yapar.", "Only the super admin who approves libraries logs in here.")}</p>
        <form method="POST" action="/admin-login">
          <label>${text(req, "E-posta", "Email")}</label>
          <input name="email" value="admin@ktb.gov.tr" required>
          <label>${text(req, "Şifre", "Password")}</label>
          <input type="password" name="password" value="123456" required>
          <button>${text(req, "Giriş Yap", "Login")}</button>
        </form>

      </div>
    </div>
  `));
});

app.get("/login", (req, res) => {
  return res.redirect("/library-login");
});

app.get("/login", (req, res) => {
  return res.redirect("/library-login");
});

app.post("/library-login", async (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.email === req.body.email);

  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return res.send(page(req, "Login", `
      <div class="login-page">
        <div class="login-card">
          ${langSwitch(req)}
          <div class="alert">${text(req, "Giriş bilgileri hatalı.", "Invalid login credentials.")}</div>
          <a class="btn" href="/login">${text(req, "Tekrar Dene", "Try Again")}</a>
        </div>
      </div>
    `));
  }

  if (user.role !== "LIBRARY_ADMIN") {
    return res.send(page(req, "Login", `
      <div class="login-page">
        <div class="login-card">
          <div class="alert">${text(req, "Bu giriş sadece kütüphane yöneticileri içindir.", "This login is only for library administrators.")}</div>
        </div>
      </div>
    `));
  }

  if (user.role === "LIBRARY_ADMIN") {
    const library = db.libraries.find(l => l.id === user.libraryId);
    if (!library || !library.approved) {
      return res.send(page(req, "Login", `<main class="container"><div class="card alert">${text(req, "Kütüphane henüz onaylanmamış.", "Library has not been approved yet.")}</div></main>`));
    }
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: "1d" });
  res.cookie("token", token, { httpOnly: true });
  res.redirect(user.role === "SUPER_ADMIN" ? "/super-admin" : "/dashboard");
});


app.post("/admin-login", async (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.email === req.body.email);

  if (!user || !(await bcrypt.compare(req.body.password, user.password)) || user.role !== "SUPER_ADMIN") {
    return res.send(page(req, "Login", `
      <div class="login-page">
        <div class="login-card">
          <div class="alert">${text(req, "Süper admin giriş bilgileri hatalı.", "Invalid super admin credentials.")}</div>
        </div>
      </div>
    `));
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: "1d" });
  res.cookie("token", token, { httpOnly: true });
  res.redirect("/super-admin");
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

app.get("/super-admin", requireRole("SUPER_ADMIN"), (req, res) => {
  const db = readDb();

  res.send(page(req, "Super Admin", `
    <main class="container">
      <div class="page-head">
        <div>
          <span class="eyebrow">${text(req, "Sistem Onayı", "System Approval")}</span>
          <h1>${text(req, "Süper Admin Paneli", "Super Admin Panel")}</h1>
          <p>${text(req, "Sadece kütüphane başvurularını onaylar veya reddeder.", "Approves or rejects library applications only.")}</p>
        </div>
        <div>${langSwitch(req)} <a class="btn white" href="/logout">${text(req, "Çıkış", "Logout")}</a></div>
      </div>

      <div class="stats">
        <div class="stat">${text(req, "Toplam Kütüphane", "Total Libraries")}<b>${db.libraries.length}</b></div>
        <div class="stat">${text(req, "Onay Bekleyen", "Pending")}<b>${db.libraries.filter(l => !l.approved && l.status !== "rejected").length}</b></div>
      </div>

      <section class="card">
        <h2>${text(req, "Kütüphane Başvuruları", "Library Applications")}</h2>
        <table>
          <tr>
            <th>${text(req, "Kütüphane", "Library")}</th>
            <th>Email</th>
            <th>Link</th>
            <th>${text(req, "Durum", "Status")}</th>
            <th>${text(req, "İşlem", "Action")}</th>
          </tr>
          ${db.libraries.map(l => `
            <tr>
              <td>${l.name}</td>
              <td>${l.email}</td>
              <td>/${l.slug}</td>
              <td>${l.approved ? text(req, "Onaylı", "Approved") : l.status}</td>
              <td>
                <form class="inline" method="POST" action="/super-admin/libraries/${l.id}/approve"><button>${text(req, "Onayla", "Approve")}</button></form>
                <form class="inline" method="POST" action="/super-admin/libraries/${l.id}/reject"><button class="danger">${text(req, "Reddet", "Reject")}</button></form>
              </td>
            </tr>
          `).join("")}
        </table>
      </section>
    </main>
  `));
});

app.post("/super-admin/libraries/:id/approve", requireRole("SUPER_ADMIN"), (req, res) => {
  const db = readDb();
  const library = db.libraries.find(l => l.id === Number(req.params.id));

  if (library) {
    library.approved = true;
    library.status = "approved";

    if (!db.users.find(u => u.email === library.email)) {
      db.users.push({
        id: nextId(db.users),
        email: library.email,
        password: bcrypt.hashSync(library.passwordPlain || "123456", 10),
        role: "LIBRARY_ADMIN",
        libraryId: library.id
      });
    }
  }

  writeDb(db);
  res.redirect("/super-admin");
});

app.post("/super-admin/libraries/:id/reject", requireRole("SUPER_ADMIN"), (req, res) => {
  const db = readDb();
  const library = db.libraries.find(l => l.id === Number(req.params.id));

  if (library) {
    library.approved = false;
    library.status = "rejected";
  }

  writeDb(db);
  res.redirect("/super-admin");
});

app.get("/dashboard", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const events = db.events.filter(e => e.libraryId === library.id);
  const games = db.games.filter(g => g.libraryId === library.id);
  const applications = db.applications.filter(a => events.some(e => e.id === a.eventId));

  res.send(page(req, "Dashboard", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <div class="page-head">
          <div>
            <span class="eyebrow">${text(req, "Kütüphane Yönetimi", "Library Management")}</span>
            <h1>${text(req, "Panel Ana Sayfa", "Dashboard")}</h1>
            <p>${library.name}</p>
          </div>
          <a class="btn white" target="_blank" href="/${library.slug}">${text(req, "Ziyaretçi Sayfası", "Public Page")}</a>
        </div>

        <div class="stats">
          <div class="stat">${text(req, "Etkinlik Afişi", "Event Posters")}<b>${events.length}</b></div>
          <div class="stat">${text(req, "Başvuru", "Applications")}<b>${applications.length}</b></div>
          <div class="stat">${text(req, "Oyun", "Games")}<b>${games.length}</b></div>
        </div>

        <section class="card">
          <h2>${text(req, "Sistem Mantığı", "System Flow")}</h2>
          <p>${text(req, "Etkinlikler arşivde afiş olarak görünür. Afişe tıklanınca etkinlik detayına ve fotoğraf galerisine gidilir. Etkinlik bittikten sonra fotoğrafları Arşiv Fotoğrafları bölümünden ekleyebilirsiniz.", "Events appear as poster cards in the archive. Clicking a poster opens the event detail and photo gallery. After the event, photos can be added from the Archive Photos section.")}</p>
        </section>
      </main>
    </div>
  `));
});

app.get("/dashboard/profile", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);

  res.send(page(req, "Profile", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <div class="page-head">
          <div>
            <span class="eyebrow">${text(req, "Kütüphane Vitrini", "Library Identity")}</span>
            <h1>${text(req, "Logo, Banner ve Sayfa Bilgileri", "Logo, Banner and Page Information")}</h1>
          </div>
          <a class="btn white" target="_blank" href="/${library.slug}">${text(req, "Görüntüle", "View")}</a>
        </div>

        <form class="card" method="POST" enctype="multipart/form-data">
          <div class="grid2">
            <div>
              <h3>Logo</h3>
              ${library.logo ? `<img class="preview logo-preview" src="${library.logo}">` : `<div class="preview">Logo</div>`}
              <input type="file" name="logo" accept="image/*">
            </div>
            <div>
              <h3>Banner</h3>
              ${library.banner ? `<img class="preview" src="${library.banner}">` : `<div class="preview">Banner</div>`}
              <input type="file" name="banner" accept="image/*">
            </div>
          </div>

          <div class="form-grid">
            <input name="name" value="${library.name || ""}" placeholder="${text(req, "Kütüphane adı", "Library name")}">
            <input name="contactEmail" value="${library.contactEmail || ""}" placeholder="Email">
            <input name="phone" value="${library.phone || ""}" placeholder="${text(req, "Telefon", "Phone")}">
          </div>

          <textarea name="aboutTR" placeholder="Hakkımızda (TR)">${library.aboutTR || ""}</textarea>
          <input name="addressTR" value="${library.addressTR || ""}" placeholder="Adres (TR)">
          <input name="addressEN" value="${library.addressEN || ""}" placeholder="Address (EN)">

          <button>${text(req, "Kaydet", "Save")}</button>
        </form>
      </main>
    </div>
  `));
});

app.post("/dashboard/profile", requireRole("LIBRARY_ADMIN"), uploader("profile").fields([{ name: "logo" }, { name: "banner" }]), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);

  library.name = req.body.name || library.name;
  library.contactEmail = req.body.contactEmail || "";
  library.phone = req.body.phone || "";
  library.aboutTR = req.body.aboutTR || "";
  library.aboutEN = req.body.aboutEN || "";
  library.addressTR = req.body.addressTR || "";
  library.addressEN = req.body.addressEN || "";

  if (req.files.logo) library.logo = "/uploads/profile/" + req.files.logo[0].filename;
  if (req.files.banner) library.banner = "/uploads/profile/" + req.files.banner[0].filename;

  writeDb(db);
  res.redirect("/dashboard/profile");
});

app.get("/dashboard/events", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const events = db.events.filter(e => e.libraryId === library.id);

  res.send(page(req, "Events", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <div class="page-head">
          <div>
            <span class="eyebrow">${text(req, "Afiş Vitrini", "Poster Showcase")}</span>
            <h1>${text(req, "Etkinlik / Afiş", "Events / Posters")}</h1>
          </div>
          <a class="btn" href="/dashboard/events/new">${text(req, "Yeni Etkinlik", "New Event")}</a>
        </div>

        <section class="card">
          <table>
            <tr>
              <th>${text(req, "Afiş", "Poster")}</th>
              <th>${text(req, "Etkinlik", "Event")}</th>
              <th>${text(req, "Tarih", "Date")}</th>
              <th>${text(req, "Kontenjan", "Capacity")}</th>
              <th>${text(req, "İşlem", "Action")}</th>
            </tr>
            ${events.map(e => `
              <tr>
                <td>${e.poster ? `<img class="thumb" src="${e.poster}">` : "-"}</td>
                <td>${value(req, e, "title")}</td>
                <td>${e.date}</td>
                <td>${e.capacity}</td>
                <td><a class="btn small white" target="_blank" href="/dashboard/events/${e.id}/qr">QR</a> <form class="inline" method="POST" action="/dashboard/events/${e.id}/delete"><button class="danger">${text(req, "Sil", "Delete")}</button></form></td>
              </tr>
            `).join("")}
          </table>
        </section>
      </main>
    </div>
  `));
});

app.get("/dashboard/events/new", requireRole("LIBRARY_ADMIN"), (req, res) => {
  res.send(page(req, "New Event", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <h1>${text(req, "Yeni Etkinlik Afişi", "New Event Poster")}</h1>
        <form class="card" method="POST" enctype="multipart/form-data">
          <div class="form-grid">
            <input name="titleTR" placeholder="Etkinlik adı (TR)" required>
            </div>
          <textarea name="descriptionTR" placeholder="Etkinlik açıklaması (TR)" required></textarea>
          <div class="form-grid">
            <input type="date" name="date" required>
            <input name="time" placeholder="${text(req, "Saat", "Time")}">
            <input name="locationTR" placeholder="Yer (TR)">
            <input type="number" name="ageMin" placeholder="${text(req, "Min yaş", "Min age")}">
            <input type="number" name="ageMax" placeholder="${text(req, "Max yaş", "Max age")}">
            <input type="number" name="capacity" placeholder="${text(req, "Kontenjan", "Capacity")}">
          </div>
          <label>${text(req, "Etkinlik afişi", "Event poster")}</label>
          <input type="file" name="poster" accept="image/*">
          <button>${text(req, "Kaydet", "Save")}</button>
        </form>
      </main>
    </div>
  `));
});

app.post("/dashboard/events/new", requireRole("LIBRARY_ADMIN"), uploader("posters").single("poster"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);

  db.events.push({
    id: nextId(db.events),
    libraryId: library.id,
    titleTR: req.body.titleTR,
    titleEN: autoEN(req.body.titleTR || ""),
    descriptionTR: req.body.descriptionTR,
    descriptionEN: autoEN(req.body.descriptionTR || ""),
    date: req.body.date,
    time: req.body.time,
    locationTR: req.body.locationTR,
    locationEN: autoEN(req.body.locationTR || ""),
    ageMin: Number(req.body.ageMin),
    ageMax: Number(req.body.ageMax),
    capacity: Number(req.body.capacity),
    poster: req.file ? "/uploads/posters/" + req.file.filename : ""
  });

  writeDb(db);
  res.redirect("/dashboard/events");
});

app.post("/dashboard/events/:id/delete", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const id = Number(req.params.id);

  db.events = db.events.filter(e => e.id !== id);
  db.applications = db.applications.filter(a => a.eventId !== id);
  db.archiveImages = db.archiveImages.filter(i => i.eventId !== id);

  writeDb(db);
  res.redirect("/dashboard/events");
});

app.get("/dashboard/applications", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const events = db.events.filter(e => e.libraryId === library.id);
  const applications = db.applications.filter(a => events.some(e => e.id === a.eventId));

  res.send(page(req, "Applications", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <h1>${text(req, "Başvurular", "Applications")}</h1>
        <section class="card">
          <table>
            <tr>
              <th>${text(req, "Etkinlik", "Event")}</th>
              <th>${text(req, "Ad Soyad", "Full Name")}</th>
              <th>${text(req, "Telefon", "Phone")}</th>
              <th>${text(req, "Yaş", "Age")}</th>
              <th>${text(req, "Durum", "Status")}</th>
              <th>${text(req, "Yoklama", "Attendance")}</th>
              <th>${text(req, "İşlem", "Action")}</th>
            </tr>
            ${applications.map(a => {
              const e = events.find(e => e.id === a.eventId);
              return `<tr>
                <td>${e ? value(req, e, "title") : ""}</td>
                <td>${a.name} ${a.surname}</td>
                <td>${a.phone}</td>
                <td>${a.age}</td>
                <td>${a.status || "pending"}</td>
                <td>${a.attendance || "unknown"}</td>
                <td>
                  <form class="inline" method="POST" action="/dashboard/applications/${a.id}/status"><input type="hidden" name="status" value="approved"><button class="small">${text(req, "Onayla", "Approve")}</button></form>
                  <form class="inline" method="POST" action="/dashboard/applications/${a.id}/status"><input type="hidden" name="status" value="reserve"><button class="small">${text(req, "Yedek", "Reserve")}</button></form>
                  <form class="inline" method="POST" action="/dashboard/applications/${a.id}/status"><input type="hidden" name="status" value="rejected"><button class="small danger">${text(req, "Reddet", "Reject")}</button></form>
                  <form class="inline" method="POST" action="/dashboard/applications/${a.id}/attendance"><input type="hidden" name="attendance" value="came"><button class="small">${text(req, "Geldi", "Came")}</button></form>
                  <form class="inline" method="POST" action="/dashboard/applications/${a.id}/attendance"><input type="hidden" name="attendance" value="absent"><button class="small danger">${text(req, "Gelmedi", "Absent")}</button></form>
                </td>
              </tr>`;
            }).join("")}
          </table>
        </section>

        <section class="card">
          <h2>${text(req, "Bildirim Kayıtları", "Notification Logs")}</h2>
          <p class="muted">${text(req, "Gerçek SMS/e-posta için daha sonra API bilgileri bağlanabilir. Şimdilik gönderilecek mesaj kayıt altına alınır.", "For real SMS/email, API credentials can be connected later. For now, the message is logged.")}</p>
          <table>
            <tr><th>${text(req, "Telefon", "Phone")}</th><th>${text(req, "Mesaj", "Message")}</th><th>${text(req, "Tarih", "Date")}</th></tr>
            ${(db.notifications || []).slice(-20).reverse().map(n => `<tr><td>${n.phone}</td><td>${isTR(req) ? n.messageTR : n.messageEN}</td><td>${(n.createdAt || "").slice(0,10)}</td></tr>`).join("")}
          </table>
        </section>
      </main>
    </div>
  `));
});

app.post("/dashboard/applications/:id/status", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const appItem = db.applications.find(a => a.id === Number(req.params.id));
  if (appItem) appItem.status = req.body.status || "pending";
  writeDb(db);
  res.redirect("/dashboard/applications");
});

app.post("/dashboard/applications/:id/attendance", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const appItem = db.applications.find(a => a.id === Number(req.params.id));
  if (appItem) appItem.attendance = req.body.attendance || "unknown";
  writeDb(db);
  res.redirect("/dashboard/applications");
});

app.get("/dashboard/games", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const games = db.games.filter(g => g.libraryId === library.id);

  res.send(page(req, "Games", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <h1>${text(req, "Oyun Yönetimi", "Game Management")}</h1>

        <form class="card" method="POST" enctype="multipart/form-data">
          <div class="form-grid">
            <input name="nameTR" placeholder="Oyun adı (TR)">
            <input name="nameEN" placeholder="Game name (EN)">
            <input name="ageRange" placeholder="${text(req, "Yaş aralığı", "Age range")}">
            <input name="playerCount" placeholder="${text(req, "Oyuncu sayısı", "Player count")}">
            <input type="number" name="pieceCount" placeholder="${text(req, "Parça sayısı", "Piece count")}">
            <input name="shelfCode" placeholder="${text(req, "Raf kodu", "Shelf code")}">
          </div>
          <textarea name="descriptionTR" placeholder="Oyun açıklaması (TR)"></textarea>
          <textarea name="howToPlayTR" placeholder="Nasıl oynanır? (TR)"></textarea>
          <label>${text(req, "Oyun resmi", "Game image")}</label>
          <input type="file" name="image" accept="image/*">
          <button>${text(req, "Oyun Ekle", "Add Game")}</button>
        </form>

        <div class="grid">
          ${games.map(g => `
            <article class="card">
              ${g.image ? `<img class="card-img" src="${g.image}">` : ""}
              <h2>${value(req, g, "name")}</h2>
              <p>${value(req, g, "description")}</p>
              <p><b>${text(req, "Nasıl oynanır", "How to play")}:</b> ${value(req, g, "howToPlay")}</p>
              <p>${g.ageRange} · ${g.playerCount} · ${g.pieceCount} · ${g.shelfCode}</p>
              <p><a class="btn small white" target="_blank" href="/dashboard/games/${g.id}/qr">QR / Barkod</a></p><p><span class="status">${g.status === "available" ? text(req, "Müsait", "Available") : text(req, "Ödünçte", "Borrowed") + " - " + g.borrowerName}</span></p>
              ${g.status === "available" 
                ? `<form method="POST" action="/dashboard/games/${g.id}/borrow"><input name="borrowerName" placeholder="${text(req, "Ödünç alan kişi", "Borrower name")}"><button>${text(req, "Ödünç Ver", "Borrow")}</button></form>`
                : `<form method="POST" action="/dashboard/games/${g.id}/return"><button>${text(req, "Geri Al", "Return")}</button></form>`
              }
            </article>
          `).join("")}
        </div>
      </main>
    </div>
  `));
});

app.post("/dashboard/games", requireRole("LIBRARY_ADMIN"), uploader("games").single("image"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);

  db.games.push({
    id: nextId(db.games),
    libraryId: library.id,
    nameTR: req.body.nameTR,
    nameEN: req.body.nameEN,
    descriptionTR: req.body.descriptionTR,
    descriptionEN: autoEN(req.body.descriptionTR || ""),
    howToPlayTR: req.body.howToPlayTR,
    howToPlayEN: autoEN(req.body.howToPlayTR || ""),
    pieceCount: Number(req.body.pieceCount || 1),
    ageRange: req.body.ageRange,
    playerCount: req.body.playerCount,
    shelfCode: req.body.shelfCode,
    image: req.file ? "/uploads/games/" + req.file.filename : "",
    status: "available",
    borrowerName: "",
    borrowDate: ""
  });

  writeDb(db);
  res.redirect("/dashboard/games");
});

app.post("/dashboard/games/:id/borrow", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const game = db.games.find(g => g.id === Number(req.params.id));

  if (game && game.status === "available") {
    game.status = "borrowed";
    game.borrowerName = req.body.borrowerName || "";
    game.borrowDate = new Date().toISOString().slice(0, 10);
  }

  writeDb(db);
  res.redirect("/dashboard/games");
});

app.post("/dashboard/games/:id/return", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const game = db.games.find(g => g.id === Number(req.params.id));

  if (game) {
    game.status = "available";
    game.borrowerName = "";
    game.borrowDate = "";
  }

  writeDb(db);
  res.redirect("/dashboard/games");
});

app.get("/dashboard/archive", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const events = db.events.filter(e => e.libraryId === library.id);

  res.send(page(req, "Archive", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <div class="page-head">
          <div>
            <span class="eyebrow">${text(req, "Etkinlikten Görseller", "Event Photos")}</span>
            <h1>${text(req, "Arşiv Fotoğrafları", "Archive Photos")}</h1>
          </div>
          <a class="btn white" target="_blank" href="/${library.slug}/archive">${text(req, "Arşivi Gör", "View Archive")}</a>
        </div>

        ${events.map(e => {
          const images = db.archiveImages.filter(i => i.eventId === e.id);
          return `
            <section class="card grid2">
              <div>
                ${e.poster ? `<img class="poster-img" src="${e.poster}">` : `<div class="poster-empty">🎭</div>`}
              </div>
              <div>
                <span class="status">${e.date}</span>
                <h2>${value(req, e, "title")}</h2>
                <p>${value(req, e, "description")}</p>
                <div class="mini-gallery">
                  ${images.map(i => `<img src="${i.image}">`).join("") || `<span class="muted">${text(req, "Henüz fotoğraf yok", "No photos yet")}</span>`}
                </div>
                <form class="upload-row" method="POST" action="/dashboard/archive/${e.id}" enctype="multipart/form-data">
                  <input type="file" name="images" multiple accept="image/*">
                  <button>${text(req, "Fotoğraf Ekle", "Add Photos")}</button>
                </form>
              </div>
            </section>
          `;
        }).join("")}
      </main>
    </div>
  `));
});

app.post("/dashboard/archive/:id", requireRole("LIBRARY_ADMIN"), uploader("archive").array("images", 30), (req, res) => {
  const db = readDb();

  for (const file of req.files) {
    db.archiveImages.push({
      id: nextId(db.archiveImages),
      eventId: Number(req.params.id),
      image: "/uploads/archive/" + file.filename,
      uploadedAt: new Date().toISOString()
    });
  }

  writeDb(db);
  res.redirect("/dashboard/archive");
});


app.get("/dashboard/events/:id/qr", requireRole("LIBRARY_ADMIN"), async (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const event = db.events.find(e => e.id === Number(req.params.id) && e.libraryId === library.id);
  if (!event) return res.status(404).send("Event not found");
  const url = `${req.protocol}://${req.get("host")}/${library.slug}/events/${event.id}/apply`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });
  res.type("image/svg+xml").send(svg);
});

app.get("/dashboard/games/:id/qr", requireRole("LIBRARY_ADMIN"), async (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const game = db.games.find(g => g.id === Number(req.params.id) && g.libraryId === library.id);
  if (!game) return res.status(404).send("Game not found");
  const payload = `GAME:${game.id}|SHELF:${game.shelfCode || ""}|LIB:${library.slug}`;
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 320 });
  res.type("image/svg+xml").send(svg);
});

app.get("/dashboard/stats", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const events = db.events.filter(e => e.libraryId === library.id);
  const games = db.games.filter(g => g.libraryId === library.id);
  const applications = db.applications.filter(a => events.some(e => e.id === a.eventId));
  const borrowed = games.filter(g => g.status === "borrowed").length;
  const topEvent = events.map(e => ({ e, c: applications.filter(a => a.eventId === e.id).length })).sort((a,b) => b.c-a.c)[0];

  res.send(page(req, "Statistics", `
    <div class="admin">
      ${sidebar(req)}
      <main class="workspace">
        <h1>${text(req, "İstatistik Paneli", "Statistics Dashboard")}</h1>
        <div class="stats">
          <div class="stat">${text(req, "Toplam Etkinlik", "Total Events")}<b>${events.length}</b></div>
          <div class="stat">${text(req, "Toplam Başvuru", "Total Applications")}<b>${applications.length}</b></div>
          <div class="stat">${text(req, "Toplam Oyun", "Total Games")}<b>${games.length}</b></div>
          <div class="stat">${text(req, "Ödünçte Oyun", "Borrowed Games")}<b>${borrowed}</b></div>
        </div>
        <section class="card"><h2>${text(req, "En Popüler Etkinlik", "Most Popular Event")}</h2><p>${topEvent ? `${value(req, topEvent.e, "title")} - ${topEvent.c}` : "-"}</p></section>
      </main>
    </div>
  `));
});

app.get("/dashboard/backup", requireRole("LIBRARY_ADMIN"), (req, res) => {
  const db = readDb();
  const library = libraryOfUser(req, db);
  const payload = {
    exportedAt: new Date().toISOString(),
    library,
    events: db.events.filter(e => e.libraryId === library.id),
    games: db.games.filter(g => g.libraryId === library.id),
    applications: db.applications.filter(a => db.events.some(e => e.libraryId === library.id && e.id === a.eventId)),
    archiveImages: db.archiveImages
  };
  res.setHeader("Content-Disposition", `attachment; filename="${library.slug}-backup.json"`);
  res.json(payload);
});

app.get("/:slug", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { library } = ctx;

  res.send(page(req, library.name, `
    ${publicNav(req, library)}
    <header class="library-hero" style="background-image:linear-gradient(135deg,rgba(2,6,23,.75),rgba(22,101,52,.55)),url('${library.banner || ""}')">
      <div>
        <h1>${library.name}</h1>
        <p>${text(req, "Etkinlik arşivi, eğitici oyunlar ve kütüphane hizmetlerini keşfedin.", "Explore the event archive, educational games and library services.")}</p>
        <a class="btn" href="/${library.slug}/archive">${text(req, "Etkinlik Arşivini Gör", "View Event Archive")}</a>
      </div>
    </header>

    <main class="container">
      <div class="grid">
        <a class="big-card" href="/${library.slug}/events"><span class="emoji">📝</span><b>${text(req, "Etkinlik Başvuru", "Event Application")}</b><span>${text(req, "Başvurusu açık etkinlikler", "Events open for application")}</span></a>
        <a class="big-card" href="/${library.slug}/archive"><span class="emoji">📅</span><b>${text(req, "Etkinlik Arşivi", "Event Archive")}</b><span>${text(req, "Biten etkinlik afişleri ve fotoğrafları", "Completed event posters and photos")}</span></a>
        <a class="big-card" href="/${library.slug}/games"><span class="emoji">🧩</span><b>${text(req, "Oyunlar", "Games")}</b><span>${text(req, "Eğitici oyunları inceleyin", "Explore educational games")}</span></a>
        <a class="big-card" href="/${library.slug}/about"><span class="emoji">🏛️</span><b>${text(req, "Hakkımızda", "About")}</b><span>${text(req, "Kütüphaneyi tanıyın", "Meet the library")}</span></a>
        <a class="big-card" href="/${library.slug}/contact"><span class="emoji">📍</span><b>${text(req, "İletişim", "Contact")}</b><span>${text(req, "Bize ulaşın", "Reach us")}</span></a>
      </div>
    </main>
  `));
});

app.get("/:slug/archive", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const events = db.events
    .filter(e => e.libraryId === library.id && isPastEvent(e))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.send(page(req, "Archive", `
    ${publicNav(req, library)}
    <header class="hero">
      <h1>${text(req, "Etkinlik Arşivi", "Event Archive")}</h1>
      <p>${text(req, "Etkinliği biten çalışmaların afişleri otomatik olarak burada görünür. Afişe tıklayınca etkinlik görselleri açılır.", "Posters of completed events appear here automatically. Click a poster to view event photos.")}</p>
    </header>

    <main class="container">
      <div class="grid">
        ${events.map(e => `
          <a class="poster-card" href="/${library.slug}/archive/${e.id}">
            ${e.poster ? `<img class="poster-img" src="${e.poster}">` : `<div class="poster-empty">🎭</div>`}
            <div class="body">
              <h2>${value(req, e, "title")}</h2>
              <p>${e.date}</p>
              <span class="status">${text(req, "Arşivde", "Archived")}</span>
            </div>
          </a>
        `).join("") || `<section class="card"><p>${text(req, "Henüz arşive düşen etkinlik yok.", "No completed events in the archive yet.")}</p></section>`}
      </div>
    </main>
  `));
});

app.get("/:slug/archive/:id", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const event = db.events.find(e => e.id === Number(req.params.id) && e.libraryId === library.id);

  if (!event) return res.status(404).send("Event not found");

  const images = db.archiveImages.filter(i => i.eventId === event.id);

  res.send(page(req, value(req, event, "title"), `
    ${publicNav(req, library)}
    <main class="container">
      <section class="detail-top">
        <div>
          ${event.poster ? `<img class="detail-poster" src="${event.poster}">` : `<div class="detail-poster">🎭</div>`}
        </div>
        <div>
          <span class="status">${event.date}</span>
          <h1>${value(req, event, "title")}</h1>
          <p>${value(req, event, "description")}</p>
          <p><b>${text(req, "Yer", "Location")}:</b> ${value(req, event, "location")} · <b>${text(req, "Saat", "Time")}:</b> ${event.time}</p>
          <p><b>${text(req, "Yaş", "Age")}:</b> ${event.ageMin}-${event.ageMax} · <b>${text(req, "Kontenjan", "Capacity")}:</b> ${event.capacity}</p>
          ${isPastEvent(event) 
            ? `<span class="status">${text(req, "Geçmiş etkinlik - başvuru kapalı", "Past event - applications closed")}</span>` 
            : `<span class="status">${text(req, "Arşiv etkinliği", "Archived event")}</span>`
          }
        </div>
      </section>

      <h2>${text(req, "Etkinlikten Görseller", "Event Photos")}</h2>
      <div class="masonry">
        ${images.map(i => `<a href="${i.image}" target="_blank"><img src="${i.image}"></a>`).join("") || `<p class="muted">${text(req, "Henüz fotoğraf eklenmemiş.", "No photos added yet.")}</p>`}
      </div>
    </main>
  `));
});


app.get("/:slug/events", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const events = db.events
    .filter(e => e.libraryId === library.id && !isPastEvent(e))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  res.send(page(req, "Events", `
    ${publicNav(req, library)}
    <header class="hero">
      <h1>${text(req, "Etkinlik Başvuru", "Event Application")}</h1>
      <p>${text(req, "Sadece başvurusu açık ve tarihi geçmemiş etkinlikler burada görünür.", "Only events open for application and not past their date appear here.")}</p>
    </header>
    <main class="container">
      <div class="grid">
        ${events.map(e => {
          const count = db.applications.filter(a => a.eventId === e.id).length;
          const isFull = count >= e.capacity;
          return `
            <article class="poster-card">
              ${e.poster ? `<img class="poster-img" src="${e.poster}">` : `<div class="poster-empty">📝</div>`}
              <div class="body">
                <h2>${value(req, e, "title")}</h2>
                <p>${value(req, e, "description")}</p>
                <p>${e.date} · ${e.time || ""}</p>
                <p><b>${text(req, "Kontenjan", "Capacity")}:</b> ${count}/${e.capacity}</p>
                ${isFull
                  ? `<span class="status">${text(req, "Kontenjan dolu", "Full")}</span>`
                  : `<a class="btn small" href="/${library.slug}/events/${e.id}/apply">${text(req, "Başvur", "Apply")}</a>`
                }
              </div>
            </article>
          `;
        }).join("") || `<section class="card"><p>${text(req, "Şu anda başvurusu açık etkinlik yok.", "There are currently no events open for application.")}</p></section>`}
      </div>
    </main>
  `));
});

app.get("/:slug/events/:id/apply", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const event = db.events.find(e => e.id === Number(req.params.id) && e.libraryId === library.id);

  if (!event) return res.status(404).send("Event not found");

  if (isPastEvent(event)) {
    return res.send(page(req, "Applications Closed", `
      ${publicNav(req, library)}
      <main class="container">
        <section class="card alert">
          <h2>${text(req, "Bu etkinlik geçmiş tarihlidir.", "This event is in the past.")}</h2>
          <p>${text(req, "Geçmiş etkinliklere başvuru yapılamaz.", "Applications cannot be made for past events.")}</p>
          <a class="btn" href="/${library.slug}/archive/${event.id}">${text(req, "Etkinliğe Dön", "Back to Event")}</a>
        </section>
      </main>
    `));
  }

  const count = db.applications.filter(a => a.eventId === event.id).length;
  res.send(applyFormPage(req, library, event, count, null));
});

app.post("/:slug/events/:id/apply", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const event = db.events.find(e => e.id === Number(req.params.id) && e.libraryId === library.id);

  if (!event) return res.status(404).send("Event not found");

  if (isPastEvent(event)) {
    return res.send(page(req, "Applications Closed", `
      ${publicNav(req, library)}
      <main class="container">
        <section class="card alert">
          <h2>${text(req, "Bu etkinlik geçmiş tarihlidir.", "This event is in the past.")}</h2>
          <p>${text(req, "Geçmiş etkinliklere başvuru yapılamaz.", "Applications cannot be made for past events.")}</p>
          <a class="btn" href="/${library.slug}/archive/${event.id}">${text(req, "Etkinliğe Dön", "Back to Event")}</a>
        </section>
      </main>
    `));
  }

  const count = db.applications.filter(a => a.eventId === event.id).length;
  const old = {
    name: req.body.name || "",
    surname: req.body.surname || "",
    phone: String(req.body.phone || "").trim(),
    age: req.body.age || ""
  };

  const age = Number(req.body.age);
  const phone = old.phone;

  if (!/^05\d{9}$/.test(phone)) {
    return res.send(applyFormPage(
      req,
      library,
      event,
      count,
      text(req, "Telefon numarası 05 ile başlamalı ve 11 haneli olmalıdır. Örnek: 05537933748", "Phone number must start with 05 and be 11 digits. Example: 05537933748"),
      old
    ));
  }

  if (age < event.ageMin || age > event.ageMax) {
    return res.send(applyFormPage(
      req,
      library,
      event,
      count,
      text(req, `Yaşınız bu etkinlik için uygun değil. Bu etkinlik ${event.ageMin}-${event.ageMax} yaş aralığı içindir.`, `Your age is not suitable for this event. This event is for ages ${event.ageMin}-${event.ageMax}.`),
      old
    ));
  }

  if (count >= event.capacity) {
    return res.send(applyFormPage(
      req,
      library,
      event,
      count,
      text(req, "Kontenjan dolmuştur.", "Capacity is full."),
      old
    ));
  }

  if (db.applications.find(a => a.eventId === event.id && a.phone === phone)) {
    return res.send(applyFormPage(
      req,
      library,
      event,
      count,
      text(req, "Bu telefonla daha önce başvuru yapılmış.", "This phone number has already applied."),
      old
    ));
  }

  const newApplication = {
    id: nextId(db.applications),
    eventId: event.id,
    name: req.body.name,
    surname: req.body.surname,
    phone: phone,
    age,
    status: "pending",
    attendance: "unknown",
    createdAt: new Date().toISOString()
  };

  db.applications.push(newApplication);
  sendApplicationNotice(db, library, event, newApplication);

  writeDb(db);

  res.send(page(req, "Success", `<main class="container"><section class="card success"><h2>${text(req, "Başvurunuz alındı.", "Your application has been received.")}</h2><a class="btn" href="/${library.slug}/events">Back</a></section></main>`));
});

app.get("/:slug/games", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { db, library } = ctx;
  const games = db.games.filter(g => g.libraryId === library.id);

  res.send(page(req, "Games", `
    ${publicNav(req, library)}
    <main class="container">
      <h1>${text(req, "Eğitici Oyunlar", "Educational Games")}</h1>
      <p class="muted">${text(req, "Oyunlar kütüphane içinde ödünç verilir.", "Games are borrowed inside the library.")}</p>
      <div class="grid">
        ${games.map(g => `
          <article class="card">
            ${g.image ? `<img class="card-img" src="${g.image}">` : ""}
            <h2>${value(req, g, "name")}</h2>
            <p>${value(req, g, "description")}</p>
            <p><b>${text(req, "Nasıl oynanır", "How to play")}:</b> ${value(req, g, "howToPlay")}</p>
            <p>${g.ageRange} · ${g.playerCount} · ${g.pieceCount} · ${g.shelfCode}</p>
            <span class="status">${g.status === "available" ? text(req, "Müsait", "Available") : text(req, "Ödünçte", "Borrowed")}</span>
          </article>
        `).join("")}
      </div>
    </main>
  `));
});

app.get("/:slug/about", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { library } = ctx;

  res.send(page(req, "About", `
    ${publicNav(req, library)}
    <main class="container">
      <section class="card">
        <h1>${text(req, "Hakkımızda", "About Us")}</h1>
        <p>${value(req, library, "about")}</p>
      </section>
    </main>
  `));
});

app.get("/:slug/contact", (req, res) => {
  const ctx = getLibraryBySlug(req, res);
  if (!ctx) return;

  const { library } = ctx;

  res.send(page(req, "Contact", `
    ${publicNav(req, library)}
    <main class="container">
      <section class="card">
        <h1>${text(req, "İletişim", "Contact")}</h1>
        <p><b>${text(req, "Adres", "Address")}:</b> ${value(req, library, "address")}</p>
        <p><b>${text(req, "Telefon", "Phone")}:</b> ${library.phone}</p>
        <p><b>Email:</b> ${library.contactEmail}</p>
      </section>
    </main>
  `));
});

app.use((req, res) => {
  res.status(404).send(page(req, "404", `<main class="container"><section class="card"><h1>404</h1><p>${text(req, "Sayfa bulunamadı.", "Page not found.")}</p><a class="btn" href="/">Home</a></section></main>`));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server: http://localhost:" + PORT);
  console.log("Super Admin: admin@ktb.gov.tr / 123456");
  console.log("Library: yesilyurt@ktb.gov.tr / 123456");
});
