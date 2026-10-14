// server.js — Node.js backend for Hospital Management System
// Run: node server.js

const http = require("http");
const fs   = require("fs");
const path = require("path");
const url  = require("url");

const PORT     = 8080;
const DATA_DIR = path.join(__dirname, "data");
const FRONT    = path.join(__dirname, "frontend");

let patients = [], doctors = [], appointments = [];
let nextPatientId = 1, nextDoctorId = 1, nextApptId = 1;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function save(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name + ".json"), JSON.stringify(data, null, 2));
}
function load(name) {
  const file = path.join(DATA_DIR, name + ".json");
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {} }
  return null;
}
function loadAll() {
  ensureDataDir();
  const p = load("patients");    if (p) { patients     = p.data; nextPatientId = p.next; }
  const d = load("doctors");     if (d) { doctors      = d.data; nextDoctorId  = d.next; }
  const a = load("appointments");if (a) { appointments = a.data; nextApptId    = a.next; }
}
function savePatients()     { save("patients",     { data: patients,     next: nextPatientId }); }
function saveDoctors()      { save("doctors",      { data: doctors,      next: nextDoctorId  }); }
function saveAppointments() { save("appointments", { data: appointments, next: nextApptId    }); }

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

function serveStatic(res, reqPath) {
  const filePath = reqPath === "/" ? path.join(FRONT, "index.html") : path.join(FRONT, reqPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("404 Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function seedDoctors() {
  if (doctors.length === 0) {
    doctors = [
      { id: nextDoctorId++, name: "Dr. Smith", specialization: "Cardiology",  phone: "555-0101", fees: 150.0 },
      { id: nextDoctorId++, name: "Dr. Jane",  specialization: "Pediatrics",  phone: "555-0102", fees: 100.0 },
      { id: nextDoctorId++, name: "Dr. Lee",   specialization: "Orthopedics", phone: "555-0103", fees: 200.0 },
    ];
    saveDoctors();
  }
}

async function route(req, res) {
  const { pathname } = url.parse(req.url);
  const method = req.method;
  if (method === "OPTIONS") { cors(res); res.writeHead(200); res.end(); return; }

  if (pathname === "/api/stats" && method === "GET")
    return json(res, 200, { patients: patients.length, doctors: doctors.length, appointments: appointments.length });

  if (pathname === "/api/patients") {
    if (method === "GET")  return json(res, 200, patients);
    if (method === "POST") {
      const b = await readBody(req);
      if (!b.name || !b.age) return json(res, 400, { error: "name and age required" });
      const p = { id: nextPatientId++, name: b.name, age: b.age, gender: b.gender||"", phone: b.phone||"", disease: b.disease||"", doctor: b.doctor||"" };
      patients.push(p); savePatients(); return json(res, 201, p);
    }
  }
  const pm = pathname.match(/^\/api\/patients\/(\d+)$/);
  if (pm && method === "DELETE") {
    const idx = patients.findIndex(p => p.id === parseInt(pm[1]));
    if (idx === -1) return json(res, 404, { error: "not found" });
    patients.splice(idx, 1); savePatients(); return json(res, 200, { message: "deleted" });
  }

  if (pathname === "/api/doctors") {
    if (method === "GET")  return json(res, 200, doctors);
    if (method === "POST") {
      const b = await readBody(req);
      if (!b.name || !b.specialization) return json(res, 400, { error: "name and specialization required" });
      const d = { id: nextDoctorId++, name: b.name, specialization: b.specialization, phone: b.phone||"", fees: parseFloat(b.fees)||0 };
      doctors.push(d); saveDoctors(); return json(res, 201, d);
    }
  }
  const dm = pathname.match(/^\/api\/doctors\/(\d+)$/);
  if (dm && method === "DELETE") {
    const idx = doctors.findIndex(d => d.id === parseInt(dm[1]));
    if (idx === -1) return json(res, 404, { error: "not found" });
    doctors.splice(idx, 1); saveDoctors(); return json(res, 200, { message: "deleted" });
  }

  if (pathname === "/api/appointments") {
    if (method === "GET")  return json(res, 200, appointments);
    if (method === "POST") {
      const b  = await readBody(req);
      const pi = patients.find(p => p.id === b.patientId);
      const di = doctors .find(d => d.id === b.doctorId);
      if (!pi || !di) return json(res, 400, { error: "invalid ids" });
      if (!b.date || !b.time) return json(res, 400, { error: "date and time required" });
      const a = { id: nextApptId++, patientId: pi.id, patientName: pi.name, doctorId: di.id, doctorName: di.name, date: b.date, time: b.time };
      appointments.push(a); pi.doctor = di.name; saveAppointments(); savePatients(); return json(res, 201, a);
    }
  }
  const am = pathname.match(/^\/api\/appointments\/(\d+)$/);
  if (am && method === "DELETE") {
    const idx = appointments.findIndex(a => a.id === parseInt(am[1]));
    if (idx === -1) return json(res, 404, { error: "not found" });
    appointments.splice(idx, 1); saveAppointments(); return json(res, 200, { message: "cancelled" });
  }

  serveStatic(res, pathname);
}

loadAll();
seedDoctors();
http.createServer(route).listen(PORT, () => {
  console.log("========================================");
  console.log("  Hospital Management Server (Node.js)");
  console.log("  http://localhost:" + PORT);
  console.log("========================================");
});
