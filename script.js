// MediPlus HMS — Frontend Script
const API = "http://localhost:8080/api";

let patients = [], doctors = [], appointments = [];

/* ── Tab Navigation ─────────────────────────── */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById(tab).classList.add("active");
    document.getElementById("pageTitle").textContent =
      tab.charAt(0).toUpperCase() + tab.slice(1);
    if (tab === "dashboard") loadStats();
  });
});

/* ── API Helpers ────────────────────────────── */
async function apiGet(path) {
  const res = await fetch(API + path);
  return res.json();
}
async function apiPost(path, data) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(API + path, { method: "DELETE" });
  return res.json();
}

/* ── Toast ──────────────────────────────────── */
function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

/* ── Stats ──────────────────────────────────── */
async function loadStats() {
  const s = await apiGet("/stats");
  animateCount("stat-patients", s.patients);
  animateCount("stat-doctors",  s.doctors);
  animateCount("stat-appts",    s.appointments);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  const start = parseInt(el.textContent) || 0;
  const diff  = target - start;
  const steps = 24;
  let i = 0;
  const tick = () => {
    i++;
    el.textContent = Math.round(start + diff * (i / steps));
    if (i < steps) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Loaders ────────────────────────────────── */
async function loadPatients() {
  patients = await apiGet("/patients");
  renderPatients();
}
async function loadDoctors() {
  doctors = await apiGet("/doctors");
  renderDoctors();
}
async function loadAppointments() {
  appointments = await apiGet("/appointments");
  renderAppointments();
}

/* ── Renderers ──────────────────────────────── */
function renderPatients() {
  const q = document.getElementById("patientSearch").value.toLowerCase();
  const tbody = document.querySelector("#patientsTable tbody");
  tbody.innerHTML = "";
  const filtered = patients.filter(p => p.name.toLowerCase().includes(q));

  document.getElementById("emptyPatients").style.display = filtered.length ? "none" : "block";
  document.querySelector("#patientsTable").style.display = filtered.length ? "table" : "none";

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${p.id}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.age}</td>
      <td><span class="badge-gender">${p.gender}</span></td>
      <td>${p.phone}</td>
      <td>${p.disease}</td>
      <td>${p.doctor ? `<span class="badge-doc">🩺 ${p.doctor}</span>` : "<span style='color:var(--text-muted)'>—</span>"}</td>
      <td class="action-cell">
        <button class="btn-edit"   onclick="editPatient(${p.id})">Edit</button>
        <button class="btn-delete" onclick="deletePatient(${p.id})">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderDoctors() {
  const tbody = document.querySelector("#doctorsTable tbody");
  tbody.innerHTML = "";
  document.getElementById("emptyDoctors").style.display = doctors.length ? "none" : "block";
  document.querySelector("#doctorsTable").style.display = doctors.length ? "table" : "none";

  doctors.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${d.id}</td>
      <td><strong>${d.name}</strong></td>
      <td><span class="badge-spec">${d.specialization}</span></td>
      <td>${d.phone}</td>
      <td><strong style="color:var(--amber)">₹${d.fees.toFixed(2)}</strong></td>
      <td class="action-cell">
        <button class="btn-delete" onclick="deleteDoctor(${d.id})">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderAppointments() {
  const tbody = document.querySelector("#apptsTable tbody");
  tbody.innerHTML = "";
  document.getElementById("emptyAppts").style.display = appointments.length ? "none" : "block";
  document.querySelector("#apptsTable").style.display = appointments.length ? "table" : "none";

  appointments.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${a.id}</td>
      <td><strong>${a.patientName}</strong></td>
      <td>${a.doctorName}</td>
      <td>${a.date}</td>
      <td>${a.time}</td>
      <td class="action-cell">
        <button class="btn-delete" onclick="deleteAppt(${a.id})">Cancel</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ── Modal ──────────────────────────────────── */
function openModal(title, html) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalForm").innerHTML = html;
  document.getElementById("modal").classList.add("active");
}
function closeModal() {
  document.getElementById("modal").classList.remove("active");
}
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});

/* ── Patient Form ───────────────────────────── */
function openPatientForm(p = null) {
  const doctorOptions = doctors.map(d =>
    `<option value="${d.name}" ${p && p.doctor === d.name ? "selected" : ""}>${d.name} — ${d.specialization}</option>`
  ).join("");

  openModal(p ? "Edit Patient" : "Add New Patient", `
    <label>Full Name</label>
    <input id="f-name"    type="text"   placeholder="e.g. Rajesh Kumar" value="${p?.name || ""}" required>
    <label>Age</label>
    <input id="f-age"     type="number" placeholder="e.g. 34" value="${p?.age || ""}" required>
    <label>Gender</label>
    <input id="f-gender"  type="text"   placeholder="Male / Female / Other" value="${p?.gender || ""}" required>
    <label>Phone</label>
    <input id="f-phone"   type="text"   placeholder="+91 9876543210" value="${p?.phone || ""}">
    <label>Disease / Complaint</label>
    <input id="f-disease" type="text"   placeholder="e.g. Hypertension" value="${p?.disease || ""}">
    <label>Assign Doctor (optional)</label>
    <select id="f-doctor">
      <option value="">-- Select Doctor --</option>
      ${doctorOptions}
    </select>
    <button type="button" class="form-submit" onclick="savePatient(${p?.id || 0})">
      ${p ? "Update Patient" : "Save Patient"}
    </button>
  `);
}

async function savePatient(id) {
  const data = {
    name:    document.getElementById("f-name").value.trim(),
    age:     parseInt(document.getElementById("f-age").value) || 0,
    gender:  document.getElementById("f-gender").value.trim(),
    phone:   document.getElementById("f-phone").value.trim(),
    disease: document.getElementById("f-disease").value.trim(),
    doctor:  document.getElementById("f-doctor").value
  };
  if (!data.name || !data.age) return toast("Name and Age are required", true);
  if (id) await apiDelete(`/patients/${id}`);
  await apiPost("/patients", data);
  toast(id ? "Patient updated ✓" : "Patient added ✓");
  closeModal();
  loadPatients();
  loadStats();
}

function editPatient(id) {
  const p = patients.find(x => x.id === id);
  if (p) openPatientForm(p);
}

async function deletePatient(id) {
  if (!confirm("Delete this patient record?")) return;
  await apiDelete(`/patients/${id}`);
  toast("Patient deleted");
  loadPatients();
  loadStats();
}

/* ── Doctor Form ────────────────────────────── */
function openDoctorForm() {
  openModal("Add New Doctor", `
    <label>Full Name</label>
    <input id="d-name"  type="text"   placeholder="e.g. Dr. Priya Sharma" required>
    <label>Specialization</label>
    <input id="d-spec"  type="text"   placeholder="e.g. Cardiology" required>
    <label>Phone</label>
    <input id="d-phone" type="text"   placeholder="+91 9876543210">
    <label>Consultation Fees (₹)</label>
    <input id="d-fees"  type="number" placeholder="e.g. 500" required>
    <button type="button" class="form-submit" onclick="saveDoctor()">Save Doctor</button>
  `);
}

async function saveDoctor() {
  const data = {
    name:           document.getElementById("d-name").value.trim(),
    specialization: document.getElementById("d-spec").value.trim(),
    phone:          document.getElementById("d-phone").value.trim(),
    fees:           parseFloat(document.getElementById("d-fees").value) || 0
  };
  if (!data.name || !data.specialization) return toast("Name and Specialization required", true);
  await apiPost("/doctors", data);
  toast("Doctor added ✓");
  closeModal();
  loadDoctors();
  loadStats();
}

async function deleteDoctor(id) {
  if (!confirm("Delete this doctor?")) return;
  await apiDelete(`/doctors/${id}`);
  toast("Doctor deleted");
  loadDoctors();
  loadStats();
}

/* ── Appointment Form ───────────────────────── */
function openApptForm() {
  if (!patients.length || !doctors.length) {
    return toast("Please add patients and doctors first", true);
  }
  const pOpts = patients.map(p => `<option value="${p.id}">${p.name} (ID #${p.id})</option>`).join("");
  const dOpts = doctors.map(d  => `<option value="${d.id}">${d.name} — ${d.specialization}</option>`).join("");

  openModal("Book Appointment", `
    <label>Select Patient</label>
    <select id="a-patient">${pOpts}</select>
    <label>Select Doctor</label>
    <select id="a-doctor">${dOpts}</select>
    <label>Date</label>
    <input id="a-date" type="date" required>
    <label>Time</label>
    <input id="a-time" type="time" required>
    <button type="button" class="form-submit" onclick="saveAppt()">Book Appointment</button>
  `);
}

async function saveAppt() {
  const data = {
    patientId: parseInt(document.getElementById("a-patient").value),
    doctorId:  parseInt(document.getElementById("a-doctor").value),
    date:      document.getElementById("a-date").value,
    time:      document.getElementById("a-time").value
  };
  if (!data.date || !data.time) return toast("Date and Time required", true);
  await apiPost("/appointments", data);
  toast("Appointment booked ✓");
  closeModal();
  loadAppointments();
  loadPatients();
  loadStats();
}

async function deleteAppt(id) {
  if (!confirm("Cancel this appointment?")) return;
  await apiDelete(`/appointments/${id}`);
  toast("Appointment cancelled");
  loadAppointments();
  loadStats();
}

/* ── Inline badges (CSS injected via JS for simplicity) ── */
const badgeStyle = document.createElement("style");
badgeStyle.textContent = `
  .badge-gender {
    display:inline-block; padding:3px 10px; border-radius:99px;
    font-size:12px; font-weight:600;
    background:rgba(124,109,250,.15); color:#a89cf7;
  }
  .badge-spec {
    display:inline-block; padding:3px 10px; border-radius:99px;
    font-size:12px; font-weight:600;
    background:rgba(0,212,170,.1); color:#00d4aa;
  }
  .badge-doc {
    display:inline-block; padding:3px 10px; border-radius:99px;
    font-size:12px; font-weight:600;
    background:rgba(245,158,11,.1); color:#f59e0b;
  }
`;
document.head.appendChild(badgeStyle);

/* ── Init ───────────────────────────────────── */
(async function init() {
  await Promise.all([loadPatients(), loadDoctors(), loadAppointments()]);
  loadStats();
})();
