const API = 'http://localhost:8080/api';

let patients = [];
let doctors = [];
let appointments = [];

/* ---------- Tabs ---------- */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') loadStats();
  });
});

/* ---------- API Helpers ---------- */
async function apiGet(path) {
  const res = await fetch(API + path);
  return res.json();
}
async function apiPost(path, data) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE' });
  return res.json();
}

/* ---------- Toast ---------- */
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------- Loaders ---------- */
async function loadStats() {
  const s = await apiGet('/stats');
  document.getElementById('stat-patients').textContent = s.patients;
  document.getElementById('stat-doctors').textContent  = s.doctors;
  document.getElementById('stat-appts').textContent    = s.appointments;
}

async function loadPatients() {
  patients = await apiGet('/patients');
  renderPatients();
}
async function loadDoctors() {
  doctors = await apiGet('/doctors');
  renderDoctors();
}
async function loadAppointments() {
  appointments = await apiGet('/appointments');
  renderAppointments();
}

/* ---------- Renderers ---------- */
function renderPatients() {
  const q = document.getElementById('patientSearch').value.toLowerCase();
  const tbody = document.querySelector('#patientsTable tbody');
  tbody.innerHTML = '';
  patients
    .filter(p => p.name.toLowerCase().includes(q))
    .forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.age}</td>
        <td>${p.gender}</td>
        <td>${p.phone}</td>
        <td>${p.disease}</td>
        <td>${p.doctor || '—'}</td>
        <td>
          <button class="btn edit" onclick="editPatient(${p.id})">Edit</button>
          <button class="btn danger" onclick="deletePatient(${p.id})">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

function renderDoctors() {
  const tbody = document.querySelector('#doctorsTable tbody');
  tbody.innerHTML = '';
  doctors.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.specialization}</td>
      <td>${d.phone}</td>
      <td>${d.fees.toFixed(2)}</td>
      <td><button class="btn danger" onclick="deleteDoctor(${d.id})">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderAppointments() {
  const tbody = document.querySelector('#apptsTable tbody');
  tbody.innerHTML = '';
  appointments.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.id}</td>
      <td>${a.patientName}</td>
      <td>${a.doctorName}</td>
      <td>${a.date}</td>
      <td>${a.time}</td>
      <td><button class="btn danger" onclick="deleteAppt(${a.id})">Cancel</button></td>`;
    tbody.appendChild(tr);
  });
}

/* ---------- Modal ---------- */
function openModal(title, html) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalForm').innerHTML = html;
  document.getElementById('modal').classList.add('active');
}
function closeModal() {
  document.getElementById('modal').classList.remove('active');
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

/* ---------- Patient Form ---------- */
function openPatientForm(p = null) {
  const doctorOptions = doctors.map(d =>
    `<option value="${d.name}" ${p && p.doctor === d.name ? 'selected' : ''}>${d.name}</option>`).join('');

  openModal(p ? 'Edit Patient' : 'Add Patient', `
    <input id="f-name"    type="text"   placeholder="Full Name" value="${p?.name || ''}" required>
    <input id="f-age"     type="number" placeholder="Age" value="${p?.age || ''}" required>
    <input id="f-gender"  type="text"   placeholder="Gender (M/F/Other)" value="${p?.gender || ''}" required>
    <input id="f-phone"   type="text"   placeholder="Phone" value="${p?.phone || ''}" required>
    <input id="f-disease" type="text"   placeholder="Disease/Complaint" value="${p?.disease || ''}" required>
    <select id="f-doctor">
      <option value="">-- Assign Doctor (optional) --</option>
      ${doctorOptions}
    </select>
    <button type="button" class="btn primary" style="width:100%" onclick="savePatient(${p?.id || 0})">
      ${p ? 'Update' : 'Save'}
    </button>
  `);
}

async function savePatient(id) {
  const data = {
    name:    document.getElementById('f-name').value.trim(),
    age:     parseInt(document.getElementById('f-age').value) || 0,
    gender:  document.getElementById('f-gender').value.trim(),
    phone:   document.getElementById('f-phone').value.trim(),
    disease: document.getElementById('f-disease').value.trim(),
    doctor:  document.getElementById('f-doctor').value
  };
  if (!data.name || !data.age) return toast('Name and Age required', true);

  if (id) {
    await apiDelete(`/patients/${id}`); // simple update = delete + recreate
  }
  await apiPost('/patients', data);
  toast(id ? 'Patient updated' : 'Patient added');
  closeModal();
  loadPatients();
  loadStats();
}

function editPatient(id) {
  const p = patients.find(x => x.id === id);
  if (p) openPatientForm(p);
}

async function deletePatient(id) {
  if (!confirm('Delete this patient?')) return;
  await apiDelete(`/patients/${id}`);
  toast('Patient deleted');
  loadPatients();
  loadStats();
}

/* ---------- Doctor Form ---------- */
function openDoctorForm() {
  openModal('Add Doctor', `
    <input id="d-name" type="text"   placeholder="Full Name" required>
    <input id="d-spec" type="text"   placeholder="Specialization" required>
    <input id="d-phone" type="text"  placeholder="Phone" required>
    <input id="d-fees" type="number" placeholder="Consultation Fees" required>
    <button type="button" class="btn primary" style="width:100%" onclick="saveDoctor()">Save</button>
  `);
}

async function saveDoctor() {
  const data = {
    name: document.getElementById('d-name').value.trim(),
    specialization: document.getElementById('d-spec').value.trim(),
    phone: document.getElementById('d-phone').value.trim(),
    fees: parseFloat(document.getElementById('d-fees').value) || 0
  };
  if (!data.name || !data.specialization) return toast('Name and Specialization required', true);
  await apiPost('/doctors', data);
  toast('Doctor added');
  closeModal();
  loadDoctors();
  loadStats();
}

async function deleteDoctor(id) {
  if (!confirm('Delete this doctor?')) return;
  await apiDelete(`/doctors/${id}`);
  toast('Doctor deleted');
  loadDoctors();
  loadStats();
}

/* ---------- Appointment Form ---------- */
function openApptForm() {
  if (!patients.length || !doctors.length) {
    return toast('Add patients and doctors first', true);
  }
  const pOpts = patients.map(p => `<option value="${p.id}">${p.name} (ID ${p.id})</option>`).join('');
  const dOpts = doctors.map(d => `<option value="${d.id}">${d.name} — ${d.specialization}</option>`).join('');

  openModal('Book Appointment', `
    <label>Patient</label>
    <select id="a-patient">${pOpts}</select>
    <label>Doctor</label>
    <select id="a-doctor">${dOpts}</select>
    <input id="a-date" type="date" required>
    <input id="a-time" type="time" required>
    <button type="button" class="btn primary" style="width:100%" onclick="saveAppt()">Book</button>
  `);
}

async function saveAppt() {
  const data = {
    patientId: parseInt(document.getElementById('a-patient').value),
    doctorId:  parseInt(document.getElementById('a-doctor').value),
    date:      document.getElementById('a-date').value,
    time:      document.getElementById('a-time').value
  };
  if (!data.date || !data.time) return toast('Date and Time required', true);
  await apiPost('/appointments', data);
  toast('Appointment booked');
  closeModal();
  loadAppointments();
  loadPatients();
  loadStats();
}

async function deleteAppt(id) {
  if (!confirm('Cancel this appointment?')) return;
  await apiDelete(`/appointments/${id}`);
  toast('Appointment cancelled');
  loadAppointments();
  loadStats();
}

/* ---------- Init ---------- */
(async function init() {
  await Promise.all([loadPatients(), loadDoctors(), loadAppointments()]);
  loadStats();
})();