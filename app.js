"use strict";

const $ = id => document.getElementById(id);
// La demo usa el flujo completo de los portales con transporte local, sin AWS.
const DEMO_MODE = false;

const TODAY = new Date();
let CURRENT_ESTABLISHMENT = "Hospital VIK Central";

function readDoctorSession() {
  // El login actual guarda vikUser, vikSession, vikRut y vikRole.
  // Mantener también compatibilidad con los nombres heredados rut/rol.
  function storedUser(key) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  const user = storedUser("vikUser") || storedUser("vikSession") || {};
  const storedRut = String(
    sessionStorage.getItem("vikRut") ||
    user.rut ||
    user.doctor_rut ||
    sessionStorage.getItem("rut") ||
    ""
  ).trim();
  const role = String(
    sessionStorage.getItem("vikRole") ||
    user.role ||
    user.rol ||
    sessionStorage.getItem("rol") ||
    ""
  ).trim().toLowerCase();

  const doctorRoles = ["doctor", "profesional", "medico", "médico"];
  const roleIsValid = doctorRoles.includes(role);

  return {
    rut: roleIsValid ? storedRut : "",
    role: roleIsValid ? "doctor" : role,
    user,
    valid: Boolean(storedRut && roleIsValid)
  };
}

const DOCTOR_SESSION = readDoctorSession();
let CURRENT_DOCTOR_RUT = DOCTOR_SESSION.rut;
let CURRENT_DOCTOR = {
  rut: CURRENT_DOCTOR_RUT,
  nombre: DOCTOR_SESSION.user.nombre || DOCTOR_SESSION.user.name || "",
  apellido: DOCTOR_SESSION.user.apellido || DOCTOR_SESSION.user.last_name || "",
  especialidad: DOCTOR_SESSION.user.especialidad || DOCTOR_SESSION.user.specialty || ""
};

let selectedPatient = null;
let currentConsultation = null;
let clinicalAiResult = null;
let clinicalAiLoading = false;
let currentView = "inicio";
let currentRecordTab = "resumen";
let currentMonth = new Date(
  TODAY.getFullYear(),
  TODAY.getMonth(),
  1
);
let selectedCalendarDate = new Date(TODAY);
const loadedAgendaDates = new Set();

/* =========================================================
   LIVE DATA STORE
   Los datos clínicos se cargan exclusivamente desde la API / BD.
   ========================================================= */

const DATA = {
  patients: [],
  documents: [],
  appointments: [],
  attentions: [],
  followupRequests: []
};


/* =========================================================
   HELPERS
   ========================================================= */

function doctorFullName() {
  const full = [CURRENT_DOCTOR.nombre, CURRENT_DOCTOR.apellido]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || "Profesional VIK";
}

function doctorInitials() {
  return doctorFullName()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "DR";
}

function applyDoctorIdentityToUI() {
  const name = doctorFullName();
  const specialty = CURRENT_DOCTOR.especialidad || "Profesional VIK Salud";
  const initials = doctorInitials();

  document.querySelectorAll("[data-doctor-name]").forEach(element => {
    element.textContent = name;
  });

  document.querySelectorAll("[data-doctor-specialty]").forEach(element => {
    element.textContent = specialty;
  });

  document.querySelectorAll("[data-doctor-avatar]").forEach(element => {
    element.textContent = initials;
  });

  document.querySelectorAll("[data-establishment-name]").forEach(element => {
    element.textContent = CURRENT_ESTABLISHMENT || "VIK Salud";
  });
}

function patientName(patient) {
  if (!patient) return "Paciente";
  const first = patient.first_name || patient.nombre || patient.name || "";
  const last = patient.last_name || patient.apellido || "";
  return (last && !first.toLowerCase().endsWith(last.toLowerCase()) ? `${first} ${last}` : first).trim() || "Paciente";
}

function patientRut(patient) {
  return patient?.rut || "";
}

function patientBirthDate(patient) {
  return patient?.birth_date || patient?.fecha_nacimiento || "";
}

function patientById(id) {
  return DATA.patients.find(
    p => String(p.id || p.id_paciente) === String(id)
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatMonth(value) {
  return value.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric"
  });
}

function initials(patient) {
  const name = patientName(patient).trim();

  const parts = name.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function toISODate(value) {
  if (!value) {
    return "";
  }

  // Las fechas clínicas deben compararse en hora local de Chile, no en UTC.
  // Si RDS/API ya entrega YYYY-MM-DD..., conservamos directamente ese día.
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function sameDay(a, b) {
  return toISODate(a) === toISODate(b);
}

function doctorIcon(name) {
  const icons = {
    patients: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 19c.5-3.6 2.6-5.5 5.5-5.5s5 1.9 5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15.2 14.5c2.8-.4 4.8 1.1 5.3 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8.5 12.2 2.2 2.2 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3.2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    clinic: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V6.5h14V20M8 20v-4h8v4M9 10h6M12 7v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.5v4M16 3.5v4M4 10h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    history: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 8A8 8 0 1 1 5 15.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 4v5h5M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l1.7 2H20a1 1 0 0 1 1 1v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 .5-1.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    ai: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5a3 3 0 0 1 5.2-2A3.2 3.2 0 0 1 18 7a3.4 3.4 0 0 1 1.2 6.3A3.4 3.4 0 0 1 15 18.8 3.1 3.1 0 0 1 9.6 20 3.4 3.4 0 0 1 5 16.8 3.3 3.3 0 0 1 .9-6.3A3.2 3.2 0 0 1 8 5.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 9.2h6M9.5 13h5M12 6v10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 20H3L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9v5M12 17.2h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    stethoscope: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v5a4 4 0 0 0 8 0V4M4.5 4h3M12.5 4h3M10 13v2.5a4.5 4.5 0 0 0 9 0V13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="19" cy="11" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-3.6 7-10V5.8L12 3 5 5.8V11c0 6.4 7 10 7 10Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m9.5 12 1.6 1.6 3.7-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  return icons[name] || icons.clinic;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function agendaDate(item) {
  return item?.date || item?.start || item?.fecha_hora || "";
}

function agendaStatusKey(item) {
  const raw = normalizeText(item?.status || item?.estado);
  if (["finalizada", "finalizado", "completada", "completado"].includes(raw)) return "finalizada";
  if (["cancelada", "cancelado"].includes(raw)) return "cancelada";
  if (["borrador", "en curso", "encurso", "iniciada", "iniciado"].includes(raw)) return "borrador";
  if (["programada", "programado", "pendiente"].includes(raw)) return "programada";
  return item?._agendaSource === "appointment" ? "programada" : "finalizada";
}

function agendaStatusLabel(item) {
  if (item?._dirty) return "Borrador temporal";
  return {programada:"Programada",borrador:"En curso",finalizada:"Finalizada",cancelada:"Cancelada"}[agendaStatusKey(item)] || "Atención";
}

function agendaItems() {
  const input = [
    ...(Array.isArray(DATA.appointments) ? DATA.appointments.map(item => ({...item, _agendaSource:"appointment"})) : []),
    ...(Array.isArray(DATA.attentions) ? DATA.attentions.map(item => ({...item, _agendaSource:"attention"})) : []),
    ...[...attentionDrafts.values()].map(item => ({...item, _agendaSource:"attention"}))
  ];
  const unique = new Map();
  input.forEach((item,index)=>{
    const key=String(item.id_atencion || item.id || `${agendaDate(item)}-${item.patient_id || item.id_paciente || item.rut || item.patient_name || item.patient || "patient"}-${item.reason || item.motivo || index}`);
    const previous=unique.get(key);
    if(!previous || item._agendaSource === "attention") unique.set(key,item);
  });
  return [...unique.values()].filter(item=>agendaDate(item));
}

function agendaPatient(item) {
  const id=item?.patient_id || item?.id_paciente || item?.patientId;
  if(id){ const byId=patientById(id); if(byId) return byId; }
  const rut=item?.rut || item?.patient_rut;
  if(rut){ const byRut=DATA.patients.find(patient=>patientRut(patient)===rut); if(byRut) return byRut; }
  return null;
}

function agendaPatientName(item) {
  const patient=agendaPatient(item);
  return patient ? patientName(patient) : (item?.patient_name || item?.patient || item?.title || "Paciente");
}

function agendaTime(item) {
  if(item?.time) return item.time;
  const value=agendaDate(item);
  if(!value) return "—";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
}

function agendaReason(item) { return item?.reason || item?.motivo || item?.detail || "Atención clínica"; }
function agendaSpecialty(item) { return item?.specialty || item?.especialidad || "Medicina general"; }
function agendaEstablishment(item) { return item?.establishment || item?.establecimiento || CURRENT_ESTABLISHMENT; }
function agendaDuration(item) { return item?.duration || item?.duracion_minutos || 30; }

function agendaAccessState(item) {
  // Una cita asociada NO demuestra consentimiento. Solo un estado verificado sirve.
  const explicit = normalizeText(item?.permission_status || item?.permiso_estado || item?.access_status);
  if (["aprobada", "autorizado", "autorizada", "approved"].includes(explicit)) return "autorizado";
  if (["rechazado", "rechazada", "revocado", "revocada", "expirada", "vencida", "denied"].includes(explicit)) return "bloqueado";
  return "pendiente";
}

function agendaAccessLabel(item) {
  const state=agendaAccessState(item);
  return state === "autorizado" ? "Autorización informada · verificar" : state === "bloqueado" ? "Sin acceso" : "Consentimiento no verificado";
}

function startOfToday() {
  return new Date(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()).getTime();
}

function toast(message) {
  const element = $("toast");

  if (!element) return;

  element.textContent = message;
  element.hidden = false;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.hidden = true;
  }, 3200);
}

function setPageTitle(title, subtitle = "") {
  const titleElement = $("pageTitle");
  const subtitleElement = $("pageSubtitle");

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (subtitleElement) {
    subtitleElement.textContent = subtitle;
  }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function switchView(view) {
  preserveAttention();
  if (view === "inicio") renderHome();
  if (view === "agenda") renderCalendar();
  if (view === "consulta") renderConsultationView();
  if (view === "seguimiento") renderFollowUpView();
  currentView = view;

  document.querySelectorAll(".view").forEach(section => {
    section.hidden = section.id !== `view-${view}`;
  });

  document.querySelectorAll("[data-view]").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (view === "inicio") {
    setPageTitle(
      "Mi jornada clínica",
      "Tus pacientes, citas y atenciones de hoy."
    );
  }

  if (view === "pacientes") {
    setPageTitle(
      "Pacientes",
      "Busca y revisa las fichas clínicas de tus pacientes."
    );
  }

  if (view === "documentos") {
    setPageTitle(
      "Documentos",
      "Gestiona los documentos clínicos de tus pacientes."
    );
  }

  if (view === "agenda") {
    setPageTitle(
      "Agenda",
      "Revisa las citas del día y abre cada atención desde su contexto clínico."
    );
  }

  if (view === "consulta") {
    setPageTitle(
      "Consulta en curso",
      "Registro clínico de la atención actual, con contexto del paciente en tiempo real."
    );
  }

  if (view === "seguimiento") {
    setPageTitle(
      "Seguimiento clínico",
      "Resultado de la consulta y próximos pasos del paciente."
    );
  }

  if (view === "record") {
    setPageTitle(
      "Ficha clínica",
      selectedPatient
        ? `Resumen, atención actual y documentos de ${patientName(selectedPatient)}`
        : "Paciente"
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

/* =========================================================
   HOME
   ========================================================= */


function documentExpiryDate(document) {
  return document?.expiration_date || document?.fecha_vencimiento || document?.expiry_date || "";
}

function documentState(document) {
  const explicit = String(document?.status || document?.estado || "").toUpperCase();
  if (explicit) return explicit;
  const expiry = documentExpiryDate(document);
  if (expiry) {
    const end = new Date(`${toISODate(expiry)}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && end < new Date()) return "VENCIDO";
  }
  return "VIGENTE";
}

function documentsNearExpiry(days = 30) {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return DATA.patients.flatMap(patient => (Array.isArray(patient.documents) ? patient.documents : []).map(document => ({patient, document})))
    .filter(({document}) => {
      const raw = documentExpiryDate(document);
      if (!raw) return false;
      const date = new Date(`${toISODate(raw)}T23:59:59`);
      return !Number.isNaN(date.getTime()) && date >= TODAY && date <= limit && !["ANULADO","VENCIDO"].includes(documentState(document));
    })
    .sort((a,b) => new Date(documentExpiryDate(a.document)) - new Date(documentExpiryDate(b.document)));
}

function renderHome() {
  const container = $("homeContent");
  if (!container) return;

  const patients = Array.isArray(DATA.patients) ? DATA.patients : [];
  const todayAgenda = agendaItems()
    .filter(item => agendaStatusKey(item) !== "cancelada" && sameDay(agendaDate(item), TODAY))
    .sort((a, b) => new Date(agendaDate(a)) - new Date(agendaDate(b)));

  const upcomingAgenda = agendaItems()
    .filter(item => {
      const date = new Date(agendaDate(item));
      return agendaStatusKey(item) !== "cancelada" && !Number.isNaN(date.getTime()) && date >= TODAY;
    })
    .sort((a, b) => new Date(agendaDate(a)) - new Date(agendaDate(b)));

  const pendingToday = todayAgenda.filter(item => agendaStatusKey(item) === "programada");
  const inProgressToday = todayAgenda.filter(item => agendaStatusKey(item) === "borrador");
  const finishedToday = todayAgenda.filter(item => agendaStatusKey(item) === "finalizada");
  const nextAttention = upcomingAgenda.find(item => ["programada", "borrador"].includes(agendaStatusKey(item))) || null;
  const expiringDocuments = documentsNearExpiry(30);

  const rows = upcomingAgenda.length
    ? upcomingAgenda.map(item => {
        const patient = agendaPatient(item);
        const patientId = patient ? (patient.id || patient.id_paciente) : (item.patient_id || item.id_paciente || "");
        const status = agendaStatusKey(item);
        const action = status === "finalizada" ? "Abrir ficha" : status === "borrador" ? "Continuar" : "Iniciar atención";
        return `
          <tr>
            <td class="dashboard-time-cell"><strong>${escapeHTML(formatDate(agendaDate(item)))}</strong><small>${escapeHTML(agendaTime(item))}</small></td>
            <td><div class="dashboard-patient-cell"><span class="avatar dashboard-avatar">${escapeHTML(patient ? initials(patient) : (agendaPatientName(item)[0] || "P").toUpperCase())}</span><div><strong>${escapeHTML(agendaPatientName(item))}</strong><small>${escapeHTML(patient ? patientRut(patient) : (item.rut || item.patient_rut || "RUT no disponible"))}</small></div></div></td>
            <td><div class="dashboard-reason-cell"><strong>${escapeHTML(agendaReason(item))}</strong><small>${escapeHTML(agendaSpecialty(item))}</small></div></td>
            <td><span class="doctor-status-chip status-${status}">${escapeHTML(agendaStatusLabel(item))}</span></td>
            <td class="dashboard-action-cell">${patientId ? `<div class="dashboard-row-actions">${status !== "finalizada" ? `<button class="secondary-button compact-button" type="button" data-prepare-attention="${escapeHTML(item.id_atencion || item.id || "")}">Preparar</button>` : ""}${status === "finalizada" ? `<button class="secondary-button compact-button" type="button" data-open-patient="${escapeHTML(patientId)}">${action}</button>` : `<button class="primary-button compact-button" type="button" data-start-attention="${escapeHTML(item.id_atencion || item.id || "")}">${action}</button>`}</div>` : `<button class="secondary-button compact-button" type="button" data-agenda-action="solicitar-acceso">Validar acceso</button>`}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="5"><div class="dashboard-empty-state"><span class="dashboard-empty-icon">${doctorIcon("calendar")}</span><div><strong>No hay citas próximas.</strong><p class="muted">Cuando existan atenciones futuras aparecerán aquí ordenadas por fecha y hora.</p></div></div></td></tr>`;

  const nextPatient = nextAttention ? agendaPatient(nextAttention) : null;

  container.innerHTML = `
    <section class="doctor-dashboard-shell">
      <section class="panel dashboard-patient-access">
        <div class="dashboard-access-copy">
          <p class="eyebrow">PACIENTE</p>
          <h2>Buscar ficha clínica</h2>
          <p class="muted">Accede por RUT o nombre. Si el paciente aún no existe en VIK, crea su registro y ficha inicial.</p>
        </div>
        <form id="dashboardPatientSearchForm" class="dashboard-patient-search">
          <input id="dashboardPatientSearch" class="search-input" type="search" placeholder="RUT o nombre del paciente" aria-label="Buscar paciente por RUT o nombre">
          <button class="primary-button" type="submit">Buscar paciente</button>
          <button class="secondary-button" type="button" data-register-patient>Registrar paciente</button>
        </form>
        <div id="dashboardPatientSearchResult" class="dashboard-search-result" hidden></div>
      </section>

      <section class="doctor-dashboard-kpis" aria-label="Resumen de jornada">
        <article class="panel doctor-kpi-card"><span>Programadas hoy</span><strong>${pendingToday.length}</strong></article>
        <article class="panel doctor-kpi-card"><span>En curso</span><strong>${inProgressToday.length}</strong></article>
        <article class="panel doctor-kpi-card"><span>Finalizadas hoy</span><strong>${finishedToday.length}</strong></article>
        <article class="panel doctor-kpi-card"><span>Documentos por vencer</span><strong>${expiringDocuments.length}</strong></article>
      </section>

      <div class="dashboard-layout">
        <section class="panel doctor-main-table-card">
          <div class="doctor-table-header">
            <div><p class="eyebrow">PRÓXIMAS CITAS</p><h3>Agenda próxima</h3></div>
            <button class="secondary-button compact-button" type="button" data-open-view="agenda">Ver agenda completa</button>
          </div>
          <div class="doctor-table-wrap">
            <table class="dashboard-table">
              <thead><tr><th>Fecha / hora</th><th>Paciente</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>

        <aside class="dashboard-side">
          <section class="panel next-attention-card">
            <p class="eyebrow">PRÓXIMA ATENCIÓN</p>
            ${nextAttention ? `
              <h3>${escapeHTML(agendaPatientName(nextAttention))}</h3>
              <p><strong>${escapeHTML(agendaTime(nextAttention))}</strong> · ${escapeHTML(agendaReason(nextAttention))}</p>
              <p class="muted">${escapeHTML(agendaSpecialty(nextAttention))}</p>
              ${nextPatient || nextAttention.id_paciente || nextAttention.patient_id ? `<button class="primary-button" type="button" data-start-attention="${escapeHTML(nextAttention.id_atencion || nextAttention.id || "")}">${agendaStatusKey(nextAttention) === "borrador" ? "Continuar atención" : "Iniciar atención"}</button>` : `<button class="secondary-button" type="button" data-agenda-action="solicitar-acceso">Validar acceso</button>`}
            ` : `<h3>Sin citas pendientes</h3><p class="muted">No hay atenciones programadas o en curso próximas.</p>`}
          </section>

          <section class="panel next-attention-card">
            <p class="eyebrow">VIGENCIAS</p>
            <h3>Documentos próximos a vencer</h3>
            ${expiringDocuments.length ? `<div class="expiry-list">${expiringDocuments.slice(0,4).map(({patient,document}) => `<div class="expiry-item"><div><strong>${escapeHTML(document.name || document.type || "Documento clínico")}</strong><small>${escapeHTML(patientName(patient))}</small></div><span>${escapeHTML(formatDate(documentExpiryDate(document)))}</span></div>`).join("")}</div><button class="secondary-button" type="button" data-open-view="documentos">Ver documentos</button>` : `<p class="muted">No hay documentos con vencimiento dentro de los próximos 30 días.</p>`}
          </section>
        </aside>
      </div>
    </section>`;

  container.querySelectorAll("[data-open-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.openView)));

  $("dashboardPatientSearchForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const query = $("dashboardPatientSearch")?.value.trim() || "";
    const result = $("dashboardPatientSearchResult");
    if (!query || !result) return;

    result.hidden = false;
    result.innerHTML = `<div class="searching-state">Buscando paciente…</div>`;

    let patient = DATA.patients.find(item => [patientName(item), patientRut(item)].join(" ").toLowerCase().includes(query.toLowerCase())) || null;

    if (!patient && /[0-9kK.-]{7,}/.test(query)) {
      try {
        const loaded = await loadPatientFromAPI(query);
        const existingIndex = DATA.patients.findIndex(item => patientRut(item) === loaded.rut);
        if (existingIndex >= 0) DATA.patients[existingIndex] = {...DATA.patients[existingIndex], ...loaded};
        else DATA.patients.push(loaded);
        patient = loaded;
        renderPatients();
      } catch (_) {
        result.innerHTML = '<p role="alert">No fue posible verificar el paciente. Revisa la conexión y vuelve a intentar.</p>';
        return;
      }
    }

    if (patient) {
      result.innerHTML = `<div class="dashboard-found-patient"><div><strong>${escapeHTML(patientName(patient))}</strong><span>RUT ${escapeHTML(patientRut(patient) || "—")}</span></div><button class="primary-button" type="button" data-open-patient="${escapeHTML(patient.id || patient.id_paciente)}">Abrir ficha clínica</button></div>`;
    } else {
      result.innerHTML = `<div class="dashboard-not-found"><div><strong>Paciente no encontrado</strong><span>No existe una ficha disponible para “${escapeHTML(query)}”.</span></div><button class="primary-button" type="button" data-register-patient data-prefill-rut="${escapeHTML(query)}">Registrar paciente</button></div>`;
    }
  });
}

/* =========================================================
   PATIENTS
   ========================================================= */

function renderPatients() {
  const container = $("patientsContent");
  if (!container) return;

  container.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">PACIENTES</p>
        <h2>Fichas clínicas</h2>
        <p class="muted">Busca por RUT o nombre. Un paciente sin ficha puede registrarse aquí antes de iniciar su primera atención.</p>
      </div>
      <div class="section-actions"><button class="primary-button" type="button" data-register-patient>Registrar nuevo paciente</button></div>
    </div>

    <div class="search-row">
      <input id="patientSearch" class="search-input" type="search" placeholder="Buscar por nombre o RUT..." aria-label="Buscar paciente">
    </div>
    <div id="patientList" class="patient-list">${renderPatientList(DATA.patients)}</div>`;

  $("patientSearch")?.addEventListener("input", () => {
    const query = $("patientSearch").value.trim().toLowerCase();
    const filtered = DATA.patients.filter(patient => [patientName(patient), patientRut(patient)].join(" ").toLowerCase().includes(query));
    $("patientList").innerHTML = renderPatientList(filtered, query);
  });
}

function renderPatientList(patients, query = "") {
  if (!patients.length) {
    return `<div class="panel empty-state illustrated-empty"><span class="empty-icon" aria-hidden="true">${doctorIcon("patients")}</span><div class="empty-state-content"><h3>No encontramos una ficha clínica</h3><p class="muted">${query ? `No hay coincidencias para “${escapeHTML(query)}”. Puedes crear un registro nuevo si corresponde.` : "Aún no hay pacientes cargados en esta sesión."}</p><button class="primary-button" type="button" data-register-patient data-prefill-rut="${escapeHTML(query)}">Registrar paciente</button></div></div>`;
  }

  return `<div class="doctor-directory-grid">${patients.map(patient => `
    <article class="panel doctor-directory-card">
      <div class="doctor-directory-header">
        <div class="doctor-patient-id"><span class="avatar directory-avatar">${escapeHTML(initials(patient))}</span><div><h3>${escapeHTML(patientName(patient))}</h3><p>${escapeHTML(patientRut(patient) || "RUT pendiente")}</p></div></div>
        <span class="directory-status">${patient._localDraft ? "Ficha inicial" : "Ficha disponible"}</span>
      </div>
      <div class="doctor-directory-details">
        <div><span>Fecha de nacimiento</span><strong>${escapeHTML(formatDate(patientBirthDate(patient)))}</strong></div>
        <div><span>Grupo sanguíneo</span><strong>${escapeHTML(patient.blood_type || patient.grupo_sanguineo || "—")}</strong></div>
        <div><span>Contacto</span><strong>${escapeHTML(patient.phone || patient.telefono || patient.email || patient.correo || "—")}</strong></div>
      </div>
      <div class="doctor-directory-actions"><button class="primary-button" type="button" data-open-patient="${escapeHTML(patient.id || patient.id_paciente)}">Abrir ficha clínica</button></div>
    </article>`).join("")}</div>`;
}

/* =========================================================
   DOCUMENTS
   ========================================================= */

function renderDocuments() {
  const container = $("view-documentos");
  if (!container) return;

  const patientsWithDocuments = DATA.patients
    .map(patient => ({ ...patient, documents: (patient.documents || []).filter(document => !DEMO_MODE || document._demoCreated) }))
    .filter(patient => patient.documents.length);
  const totalDocuments = patientsWithDocuments.reduce((sum, patient) => sum + patient.documents.length, 0);

  container.innerHTML = `
    <div class="doctor-section-hero documents-hero">
      <div class="section-hero-icon" aria-hidden="true">${doctorIcon("folder")}</div>
      <div><p class="eyebrow">ARCHIVO CLÍNICO</p><h2>Documentos de pacientes</h2><p class="muted">Recetas, órdenes, derivaciones, indicaciones e informes asociados a una atención clínica.</p></div>
      <span class="section-count-pill">${totalDocuments} ${totalDocuments === 1 ? "documento" : "documentos"}</span>
    </div>

    <div class="documents-table doctor-documents-grid">
      ${patientsWithDocuments.length ? patientsWithDocuments.map(patient => `
        <article class="panel document-group">
          <div class="doctor-directory-header">
            <div class="doctor-patient-id"><span class="avatar">${escapeHTML(initials(patient))}</span><div><h3>${escapeHTML(patientName(patient))}</h3><p>${escapeHTML(patientRut(patient))}</p></div></div>
            <button class="secondary-button compact-button" type="button" data-open-patient="${escapeHTML(patient.id || patient.id_paciente)}">Abrir ficha</button>
          </div>
          <div class="document-list">
            ${patient.documents.map(document => {
              const state = documentState(document);
              const expiry = documentExpiryDate(document);
              return `<div class="document-item document-item-expanded"><span class="document-item-icon" aria-hidden="true">${doctorIcon("folder")}</span><div class="document-main"><strong>${escapeHTML(document.name || "Documento clínico")}</strong><small>${escapeHTML(document.type || document.tipo_recurso || "Documento")} · Emitido ${escapeHTML(formatDate(document.date || document.fecha_emision || document.fecha_registro))}</small>${expiry ? `<small>Vencimiento: ${escapeHTML(formatDate(expiry))}</small>` : `<small>Sin fecha de vencimiento registrada</small>`}</div><span class="document-state state-${state.toLowerCase()}">${escapeHTML(state)}</span></div>`;
            }).join("")}
          </div>
        </article>`).join("") : `<div class="panel empty-state illustrated-empty wide-empty"><span class="empty-icon" aria-hidden="true">${doctorIcon("folder")}</span><div><h3>No hay documentos disponibles</h3><p class="muted">Los documentos se crean dentro de una atención y luego quedan disponibles en el archivo clínico.</p></div></div>`}
    </div>`;
}

/* Solicitudes de acceso: estados verificados y acciones explícitas.
 * Ningún clic de la interfaz constituye una autorización de seguridad.
 */
function clinicalAccessDescription(status) {
  return ({
    SIN_SOLICITUD: "Todavía no existe una solicitud de este profesional para el paciente.",
    PENDIENTE: "Solicitud pendiente. Debe responder el paciente desde su portal.",
    APROBADA: "Aprobada temporalmente. La Lambda debe validar esta vigencia al consultar recursos.",
    RECHAZADA: "La solicitud fue rechazada. Puedes solicitar un nuevo acceso.",
    REVOCADA: "El acceso fue revocado por el paciente. Puedes solicitar uno nuevo.",
    EXPIRADA: "La autorización ya expiró. Solicita una nueva autorización."
  })[status] || "El acceso no pudo confirmarse.";
}

function showClinicalAccessDialog(rut, result = { estado_efectivo: "SIN_SOLICITUD" }) {
  const modal = $("clinicalAccessModal");
  if (!modal) return;
  const status = normalizeClinicalAccessStatus(result);
  modal.dataset.patientRut = rut;
  $("clinicalAccessStatus").textContent = status.replaceAll("_", " ");
  $("clinicalAccessExplanation").textContent = clinicalAccessDescription(status);
  const until = $("clinicalAccessExpiry");
  const request = $("clinicalAccessRequest");
  until.textContent = status === "APROBADA" ? `Válido hasta: ${formatDate(result.fecha_expiracion)}` : "";
  request.hidden = ["PENDIENTE", "APROBADA"].includes(status);
  request.disabled = false;
  if (!modal.open && typeof modal.showModal === "function") modal.showModal();
}

async function viewClinicalAccessStatus(rut) {
  if (DEMO_MODE) { toast("En modo demostración no se envían solicitudes reales."); return; }
  if (!rut) { toast("Selecciona un paciente con RUT para consultar el acceso."); return; }
  try {
    showClinicalAccessDialog(rut, await inspectClinicalAccessFromAPI(rut));
  } catch (error) {
    toast(error?.message || "No se pudo consultar el consentimiento.");
  }
}

/* =========================================================
   RECORD
   ========================================================= */

async function openRecord(patient) {
  if (!patient) return;

  const changingPatient = selectedPatient && String(selectedPatient.id || selectedPatient.id_paciente) !== String(patient.id || patient.id_paciente);
  if (changingPatient && !canChangeAttention("")) return;
  preserveAttention();

  const rut = patientRut(patient);
  if (!DEMO_MODE) {
    try { await requireClinicalAccessFromAPI(rut); }
    catch (error) { if (error.code !== "VIK_ACCESS_REQUIRED") toast(error.message || "No se pudo verificar el acceso."); return; }
  }

  /* Refrescamos la ficha desde RDS después de crear o abrir el paciente. */
  if (rut && !patient._localDraft) {
    toast("Cargando ficha clínica...");

    try {
      const realPatient = await loadPatientFromAPI(rut);

      const index = DATA.patients.findIndex(
        item => patientRut(item) === rut
      );

      if (index >= 0) {
        DATA.patients[index] = {
          ...DATA.patients[index],
          ...realPatient,
          documents: [...realPatient.documents, ...(DATA.patients[index].documents || []).filter(doc => doc._localDraft)]
        };

        patient = DATA.patients[index];
      } else {
        DATA.patients.push(realPatient);
        patient = realPatient;
      }

      toast("Ficha ficticia cargada desde este navegador.");
    } catch (error) {
      console.error("Error cargando ficha:", error);
      toast(`No se pudo cargar la ficha: ${error.message}`);
      return;
    }
  }

  if (changingPatient) { currentConsultation = null; clinicalAiResult = null; }
  selectedPatient = patient;
  currentRecordTab = "resumen";

  switchView("record");

  renderRecord();

  if ($("addAttentionBtn")) $("addAttentionBtn").textContent = currentConsultation ? "Retomar atención" : "Iniciar atención";

  const recordName = $("recordName");
  const recordMeta = $("recordMeta");

  if (recordName) {
    recordName.textContent = patientName(patient);
  }

  if (recordMeta) {
    recordMeta.textContent = [
      patientRut(patient),
      patient.blood_type || patient.grupo_sanguineo,
      `ID VIK ${patient.id || patient.id_paciente || "—"}`
    ]
      .filter(Boolean)
      .join(" · ");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   RECORD RENDERING
   ========================================================= */

function renderRecord() {
  if (!selectedPatient) return;

  const patient = selectedPatient;

  const recordName = $("recordName");
  const recordMeta = $("recordMeta");

  if (recordName) {
    recordName.textContent = patientName(patient);
  }

  if (recordMeta) {
    recordMeta.textContent = [
      patientRut(patient),
      patient.blood_type || patient.grupo_sanguineo,
      `ID VIK ${patient.id || patient.id_paciente || "—"}`
    ]
      .filter(Boolean)
      .join(" · ");
  }

  renderRecordClinicalStrip();
  renderRecordAlerts();
  renderRecordIdentity();
  renderRecordCritical();
  renderRecordAllergies();
  renderRecordConditions();
  renderRecordMedications();
  renderRecordProviders();
  renderRecordTimeline();
  renderRecordPersonalHistory();
  renderRecordFamilyHistory();
  renderRecordObservations();
  renderRecordDocuments();
  renderRecordDecisions();
  renderRecordPreferences();
  renderRecordConsents();
  renderRecordSafeMed();

  updateRecordTabs();
}

function updateRecordTabs() {
  document.querySelectorAll("[data-record-tab]").forEach(tab => {
    const active = tab.dataset.recordTab === currentRecordTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll(".record-tab-panel").forEach(panel => {
    const panelName = panel.dataset.recordSection || panel.id.replace("recordTab-", "");
    panel.hidden = panelName !== currentRecordTab;
  });
}

function renderRecordClinicalStrip() {
  const container = $("recordClinicalStrip");

  if (!container || !selectedPatient) return;

  const patient = selectedPatient;
  const attentions = Array.isArray(patient.attentions) ? patient.attentions : [];
  const latest = attentions
    .slice()
    .sort((a, b) => new Date(b.date || b.fecha_hora || 0) - new Date(a.date || a.fecha_hora || 0))[0];

  container.innerHTML = `
    <article class="clinical-item tone-blood">
      <span class="clinical-item-icon" aria-hidden="true">${doctorIcon("clinic")}</span>
      <div><small>Grupo sanguíneo</small><strong>${escapeHTML(patient.blood_type || patient.grupo_sanguineo || "—")}</strong></div>
    </article>
    <article class="clinical-item tone-allergy">
      <span class="clinical-item-icon" aria-hidden="true">!</span>
      <div><small>Alergias registradas</small><strong>${patient.allergies?.length || 0}</strong></div>
    </article>
    <article class="clinical-item tone-medication">
      <span class="clinical-item-icon" aria-hidden="true">Rx</span>
      <div><small>Medicamentos activos</small><strong>${patient.medications?.length || 0}</strong></div>
    </article>
    <article class="clinical-item tone-history">
      <span class="clinical-item-icon" aria-hidden="true">${doctorIcon("history")}</span>
      <div><small>Última atención</small><strong>${latest ? escapeHTML(formatDate(latest.date || latest.fecha_hora)) : "Sin registros"}</strong></div>
    </article>
  `;
}

function renderRecordAlerts() {
  const container = $("recordAlerts");

  if (!container || !selectedPatient) return;

  const allergies = selectedPatient.allergies || [];

  if (!allergies.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="record-alert clinical-caution">
      <span class="record-alert-icon" aria-hidden="true">!</span>
      <div>
        <strong>Revisar alergias antes de indicar tratamiento</strong>
        <p>${escapeHTML(allergies.join(", "))}</p>
      </div>
    </div>
  `;
}

function renderRecordSafeMed() {
  const container = $("recordSafeMedText");

  if (!container || !selectedPatient) return;

  const allergies = selectedPatient.allergies || [];
  const medications = selectedPatient.medications || [];

  if (allergies.length || medications.length) {
    container.textContent = `La ficha contiene ${allergies.length} alergia(s) y ${medications.length} medicamento(s) activo(s). Estos datos se usarán como contexto de seguridad durante la atención. La IA entrega recomendaciones de apoyo y nunca completa el diagnóstico profesional.`;
    return;
  }

  container.textContent = "No hay alergias ni medicamentos registrados para una revisión de seguridad. El apoyo de IA se ejecuta únicamente dentro de una atención activa y no emite diagnósticos.";
}

function renderRecordIdentity() {
  const container = $("recordIdentity");

  if (!container || !selectedPatient) return;

  const patient = selectedPatient;

  container.innerHTML = `
    <div class="detail-grid">
      <div>
        <span>Nombre</span>
        <strong>${escapeHTML(patientName(patient))}</strong>
      </div>

      <div>
        <span>RUT</span>
        <strong>${escapeHTML(patientRut(patient))}</strong>
      </div>

      <div>
        <span>Fecha de nacimiento</span>
        <strong>${escapeHTML(formatDate(patientBirthDate(patient)))}</strong>
      </div>

      <div>
        <span>Sexo</span>
        <strong>${escapeHTML(patient.sex || patient.sexo || "—")}</strong>
      </div>

      <div>
        <span>Nacionalidad</span>
        <strong>${escapeHTML(patient.nationality || patient.nacionalidad || "—")}</strong>
      </div>

      <div>
        <span>Grupo sanguíneo</span>
        <strong>${escapeHTML(patient.blood_type || patient.grupo_sanguineo || "—")}</strong>
      </div>

      <div>
        <span>Teléfono</span>
        <strong>${escapeHTML(patient.phone || patient.telefono || "—")}</strong>
      </div>

      <div>
        <span>Correo</span>
        <strong>${escapeHTML(patient.email || patient.correo || "—")}</strong>
      </div>
    </div>
  `;
}

function renderRecordCritical() {
  const container = $("recordCritical");

  if (!container || !selectedPatient) return;

  const patient = selectedPatient;

  container.innerHTML = `
    <div class="critical-grid">
      <div class="critical-item">
        <span>Alergias</span>
        <strong>
          ${
            patient.allergies?.length
              ? escapeHTML(patient.allergies.join(", "))
              : "Sin registros"
          }
        </strong>
      </div>

      <div class="critical-item">
        <span>Condiciones</span>
        <strong>
          ${
            patient.conditions?.length
              ? escapeHTML(patient.conditions.join(", "))
              : "Sin registros"
          }
        </strong>
      </div>

      <div class="critical-item">
        <span>Medicamentos</span>
        <strong>
          ${
            patient.medications?.length
              ? escapeHTML(patient.medications.join(", "))
              : "Sin registros"
          }
        </strong>
      </div>
    </div>
  `;
}

function renderRecordAllergies() {
  const container = $("recordAllergies");

  if (!container || !selectedPatient) return;

  const values = selectedPatient.allergies || [];

  container.innerHTML = values.length
    ? values.map(value => `
        <div class="tag danger">${escapeHTML(value)}</div>
      `).join("")
    : `<p class="muted">Sin alergias registradas.</p>`;
}

function renderRecordConditions() {
  const container = $("recordConditions");

  if (!container || !selectedPatient) return;

  const values = selectedPatient.conditions || [];

  container.innerHTML = values.length
    ? values.map(value => `
        <div class="tag">${escapeHTML(value)}</div>
      `).join("")
    : `<p class="muted">Sin condiciones registradas.</p>`;
}

function renderRecordMedications() {
  const container = $("recordMedications");

  if (!container || !selectedPatient) return;

  const values = selectedPatient.medications || [];

  container.innerHTML = values.length
    ? values.map(value => `
        <div class="list-item">
          <strong>${escapeHTML(value)}</strong>
        </div>
      `).join("")
    : `<p class="muted">Sin medicamentos registrados.</p>`;
}

function renderRecordProviders() {
  const container = $("recordProviders");

  if (!container || !selectedPatient) return;

  const providers = selectedPatient.providers || [];

  container.innerHTML = providers.length
    ? providers.map(provider => `
        <div class="list-item">
          <strong>${escapeHTML(provider.name || "Profesional")}</strong>
          <span>${escapeHTML(provider.specialty || "")}</span>
        </div>
      `).join("")
    : `<p class="muted">Sin profesionales registrados.</p>`;
}

function renderRecordTimeline() {
  const container = $("recordTimeline");
  if (!container || !selectedPatient) return;

  const attentions = (selectedPatient.attentions || [])
    .slice()
    .sort((a,b)=>new Date(b.date || b.fecha_hora || 0)-new Date(a.date || a.fecha_hora || 0));

  const today = attentions.filter(attention => sameDay(attention.date || attention.fecha_hora, TODAY));
  const attentionToday = today.find(attention => ["programada","borrador"].includes(agendaStatusKey(attention))) || today[0] || null;
  const history = attentionToday ? attentions.filter(attention => attention !== attentionToday) : attentions;

  container.innerHTML = `
    <section class="current-attention-card">
      <div class="current-attention-head">
        <div>
          <p class="eyebrow">Atención actual</p>
          <h3>${attentionToday ? escapeHTML(attentionToday.reason || attentionToday.motivo || "Atención clínica") : "Atención por iniciar"}</h3>
          <p class="muted">${attentionToday ? `${escapeHTML(agendaStatusLabel(attentionToday))} · ${escapeHTML(attentionToday.specialty || attentionToday.especialidad || "Atención clínica")}` : "Abre una cita desde la agenda y registra la consulta cuando corresponda."}</p>
        </div>
        <button class="primary-button" type="button" id="timelineAddAttentionBtn">Registrar atención</button>
      </div>

      <div class="attention-work-grid attention-work-grid-v5">
        <article><span>Motivo de consulta</span><strong>${escapeHTML(attentionToday?.reason || attentionToday?.motivo || "Por registrar durante la consulta.")}</strong></article>
        <article><span>Resumen clínico</span><strong>${escapeHTML(attentionToday?.notes || attentionToday?.notas || "Aún no se ha registrado un resumen clínico.")}</strong></article>
        <article><span>Diagnóstico</span><strong>${escapeHTML(attentionToday?.diagnosis || attentionToday?.diagnostico || "Por completar en la atención.")}</strong></article>
        <article><span>Indicaciones</span><strong>${escapeHTML(attentionToday?.instructions || attentionToday?.indicaciones || "Por completar en la atención.")}</strong></article>
        <article><span>Observaciones</span><strong>${escapeHTML(attentionToday?.observations || attentionToday?.observaciones || "Sin observaciones registradas.")}</strong></article>
        <article class="attention-document-action"><span>Documentación</span><strong>Receta, examen o informe asociados a esta atención.</strong><button class="secondary-button compact-button" type="button" data-record-jump="documentos">Ir a documentos</button></article>
      </div>
    </section>

    <section class="timeline-history-block">
      <div class="section-heading compact"><div><p class="eyebrow">Historial clínico</p><h2>Atenciones anteriores</h2></div></div>
      ${history.length ? `<div class="timeline-list-lite">${history.map(attention => `
        <article class="timeline-item-lite">
          <div class="timeline-item-date">${escapeHTML(formatDate(attention.date || attention.fecha_hora))}</div>
          <div class="timeline-item-body">
            <div class="timeline-row-title"><h3>${escapeHTML(attention.reason || attention.motivo || "Atención clínica")}</h3><span class="doctor-status-chip status-${agendaStatusKey(attention)}">${escapeHTML(agendaStatusLabel(attention))}</span></div>
            <p>${escapeHTML(attention.specialty || attention.especialidad || "Especialidad no indicada")}</p>
            ${attention.notes || attention.notas ? `<div class="clinical-note">${escapeHTML(attention.notes || attention.notas)}</div>` : ""}
            ${attention.professional ? `<small>Profesional: ${escapeHTML(attention.professional)}</small>` : ""}
            ${attention.establishment ? `<small>Establecimiento: ${escapeHTML(attention.establishment)}</small>` : ""}
          </div>
        </article>`).join("")}</div>` : `<div class="empty-inline-state compact-empty-state"><strong>Sin atenciones anteriores.</strong><p class="muted">El historial aparecerá aquí cuando existan registros previos.</p></div>`}
    </section>
  `;

  const helperButton = $("timelineAddAttentionBtn");
  if (helperButton) helperButton.addEventListener("click",()=>$("addAttentionBtn")?.click());

  container.querySelectorAll("[data-record-jump]").forEach(button=>{
    button.addEventListener("click",()=>{
      currentRecordTab=button.dataset.recordJump;
      updateRecordTabs();
      document.querySelectorAll("[data-record-section]").forEach(section=>{
        section.hidden=section.dataset.recordSection!==currentRecordTab;
      });
    });
  });
}

function renderRecordPersonalHistory() {
  renderSimpleList(
    $("recordPersonalHistory"),
    selectedPatient?.personalHistory,
    "Sin antecedentes personales registrados."
  );
}

function renderRecordFamilyHistory() {
  renderSimpleList(
    $("recordFamilyHistory"),
    selectedPatient?.familyHistory,
    "Sin antecedentes familiares registrados."
  );
}

function renderRecordObservations() {
  renderSimpleList(
    $("recordObservations"),
    selectedPatient?.observations,
    "Sin observaciones registradas."
  );
}

function renderRecordDecisions() {
  renderSimpleList(
    $("recordDecisions"),
    selectedPatient?.decisions,
    "Sin decisiones clínicas registradas."
  );
}

function renderRecordPreferences() {
  renderSimpleList(
    $("recordPreferences"),
    selectedPatient?.preferences,
    "Sin preferencias registradas."
  );
}

function renderRecordConsents() {
  renderSimpleList(
    $("recordConsents"),
    selectedPatient?.consents,
    "Sin consentimientos registrados."
  );
}

function renderSimpleList(container, values, emptyMessage) {
  if (!container) return;

  const items = Array.isArray(values) ? values : [];

  container.innerHTML = items.length
    ? items.map(value => `
        <div class="list-item">
          ${escapeHTML(value)}
        </div>
      `).join("")
    : `<p class="muted">${escapeHTML(emptyMessage)}</p>`;
}

function renderRecordDocuments() {
  const container = $("recordDocuments");

  if (!container || !selectedPatient) return;

  const documents = (selectedPatient.documents || []).filter(document => !DEMO_MODE || document._demoCreated);

  container.innerHTML = documents.length
    ? documents.map(document => `
        <div class="document-item">
          <div>
            <strong>${escapeHTML(document.name || "Documento")}</strong>
            <small>${escapeHTML(formatDate(document.date))}</small>
          </div>
          <button type="button" class="secondary-button compact-button" data-open-document="${escapeHTML(document.id_documento || document.id || "")}">Ver documento</button>
        </div>
      `).join("")
    : `<p class="muted">No hay documentos registrados.</p>`;

  container.querySelectorAll("[data-open-document]").forEach(button => {
    button.addEventListener("click", () => {
      const document = documents.find(item => String(item.id_documento || item.id || "") === button.dataset.openDocument);
      if (!document) return;
      if (DEMO_MODE || document._localDraft) {
        if (typeof showDemoDocument === "function") showDemoDocument(document);
        return;
      }
      const doctorRut = (typeof CURRENT_DOCTOR_RUT !== "undefined" && CURRENT_DOCTOR_RUT) || "";
      getDocument(document.id_recurso || document.id, selectedPatient.rut, doctorRut)
        .then(result => {
          if (!result.download_url) throw new Error("La API no devolvió una URL temporal.");
          window.open(result.download_url, "_blank", "noopener");
        })
        .catch(error => toast(error.message || "No fue posible abrir el documento."));
    });
  });
}

/* =========================================================
   CALENDAR
   ========================================================= */

function renderCalendar() {
  const container = $("view-agenda");
  if (!container) return;

  container.innerHTML = `
    <section class="doctor-section-hero agenda-hero-v5">
      <div class="section-hero-icon" aria-hidden="true">${doctorIcon("calendar")}</div>
      <div><p class="eyebrow">Agenda</p><h2>Agenda clínica</h2><p class="muted">Selecciona un día para revisar pacientes, motivo de consulta y estado de cada atención.</p></div>
      <button class="secondary-button compact-button" type="button" id="todayAgendaButton">Hoy</button>
    </section>

    <div class="agenda-clinical-layout">
      <section class="panel agenda-calendar-card">
        <div class="calendar-header clinical-calendar-header">
          <button class="icon-button" type="button" id="previousMonth" aria-label="Mes anterior">‹</button>
          <div><p class="eyebrow">Calendario</p><h3 id="calendarMonth"></h3></div>
          <button class="icon-button" type="button" id="nextMonth" aria-label="Mes siguiente">›</button>
        </div>
        <div id="calendarGrid" class="calendar-grid clinical-calendar-grid"></div>
        <div class="agenda-legend"><span><i class="legend-dot programada"></i>Programada</span><span><i class="legend-dot borrador"></i>En curso</span><span><i class="legend-dot finalizada"></i>Finalizada</span></div>
      </section>
      <aside class="panel agenda-day-card"><div id="selectedDay" class="selected-day clinical-selected-day"></div></aside>
    </div>
  `;

  $("previousMonth")?.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1);
    selectedCalendarDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    renderCalendar();
  });
  $("nextMonth")?.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1);
    selectedCalendarDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    renderCalendar();
  });
  $("todayAgendaButton")?.addEventListener("click", () => {
    currentMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
    selectedCalendarDate = new Date(TODAY);
    renderCalendar();
  });
  const monthElement = $("calendarMonth");
  if (monthElement) monthElement.textContent = formatMonth(currentMonth);
  renderCalendarDays();
  renderSelectedDay(selectedCalendarDate);
}

function renderCalendarDays() {
  const grid = $("calendarGrid");
  if (!grid) return;
  const year=currentMonth.getFullYear();
  const month=currentMonth.getMonth();
  const first=new Date(year,month,1);
  const mondayOffset=(first.getDay()+6)%7;
  const start=new Date(year,month,1-mondayOffset);
  const events=agendaItems();
  const cells=[];

  for(let index=0; index<42; index++){
    const date=new Date(start);
    date.setDate(start.getDate()+index);
    const iso=toISODate(date);
    const isCurrent=date.getMonth()===month;
    const isToday=sameDay(date,TODAY);
    const isSelected=sameDay(date,selectedCalendarDate);
    const dayEvents=events.filter(item=>sameDay(agendaDate(item),date)).sort((a,b)=>new Date(agendaDate(a))-new Date(agendaDate(b)));
    const visible=dayEvents.slice(0,3);
    cells.push(`
      <button class="clinical-calendar-day ${isCurrent?"":"outside"} ${isToday?"today":""} ${isSelected?"selected":""}" type="button" data-calendar-date="${iso}" aria-pressed="${isSelected}" aria-label="${escapeHTML(date.toLocaleDateString('es-CL', {day:'numeric',month:'long',year:'numeric'}))}, ${dayEvents.length} atenciones">
        <span class="clinical-day-number">${date.getDate()}</span>
        ${dayEvents.length ? `<span class="clinical-day-count">${dayEvents.length} cita${dayEvents.length === 1 ? "" : "s"}</span>` : ""}
        <span class="clinical-day-events">
          ${visible.map(item=>`<span class="clinical-event-pill status-${agendaStatusKey(item)}"><b>${escapeHTML(agendaTime(item))}</b><em>${escapeHTML(agendaPatientName(item))}</em></span>`).join("")}
          ${dayEvents.length>3?`<span class="more-events">+${dayEvents.length-3}</span>`:""}
        </span>
      </button>`);
  }

  grid.innerHTML=`<div class="calendar-weekdays clinical-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="clinical-calendar-days">${cells.join("")}</div>`;
  grid.querySelectorAll("[data-calendar-date]").forEach(button=>{
    button.addEventListener("click",()=>{
      selectedCalendarDate=new Date(`${button.dataset.calendarDate}T12:00:00`);
      renderCalendarDays();
      renderSelectedDay(selectedCalendarDate);
      loadAgendaForDate(selectedCalendarDate);
    });
  });
}

function renderSelectedDay(date) {
  const container = $("selectedDay");
  if (!container) return;
  const items=agendaItems().filter(item=>sameDay(agendaDate(item),date)).sort((a,b)=>new Date(agendaDate(a))-new Date(agendaDate(b)));
  const dateLabel=date.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"});

  container.innerHTML=`
    <div class="selected-day-header clinical-day-heading"><p class="eyebrow">Día seleccionado</p><h2>${escapeHTML(dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1))}</h2><span>${items.length} ${items.length===1?"atención":"atenciones"}</span></div>
    <div class="clinical-day-list">
      ${items.length?items.map(item=>{
        const patient=agendaPatient(item);
        const patientId=patient?(patient.id||patient.id_paciente):(item.patient_id||item.id_paciente||"");
        const status=agendaStatusKey(item);
        const access=agendaAccessState(item);
        return `
          <article class="clinical-appointment-card status-${status}">
            <div class="clinical-appointment-head"><div><span class="appointment-time">${escapeHTML(agendaTime(item))}</span><h3>${escapeHTML(agendaPatientName(item))}</h3></div><span class="doctor-status-chip status-${status}">${escapeHTML(agendaStatusLabel(item))}</span></div>
            <div class="clinical-appointment-body">
              <p class="appointment-specialty">${doctorIcon("clinic")} <span>${escapeHTML(agendaSpecialty(item))}</span></p>
              <div class="appointment-reason"><span>Motivo de consulta</span><strong>${escapeHTML(agendaReason(item))}</strong></div>
              <p class="appointment-meta">${escapeHTML(agendaEstablishment(item))} · ${escapeHTML(item.modalidad||item.modality||"Presencial")} · ${escapeHTML(agendaDuration(item))} min</p>
              <span class="access-chip ${access}">${escapeHTML(agendaAccessLabel(item))}</span>
            </div>
            <div class="clinical-appointment-actions">
              ${patientId?`<button class="secondary-button" type="button" data-prepare-attention="${escapeHTML(item.id_atencion || item.id || "")}">Preparar atención</button><button class="secondary-button" type="button" data-open-patient="${escapeHTML(patientId)}">Abrir ficha</button>`:`<button class="secondary-button" type="button" data-agenda-action="solicitar-acceso">Solicitar acceso</button>`}
              ${status!=="finalizada" && patientId?`<button class="primary-button" type="button" data-start-attention="${escapeHTML(item.id_atencion || item.id || "")}">${status === "borrador" ? "Continuar atención" : "Iniciar atención"}</button>`:""}
              ${status!=="finalizada"?`<button class="ghost-action-button" type="button" data-agenda-action="reprogramar">Reprogramar</button>`:""}
            </div>
          </article>`;
      }).join(""):`<div class="empty-inline-state compact-empty-state agenda-empty"><span class="empty-icon" aria-hidden="true">${doctorIcon("calendar")}</span><div><strong>No hay atenciones para este día.</strong><p class="muted">Selecciona otra fecha o vuelve a hoy.</p></div></div>`}
    </div>`;
}




/* =========================================================
   CONSULTATION + FOLLOW-UP FLOW
   ========================================================= */

function calculateAge(value) {
  const iso = toISODate(value);
  if (!iso) return "";
  const birth = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  let age = TODAY.getFullYear() - birth.getFullYear();
  const monthDiff = TODAY.getMonth() - birth.getMonth();
  const dayDiff = TODAY.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 0 ? `${age} años` : "";
}

function consultationById(id) {
  return agendaItems().find(item => String(item.id_atencion || item.id) === String(id));
}

async function ensurePatientLoadedFromAgenda(item) {
  if (!DEMO_MODE) {
    const rut = item?.rut || item?.patient_rut || patientRut(agendaPatient(item));
    await requireClinicalAccessFromAPI(rut);
  }
  const patient = agendaPatient(item);
  if (patient?._localDraft) { selectedPatient = patient; return patient; }
  const patientRutValue = patientRut(patient) || item?.rut || item?.patient_rut || "";

  if (patientRutValue) {
    try {
      const realPatient = await loadPatientFromAPI(patientRutValue);
      const existingIndex = DATA.patients.findIndex(entry => patientRut(entry) === realPatient.rut || String(entry.id || entry.id_paciente) === String(realPatient.id || realPatient.id_paciente));
      if (existingIndex >= 0) {
        DATA.patients[existingIndex] = { ...DATA.patients[existingIndex], ...realPatient };
        selectedPatient = DATA.patients[existingIndex];
      } else {
        DATA.patients.push(realPatient);
        selectedPatient = realPatient;
      }
      return selectedPatient;
    } catch (error) {
      throw new Error("No se pudo verificar la ficha. Reintenta antes de iniciar la atención.");
    }
  }

  if (patient) {
    selectedPatient = patient;
    return patient;
  }

  selectedPatient = {
    id: item?.id_paciente || item?.patient_id || "",
    rut: item?.rut || item?.patient_rut || "",
    nombre: (item?.patient_name || item?.paciente || "Paciente").split(/\s+/)[0] || "Paciente",
    apellido: (item?.patient_name || item?.paciente || "").split(/\s+/).slice(1).join(" "),
    blood_type: "",
    allergies: [],
    medications: [],
    attentions: []
  };
  return selectedPatient;
}

async function startConsultationFromSelectedPatient() {
  if (!selectedPatient) {
    toast("Selecciona un paciente antes de iniciar una atención.");
    return;
  }

  if (currentConsultation && String(currentConsultation.id_paciente || currentConsultation.patient_id) === String(selectedPatient.id || selectedPatient.id_paciente) && agendaStatusKey(currentConsultation) !== "finalizada") {
    switchView("consulta"); return;
  }
  const pending = [...attentionDrafts.values()].find(item => String(item.id_paciente || item.patient_id) === String(selectedPatient.id || selectedPatient.id_paciente));
  if (pending) { currentConsultation = {...pending}; switchView("consulta"); return; }
  const patientId = String(selectedPatient.id || selectedPatient.id_paciente || "");
  const rut = patientRut(selectedPatient);

  const candidates = agendaItems()
    .filter(item => {
      const itemPatient = agendaPatient(item);
      const itemId = itemPatient ? String(itemPatient.id || itemPatient.id_paciente || "") : String(item.id_paciente || item.patient_id || "");
      const itemRut = itemPatient ? patientRut(itemPatient) : (item.rut || item.patient_rut || "");
      return (patientId && itemId === patientId) || (rut && itemRut === rut);
    })
    .filter(item => ["programada", "borrador"].includes(agendaStatusKey(item)))
    .sort((a, b) => new Date(agendaDate(a) || 0) - new Date(agendaDate(b) || 0));

  const existing = candidates.find(item => sameDay(agendaDate(item), TODAY)) || candidates[0];

  if (existing) {
    await startConsultation(existing.id_atencion || existing.id);
    return;
  }

  if (!patientId || !rut) {
    toast("No fue posible identificar al paciente para crear la atención.");
    return;
  }

  const now = new Date();
  const draft = {
    id_paciente: patientId,
    patient_id: patientId,
    rut,
    fecha_hora: now.toISOString(),
    motivo: "",
    resumen: "",
    estado: "BORRADOR",
    modalidad: "Presencial",
    duracion_minutos: 30
  };

  try {
    toast("Creando atención…");
    const saved = DEMO_MODE
      ? { id_atencion: `DEMO-A-${Date.now()}`, estado: "BORRADOR" }
      : await saveAttentionToAPI(draft);

    if (!saved?.id_atencion) {
      throw new Error("La API no devolvió el identificador persistente de la atención.");
    }

    clinicalAiResult = null;
    clinicalAiLoading = false;
    currentConsultation = {
      ...draft,
      id: saved.id_atencion,
      id_atencion: saved.id_atencion,
      patient_name: patientName(selectedPatient),
      date: draft.fecha_hora,
      reason: "",
      status: saved.estado || "BORRADOR",
      professional: doctorFullName(),
      specialty: CURRENT_DOCTOR.especialidad || "Atención clínica",
      especialidad: CURRENT_DOCTOR.especialidad || "Atención clínica",
      establishment: CURRENT_ESTABLISHMENT,
      _dirty: false
    };

    selectedPatient.attentions = Array.isArray(selectedPatient.attentions)
      ? selectedPatient.attentions
      : [];
    selectedPatient.attentions.unshift({ ...currentConsultation });
    DATA.attentions = DATA.patients.flatMap(patient =>
      Array.isArray(patient.attentions) ? patient.attentions : []
    );

    renderConsultationView();
    switchView("consulta");
    toast("Atención creada como borrador. Guarda los cambios antes de salir.");
  } catch (error) {
    toast(error.message || "No fue posible crear la atención.");
  }
}

async function startConsultation(attentionId) {
  if (!canChangeAttention(attentionId)) return;
  if (attentionKey() === String(attentionId)) { switchView("consulta"); return; }
  const item = consultationById(attentionId);
  if (!item) {
    toast("No se encontró la atención seleccionada.");
    return;
  }

  try { await ensurePatientLoadedFromAgenda(item); }
  catch (error) { toast(error.message); return; }
  clinicalAiResult = null;
  clinicalAiLoading = false;
  currentConsultation = { ...item, ...attentionDrafts.get(String(attentionId)) };
  if (!currentConsultation.estado) currentConsultation.estado = item.status || "PROGRAMADA";
  renderConsultationView();
  switchView("consulta");
}

async function prepareAttention(attentionId) {
  const item = consultationById(attentionId);
  if (!item) { toast("No se encontró la atención seleccionada."); return; }
  try {
    const patient = await ensurePatientLoadedFromAgenda(item);
    const appointmentTime = new Date(agendaDate(item) || 0).getTime();
    const previous = (patient.attentions || [])
      .filter(attention => {
        if (String(attention.id_atencion || attention.id) === String(attentionId)) return false;
        const attentionTime = new Date(agendaDate(attention) || 0).getTime();
        return !appointmentTime || !attentionTime || attentionTime < appointmentTime;
      })
      .sort((a, b) => new Date(agendaDate(b) || 0) - new Date(agendaDate(a) || 0)).slice(0, 2);
    const list = (values, empty) => values?.length
      ? `<div class="prepare-chip-list">${values.map(value => `<span>${escapeHTML(value)}</span>`).join("")}</div>`
      : `<p class="muted">${empty}</p>`;
    const content = $("prepareAttentionContent");
    const modal = $("prepareAttentionModal");
    if (!content || !modal) return;
    modal.dataset.attentionId = String(attentionId);
    modal.dataset.patientId = String(patient.id || patient.id_paciente || "");
    content.innerHTML = `<section class="prepare-appointment-summary"><div><span>Paciente</span><strong>${escapeHTML(patientName(patient))}</strong><small>RUT ${escapeHTML(patientRut(patient) || "No registrado")}</small></div><div><span>Cita</span><strong>${escapeHTML(formatDate(agendaDate(item)))}</strong><small>${escapeHTML(agendaTime(item))} · ${escapeHTML(agendaStatusLabel(item))}</small></div><div class="prepare-reason"><span>Motivo de consulta</span><strong>${escapeHTML(agendaReason(item) || "Sin motivo registrado")}</strong></div></section><section class="prepare-clinical-grid"><article><h3>Alertas y tratamiento</h3><dl><dt>Alergias</dt><dd>${list(patient.allergies, "Sin alergias registradas")}</dd><dt>Condiciones</dt><dd>${list(patient.conditions, "Sin condiciones registradas")}</dd><dt>Medicamentos</dt><dd>${list(patient.medications, "Sin medicamentos registrados")}</dd></dl></article><article><h3>Antecedentes</h3><dl><dt>Personales</dt><dd>${list(patient.personalHistory, "Sin antecedentes personales")}</dd><dt>Familiares</dt><dd>${list(patient.familyHistory, "Sin antecedentes familiares")}</dd></dl></article><article class="prepare-history"><h3>Últimas atenciones</h3>${previous.length ? previous.map(attention => `<div><strong>${escapeHTML(formatDate(agendaDate(attention)))}</strong><span>${escapeHTML(agendaReason(attention) || "Atención clínica")}</span></div>`).join("") : `<p class="muted">No hay atenciones anteriores disponibles.</p>`}</article></section>`;
    content.innerHTML = `<section class="prepare-appointment-summary"><div><span>Paciente</span><strong>${escapeHTML(patientName(patient))}</strong><small>RUT ${escapeHTML(patientRut(patient) || "No registrado")}</small></div><div><span>Cita</span><strong>${escapeHTML(formatDate(agendaDate(item)))}</strong><small>${escapeHTML(agendaTime(item))} · ${escapeHTML(agendaStatusLabel(item))}</small></div><div class="prepare-reason"><span>Motivo de consulta</span><strong>${escapeHTML(agendaReason(item) || "Sin motivo registrado")}</strong></div></section><section class="prepare-clinical-grid"><article><h3>Lo importante antes de atender</h3><dl><dt>Alergias</dt><dd>${list(patient.allergies, "Sin alergias registradas")}</dd><dt>Condiciones</dt><dd>${list(patient.conditions, "Sin condiciones registradas")}</dd><dt>Medicamentos</dt><dd>${list(patient.medications, "Sin medicamentos registrados")}</dd></dl></article><article class="prepare-history"><h3>Últimas atenciones</h3>${previous.length ? previous.map(attention => `<div><strong>${escapeHTML(formatDate(agendaDate(attention)))}</strong><span>${escapeHTML(agendaReason(attention) || "Atención clínica")}</span></div>`).join("") : `<p class="muted">No hay atenciones anteriores disponibles.</p>`}</article></section><details class="prepare-more"><summary>Ver antecedentes adicionales</summary><div class="prepare-more-grid"><div><span>Antecedentes personales</span>${list(patient.personalHistory, "Sin antecedentes personales")}</div><div><span>Antecedentes familiares</span>${list(patient.familyHistory, "Sin antecedentes familiares")}</div></div></details>`;
    content.innerHTML = `<section class="prepare-appointment-summary"><article class="prepare-info-card"><span class="prepare-card-icon">${doctorIcon("patients")}</span><div><span>Paciente</span><strong>${escapeHTML(patientName(patient))}</strong><small>RUT ${escapeHTML(patientRut(patient) || "No registrado")}</small></div></article><article class="prepare-info-card"><span class="prepare-card-icon">${doctorIcon("calendar")}</span><div><span>Cita</span><strong>${escapeHTML(formatDate(agendaDate(item)))}</strong><small>${escapeHTML(agendaTime(item))} · ${escapeHTML(agendaStatusLabel(item))}</small></div></article><article class="prepare-reason prepare-info-card"><span class="prepare-card-icon">${doctorIcon("stethoscope")}</span><div><span>Motivo de consulta</span><strong>${escapeHTML(agendaReason(item) || "Sin motivo registrado")}</strong></div></article></section><section class="prepare-clinical-grid"><article class="prepare-section-card"><div class="prepare-section-title"><span class="prepare-section-icon">${doctorIcon("warning")}</span><h3>Lo importante antes de atender</h3></div><dl><dt>Alergias</dt><dd>${list(patient.allergies, "Sin alergias registradas")}</dd><dt>Condiciones</dt><dd>${list(patient.conditions, "Sin condiciones registradas")}</dd><dt>Medicamentos</dt><dd>${list(patient.medications, "Sin medicamentos registrados")}</dd></dl></article><article class="prepare-section-card"><div class="prepare-section-title"><span class="prepare-section-icon">${doctorIcon("clinic")}</span><h3>Datos relevantes</h3></div><div class="prepare-relevant-list"><div><strong>Motivo de la visita</strong><span>${escapeHTML(agendaReason(item) || "Sin motivo registrado")}</span></div><div><strong>Antecedentes disponibles</strong><span>${escapeHTML([...(patient.conditions || []), ...(patient.personalHistory || [])].slice(0, 2).join(" · ") || "No registrados")}</span></div><div><strong>Último registro</strong><span>${previous[0] ? `${escapeHTML(formatDate(agendaDate(previous[0])))} · ${escapeHTML(agendaReason(previous[0]) || "Atención clínica")}` : "Sin atenciones anteriores"}</span></div></div></article></section><article class="prepare-section-card prepare-history"><div class="prepare-section-title"><span class="prepare-section-icon">${doctorIcon("history")}</span><h3>Últimas atenciones</h3></div>${previous.length ? previous.map(attention => `<div><strong>${escapeHTML(formatDate(agendaDate(attention)))}</strong><span>${escapeHTML(agendaReason(attention) || "Atención clínica")}</span><span class="prepare-history-arrow">›</span></div>`).join("") : `<p class="muted">No hay atenciones anteriores disponibles.</p>`}</article><details class="prepare-more"><summary>Ver antecedentes adicionales</summary><div class="prepare-more-grid"><div><span>Antecedentes personales</span>${list(patient.personalHistory, "Sin antecedentes personales")}</div><div><span>Antecedentes familiares</span>${list(patient.familyHistory, "Sin antecedentes familiares")}</div></div></details>`;
    if (typeof modal.showModal === "function") modal.showModal(); else modal.hidden = false;
  } catch (error) { toast(error.message || "No fue posible preparar la atención."); }
}

function currentClinicalSummary() {
  return {
    reason: currentConsultation?.motivo || currentConsultation?.reason || "",
    observations: currentConsultation?.observaciones || currentConsultation?.observations || currentConsultation?.resumen || currentConsultation?.notes || "",
    diagnosis: currentConsultation?.diagnostico || currentConsultation?.diagnosis || "",
    indications: currentConsultation?.indicaciones || currentConsultation?.instructions || "",
    treatment: currentConsultation?.tratamiento || currentConsultation?.treatment || currentConsultation?.indicaciones || currentConsultation?.instructions || "",
    status: agendaStatusKey(currentConsultation || {})
  };
}

function saveConsultationForm(mode = "draft") {
  captureAttention();
  if (!currentConsultation) return;
  const reason = $("consultReason")?.value?.trim() || currentConsultation.motivo || currentConsultation.reason || "";
  const observations = $("consultObservations")?.value?.trim() || "";
  const diagnosis = $("consultDiagnosis")?.value?.trim() || "";
  const indications = $("consultIndications")?.value?.trim() || "";
  const treatment = $("consultTreatment")?.value?.trim() || "";

  Object.assign(currentConsultation, {
    motivo: reason,
    reason,
    observaciones: observations,
    observations,
    resumen: observations,
    notes: observations,
    diagnostico: diagnosis,
    diagnosis,
    indicaciones: indications,
    instructions: indications,
    tratamiento: treatment,
    treatment,
    estado: mode === "final" ? "FINALIZADA" : "BORRADOR",
    status: mode === "final" ? "FINALIZADA" : "BORRADOR"
  });

  const index = DATA.appointments.findIndex(item => String(item.id_atencion || item.id) === String(currentConsultation.id_atencion || currentConsultation.id));
  if (index >= 0) {
    DATA.appointments[index] = { ...DATA.appointments[index], ...currentConsultation };
  }

  if (selectedPatient) {
    selectedPatient.attentions = Array.isArray(selectedPatient.attentions) ? selectedPatient.attentions : [];
    const attentionIndex = selectedPatient.attentions.findIndex(item => String(item.id_atencion || item.id) === String(currentConsultation.id_atencion || currentConsultation.id));
    if (attentionIndex >= 0) {
      selectedPatient.attentions[attentionIndex] = { ...selectedPatient.attentions[attentionIndex], ...currentConsultation };
    } else {
      selectedPatient.attentions.unshift({ ...currentConsultation });
    }
  }

  DATA.attentions = DATA.patients.flatMap(patient => Array.isArray(patient.attentions) ? patient.attentions : []);
}

function finalizeCurrentConsultation() {
  toast('El cierre definitivo estará disponible al conectar el guardado en el servidor.');
}

function consultationTag(text, tone = "default") {
  return `<span class="consultation-chip ${tone}">${escapeHTML(text)}</span>`;
}

function clinicalList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item));
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function buildClinicalAiContext() {
  if (!selectedPatient || !currentConsultation) return null;

  const patient = selectedPatient;
  const reason = $("consultReason")?.value?.trim() || currentConsultation.motivo || currentConsultation.reason || "";
  const evaluation = $("consultObservations")?.value?.trim() || currentConsultation.observaciones || currentConsultation.observations || "";

  return {
    patient: {
      age: calculateAge(patientBirthDate(patient)) || null,
      sex: patient.sex || patient.sexo || null,
      blood_group: patient.blood_type || patient.grupo_sanguineo || null,
      allergies: Array.isArray(patient.allergies) ? patient.allergies : [],
      medications: Array.isArray(patient.medications) ? patient.medications : [],
      conditions: Array.isArray(patient.conditions) ? patient.conditions : []
    },
    encounter: {
      reason,
      clinical_evaluation: evaluation,
      specialty: agendaSpecialty(currentConsultation),
      modality: currentConsultation.modalidad || currentConsultation.modality || "Presencial"
    },
    requested_output: [
      "red_flags",
      "questions_to_consider",
      "tests_or_actions_to_consider",
      "medication_safety",
      "follow_up_recommendations"
    ],
    constraints: {
      no_diagnosis: true,
      no_autonomous_prescription: true,
      professional_review_required: true
    }
  };
}

function renderClinicalAiResult() {
  if (clinicalAiLoading) {
    return `
      <div class="ai-empty">
        <strong>Analizando contexto clínico…</strong>
        <p>Se está solicitando apoyo al servicio de recomendaciones. El diagnóstico sigue siendo responsabilidad del profesional.</p>
      </div>`;
  }

  if (!clinicalAiResult) {
    return `
      <div class="ai-empty">
        <strong>Aún no se han generado recomendaciones.</strong>
        <p>Primero completa el motivo de consulta y la evaluación clínica. Se enviará el contexto clínico de la evaluación. Revisa que el texto no incluya identificadores del paciente.</p>
      </div>`;
  }

  if (clinicalAiResult.error) {
    return `
      <div class="ai-empty">
        <strong>Servicio de IA no conectado.</strong>
        <p>El servicio de apoyo clínico no está disponible. Puedes continuar registrando la atención.</p>
      </div>
      <div class="ai-error">${escapeHTML(clinicalAiResult.error)}</div>`;
  }

  const redFlags = clinicalList(clinicalAiResult.red_flags);
  const questions = clinicalList(clinicalAiResult.questions_to_consider);
  const actions = clinicalList(clinicalAiResult.tests_or_actions_to_consider);
  const medication = clinicalList(clinicalAiResult.medication_safety);
  const followup = clinicalList(clinicalAiResult.follow_up_recommendations);

  const group = (title, items, extraClass = "") => items.length ? `
    <section class="ai-recommendation-group ${extraClass}">
      <h5>${escapeHTML(title)}</h5>
      <ul>${items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
    </section>` : "";

  const groups = [
    group("Señales de alerta a revisar", redFlags, "ai-warning-group"),
    group("Preguntas clínicas sugeridas", questions),
    group("Evaluaciones o acciones a considerar", actions),
    group("Seguridad de medicamentos", medication),
    group("Seguimiento sugerido", followup)
  ].filter(Boolean).join("");

  return groups
    ? `<div class="ai-recommendation-grid">${groups}</div>`
    : `<div class="ai-empty"><strong>Respuesta recibida sin recomendaciones estructuradas.</strong><p>Puedes continuar la atención o volver a solicitar apoyo más adelante.</p></div>`;
}

function buildDemoSafeMedResult() {
  const patient = selectedPatient || {};
  const proposed = currentConsultation?.medications_proposed || [];
  const allergies = Array.isArray(patient.allergies) ? patient.allergies.filter(Boolean) : [];
  const active = Array.isArray(patient.medications) ? patient.medications.filter(Boolean) : [];
  const names = proposed.map(item => item.name).filter(Boolean);
  return {
    red_flags: allergies.length
      ? [`Revisar alergias registradas antes de confirmar: ${allergies.join(" · ")}.`]
      : ["No hay alergias registradas. Confirmarlas directamente con el paciente."],
    questions_to_consider: [
      "Confirmar medicamentos activos, automedicación y suplementos.",
      "Verificar antecedentes relevantes y signos de alarma según la evaluación."
    ],
    tests_or_actions_to_consider: [
      "Revisar coherencia entre diagnóstico, indicaciones y tratamiento propuesto.",
      "Definir seguimiento o fecha de control cuando corresponda."
    ],
    medication_safety: names.length
      ? [
          `Tratamiento propuesto detectado: ${names.join(" · ")}.`,
          active.length ? `Comparar con medicamentos activos: ${active.join(" · ")}.` : "No hay medicamentos activos registrados; confirmar esta información.",
          "Validar dosis, vía, frecuencia, duración, contraindicaciones e interacciones antes de emitir."
        ]
      : ["No hay medicamentos propuestos para revisar."],
    follow_up_recommendations: ["Registrar las consideraciones clínicas del profesional antes de finalizar."],
    demo: true
  };
}

function renderSafeMedPanelResult() {
  const panel = document.querySelector(".safemed-panel");
  if (!panel) return;
  let target = $("safeMedResult");
  if (!target) {
    target = document.createElement("div");
    target.id = "safeMedResult";
    const note = $("safeMedDecision")?.closest("label");
    panel.insertBefore(target, note || null);
  }
  if (target) target.innerHTML = renderClinicalAiResult();
}

function bindSafeMedActions() {
  const panel = document.querySelector(".safemed-panel");
  const state = panel?.querySelector(".safemed-state");
  if (state) {
    state.id = "safeMedState";
    if (!clinicalAiResult && !clinicalAiLoading) state.textContent = "Listo para analizar";
  }
  const panelButtons = panel ? panel.querySelectorAll("section button") : [];
  const analyze = panelButtons[0];
  const review = panelButtons[1];
  if (analyze) {
    analyze.id = "safeMedAnalyze";
    analyze.disabled = false;
    analyze.textContent = DEMO_MODE ? "Analizar en demo" : "Analizar evaluación";
  }
  if (review) {
    review.id = "safeMedReview";
    review.disabled = false;
    review.textContent = DEMO_MODE ? "Revisar medicamentos en demo" : "Revisar medicamentos";
  }
  renderSafeMedPanelResult();
  const runSafeMed = async () => {
    captureAttention();
    clinicalAiLoading = true;
    clinicalAiResult = null;
    renderSafeMedPanelResult();
    $("safeMedState")?.replaceChildren(document.createTextNode("Analizando contexto clínico…"));
    requestClinicalRecommendations(buildClinicalAiContext()).then(result => {
      clinicalAiResult = result;
      clinicalAiLoading = false;
      renderSafeMedPanelResult();
      $("safeMedState")?.replaceChildren(document.createTextNode("Revisión completada"));
    }).catch(error => {
      clinicalAiResult = {error: error.message || "No fue posible conectar SafeMed."};
      clinicalAiLoading = false;
      renderSafeMedPanelResult();
      $("safeMedState")?.replaceChildren(document.createTextNode("Error de conexión"));
    });
  };
  $("safeMedAnalyze")?.addEventListener("click", runSafeMed);
  $("safeMedReview")?.addEventListener("click", runSafeMed);
}

async function handleClinicalAiRequest() {
  if (!currentConsultation || !selectedPatient) return;

  const reason = $("consultReason")?.value?.trim() || "";
  const evaluation = $("consultObservations")?.value?.trim() || "";

  if (!reason || !evaluation) {
    toast("Completa el motivo de consulta y la evaluación clínica antes de solicitar recomendaciones.");
    return;
  }

  saveConsultationForm("draft");
  clinicalAiLoading = true;
  clinicalAiResult = null;
  renderConsultationView();

  try {
    const context = buildClinicalAiContext();
    clinicalAiResult = await requestClinicalRecommendations(context);
  } catch (error) {
    clinicalAiResult = { error: error.message || "No fue posible obtener recomendaciones clínicas." };
  } finally {
    clinicalAiLoading = false;
    renderConsultationView();
  }
}

// Comparamos el contenido clínico, no los alias de campos del PDF.
function medicationComparisonSnapshot(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    name: String(item.name || item.nombre || (item.medicamento || "").split(" · ")[0] || "").trim(),
    presentation: String(item.presentation || item.presentacion || (item.medicamento || "").split(" · ").slice(1).join(" · ") || "").trim(),
    dose: String(item.dose || item.dosis || "").trim(),
    route: String(item.route || item.via || item["vía"] || "").trim(),
    frequency: String(item.frequency || item.frecuencia || "").trim(),
    duration: String(item.duration || item.duracion || item["duración"] || "").trim()
  }));
}

function renderAttentionDocuments(patient, attention) {
  const attentionId = String(attention?.id_atencion || attention?.id || "");
  const docs = (Array.isArray(patient?.documents) ? patient.documents : []).filter(document => {
    if (DEMO_MODE && !document._demoCreated) return false;
    const docAttentionId = String(document.id_atencion || document.attention_id || "");
    return Boolean(docAttentionId && docAttentionId === attentionId);
  });
  if (!docs.length) return `<p class="muted attention-documents-empty">Aún no hay documentos creados para esta atención.</p>`;
  const closed = agendaStatusKey(attention) === "finalizada";
  return `<div class="attention-document-list">${docs.map(document => `<div class="attention-document-row"><div><strong>${escapeHTML(document.name || document.type || "Documento clínico")}</strong><small>${escapeHTML(documentState(document))}${document._localDraft ? " · Solo en esta página" : ""}${documentExpiryDate(document) ? ` · vence ${escapeHTML(formatDate(documentExpiryDate(document)))}` : ""}</small></div>${document._localDraft && !closed ? `<button type="button" class="secondary-button compact-button" data-remove-clinical-draft="${escapeHTML(document.id_documento || "")}">Quitar borrador</button>` : ""}</div>`).join("")}</div>`;
}

function renderConsultationView() { renderAttentionWorkflow(); }

function openFollowupRequestModal() {
  if (!selectedPatient || !currentConsultation) return;
  const dialog = document.createElement("dialog");
  dialog.className = "followup-request-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="dialog-form-grid">
      <div class="dialog-heading dialog-span-2">
        <div><p class="eyebrow">SEGUIMIENTO CLÍNICO</p><h2>Proponer seguimiento</h2>
        <p class="muted">La fecha queda como propuesta hasta que el paciente la acepte.</p></div>
        <button class="icon-button" type="button" data-close-followup aria-label="Cerrar">×</button>
      </div>
      <label class="dialog-span-2">Motivo<input name="motivo" required value="Control posterior de la atención"></label>
      <label>Fecha propuesta<input name="fecha" type="date" required></label>
      <label>Modalidad<select name="modalidad"><option>Presencial</option><option>Teleconsulta</option></select></label>
      <label class="dialog-span-2">Nota para el paciente<textarea name="nota" rows="4" placeholder="Indicaciones para el próximo control..."></textarea></label>
      <div class="dialog-actions dialog-span-2"><button type="button" class="secondary-button" data-close-followup>Cancelar</button><button class="primary-button" value="default">Enviar propuesta</button></div>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.querySelectorAll("[data-close-followup]").forEach(button => button.addEventListener("click", close));
  const date = dialog.querySelector('[name="fecha"]');
  date.value = localISODate(new Date(Date.now() + 30 * 86400000));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const requestPayload = {
      rut: patientRut(selectedPatient),
      id_atencion_origen: currentConsultation.id_atencion || currentConsultation.id,
      fecha_propuesta: values.fecha,
      modalidad: values.modalidad,
      motivo: values.motivo,
      nota: values.nota
    };
    let saved = {};
    if (!DEMO_MODE && typeof createFollowupRequestToAPI === "function") {
      try {
        saved = await createFollowupRequestToAPI(requestPayload);
      } catch (error) {
        toast(error.message || "No fue posible crear la solicitud de seguimiento.");
        return;
      }
    }
    DATA.followupRequests.push({
      id: `FOLLOW-${Date.now()}`,
      id_solicitud: saved.id_solicitud,
      id_paciente: selectedPatient.id || selectedPatient.id_paciente,
      id_atencion: currentConsultation.id_atencion || currentConsultation.id,
      patient_name: patientName(selectedPatient),
      ...values,
      estado: "PENDIENTE_DE_ACEPTACIÓN",
      created_at: new Date().toISOString()
    });
    close();
    renderFollowUpView();
    toast("Propuesta de seguimiento creada y pendiente de aceptación del paciente.");
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.showModal();
}

function renderFollowUpView() {
  const container = $("followupContent");
  if (!container) return;

  if (!currentConsultation || !selectedPatient) {
    container.innerHTML = `
      <section class="panel empty-state illustrated-empty wide-empty">
        <span class="empty-icon" aria-hidden="true">${doctorIcon("check")}</span>
        <div>
          <h3>No hay seguimiento activo</h3>
          <p class="muted">Finaliza una consulta para visualizar el resumen, las indicaciones y el plan de seguimiento.</p>
        </div>
      </section>`;
    return;
  }

  const patient = selectedPatient;
  const summary = currentClinicalSummary();
  const latestHistory = (Array.isArray(patient.attentions) ? patient.attentions : [])
    .sort((a,b)=>new Date(agendaDate(b)) - new Date(agendaDate(a)))
    .slice(0,3);

  container.innerHTML = `
    <section class="follow-shell">
      <section class="panel follow-header">
        <div class="follow-header-main">
          <span class="avatar follow-avatar">${escapeHTML(initials(patient))}</span>
          <div>
            <p class="eyebrow">Seguimiento clínico</p>
            <h2>Resultado y seguimiento</h2>
            <p class="muted">Paciente: ${escapeHTML(patientName(patient))} · RUT ${escapeHTML(patientRut(patient) || "—")}</p>
          </div>
        </div>
        <div class="follow-header-actions">
          <span class="follow-status-pill">${agendaStatusKey(currentConsultation) === "finalizada" ? "Atención finalizada" : "Borrador temporal"}</span>
          <button class="secondary-button" type="button" data-open-patient="${escapeHTML(patient.id || patient.id_paciente || "")}">Ver ficha clínica</button>
        </div>
      </section>

      <div class="follow-grid">
        <article class="panel follow-card">
          <div class="side-card-title"><span class="mini-icon">${doctorIcon("clinic")}</span><div><h3>Resultado de la consulta</h3><p class="muted">Resumen clínico de la atención realizada.</p></div></div>
          <div class="follow-summary-block"><strong>Motivo de consulta</strong><p>${escapeHTML(summary.reason || "No informado")}</p></div>
          <div class="follow-summary-block"><strong>Evaluación / observaciones</strong><p>${escapeHTML(summary.observations || "Sin observaciones registradas.")}</p></div>
          <div class="follow-summary-block"><strong>Diagnóstico</strong><p>${escapeHTML(summary.diagnosis || "Sin diagnóstico registrado.")}</p></div>
          <div class="follow-summary-block"><strong>Indicaciones</strong><p>${escapeHTML(summary.indications || "Sin indicaciones registradas.")}</p></div>
        </article>

        <article class="panel follow-card">
          <div class="side-card-title"><span class="mini-icon">${doctorIcon("folder")}</span><div><h3>Tratamiento y próximos pasos</h3><p class="muted">Aquí continúa el flujo posterior a la consulta.</p></div></div>
          <div class="follow-summary-block"><strong>Tratamiento / receta base</strong><p>${escapeHTML(summary.treatment || "Pendiente de definir.")}</p></div>
          <div class="follow-summary-block"><strong>Documentación posterior</strong><p>En esta vista se puede adjuntar receta, examen, informe o indicaciones formales según corresponda.</p></div>
          <div class="follow-action-grid">
            <button class="secondary-button" type="button" id="attachAfterConsultation">Adjuntar receta / documento</button>
            <button class="primary-button" type="button" id="scheduleFollowup">Crear seguimiento</button>
          </div>
        </article>
      </div>

      <section class="panel follow-history-card">
        <div class="doctor-subtable-header">
          <div>
            <p class="eyebrow">Historial reciente</p>
            <h3>Atenciones del paciente</h3>
          </div>
        </div>
        <div class="follow-history-list">
          ${latestHistory.length ? latestHistory.map(item => `
            <article class="follow-history-item">
              <strong>${escapeHTML(formatDate(agendaDate(item)))}</strong>
              <span>${escapeHTML(agendaReason(item))}</span>
              <em>${escapeHTML(agendaStatusLabel(item))}</em>
            </article>`).join("") : `<p class="muted">No hay atenciones previas registradas.</p>`}
        </div>
      </section>
    </section>`;

  const requests = DATA.followupRequests.filter(item => String(item.id_paciente) === String(patient.id || patient.id_paciente));
  const requestPanel = document.createElement("section");
  requestPanel.className = "panel follow-history-card";
  requestPanel.innerHTML = `<div class="doctor-subtable-header"><div><p class="eyebrow">COORDINACIÓN</p><h3>Solicitudes de seguimiento</h3></div></div><div class="follow-history-list">${requests.length ? requests.map(item => `<article class="follow-history-item"><strong>${escapeHTML(formatDate(item.fecha))}</strong><span>${escapeHTML(item.motivo)} · ${escapeHTML(item.modalidad)}</span><em>${escapeHTML(item.estado)}</em></article>`).join("") : `<p class="muted" style="padding:16px">No hay propuestas pendientes.</p>`}</div>`;
  container.appendChild(requestPanel);

  $("attachAfterConsultation")?.addEventListener("click", () => {
    openClinicalDocumentModal("RECETA");
  });
  $("scheduleFollowup")?.addEventListener("click", () => {
    openFollowupRequestModal();
  });
}

/* =========================================================
   LOAD REAL DOCTOR AGENDA
   ========================================================= */

function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ensureAgendaPatients(citas) {
  citas.forEach(cita => {
    const idPaciente = cita.id_paciente || cita.patient_id;
    const rut = cita.rut || cita.patient_rut || "";
    const fullName = cita.patient_name || cita.paciente || "Paciente";

    if (!idPaciente && !rut) return;

    const existing = DATA.patients.find(patient =>
      (idPaciente && String(patient.id || patient.id_paciente) === String(idPaciente)) ||
      (rut && patientRut(patient) === rut)
    );

    if (existing) return;

    const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    const nombre = parts.shift() || "Paciente";
    const apellido = parts.join(" ");

    DATA.patients.push({
      id: idPaciente,
      id_paciente: idPaciente,
      rut,
      name: nombre,
      first_name: nombre,
      nombre,
      last_name: apellido,
      apellido,
      attentions: [],
      documents: [],
      _source: "Agenda Doctor API"
    });
  });
}

async function loadDoctorProfile() {
  try {
    const profesional = await loadDoctorProfileFromAPI(CURRENT_DOCTOR_RUT);

    CURRENT_DOCTOR = {
      ...CURRENT_DOCTOR,
      ...profesional
    };

    applyDoctorIdentityToUI();
    renderHome();

    // No registrar objetos profesionales en consola.
  } catch (error) {
    console.warn("No fue posible cargar el perfil real del doctor:", error);

    const loadError = $("loadError");
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = `No fue posible validar el profesional ${CURRENT_DOCTOR_RUT}: ${error.message}`;
    }

    applyDoctorIdentityToUI();
  }
}

async function loadDoctorAgenda() {
  const fecha = localISODate(TODAY);
  const rangeEndDate = new Date(TODAY);
  rangeEndDate.setDate(TODAY.getDate() + 45);
  const fechaFin = localISODate(rangeEndDate);

  // No registrar RUT del profesional en consola.

  try {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
    const citas = await loadDoctorAgendaMonthFromAPI(CURRENT_DOCTOR_RUT, monthKey);
    const rangeLoaded = false;

    DATA.appointments = citas;
    if (rangeLoaded) {
      for (let offset = 0; offset <= 45; offset += 1) {
        const loadedDate = new Date(TODAY);
        loadedDate.setDate(TODAY.getDate() + offset);
        loadedAgendaDates.add(localISODate(loadedDate));
      }
    } else {
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day += 1) {
        loadedAgendaDates.add(`${monthKey}-${String(day).padStart(2, "0")}`);
      }
    }
    ensureAgendaPatients(citas);

    const firstAgenda = citas[0];
    if (firstAgenda) {
      CURRENT_DOCTOR = {
        ...CURRENT_DOCTOR,
        nombre: firstAgenda.professional_name || CURRENT_DOCTOR.nombre,
        apellido: firstAgenda.professional_last_name || CURRENT_DOCTOR.apellido,
        especialidad: firstAgenda.specialty || CURRENT_DOCTOR.especialidad,
        rut: firstAgenda.professional_rut || CURRENT_DOCTOR.rut
      };
      CURRENT_ESTABLISHMENT = firstAgenda.establishment || CURRENT_ESTABLISHMENT;
      applyDoctorIdentityToUI();
    }

    const loadError = $("loadError");
    if (loadError) {
      loadError.hidden = true;
      loadError.textContent = "";
    }

    // Evitar imprimir datos de agenda y pacientes en consola.

    renderHome();
    renderPatients();
    renderCalendar();
    renderConsultationView();
    renderFollowUpView();
    renderSelectedDay(selectedCalendarDate || TODAY);
    if (!rangeLoaded) {
      loadUpcomingAgenda().catch(error => console.warn("No fue posible cargar las próximas citas:", error));
    }
  } catch (error) {
    console.warn(
      "No fue posible cargar la agenda real del doctor:",
      error
    );

    const loadError = $("loadError");
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = `No fue posible cargar la agenda del profesional ${CURRENT_DOCTOR_RUT}: ${error.message}`;
    }
  }
}

async function loadAgendaForDate(date) {
  const fecha = localISODate(date);
  if (loadedAgendaDates.has(fecha)) return;

  try {
    const citas = await loadDoctorAgendaFromAPI(CURRENT_DOCTOR_RUT, fecha);
    DATA.appointments = DATA.appointments.filter(item => !sameDay(agendaDate(item), date));
    DATA.appointments.push(...citas);
    loadedAgendaDates.add(fecha);
    ensureAgendaPatients(citas);
    renderCalendarDays();
    renderSelectedDay(date);
    renderHome();
    renderPatients();
  } catch (error) {
    console.warn("No fue posible cargar la agenda de la fecha seleccionada:", error);
    const loadError = $("loadError");
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = `No fue posible cargar la agenda del ${fecha}: ${error.message}`;
    }
  }
}

async function loadUpcomingAgenda(days = 45) {
  const dates = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date(TODAY);
    date.setDate(TODAY.getDate() + offset);
    const key = localISODate(date);
    if (!loadedAgendaDates.has(key)) dates.push(date);
  }

  const byId = new Map(DATA.appointments.map(item => [String(item.id_atencion || item.id), item]));
  // Ocho fechas alcanzan a cubrir la primera cita futura habitual y permiten
  // que el inicio de la agenda aparezca antes de terminar toda la ventana.
  const batchSize = 8;

  // Las fechas futuras se consultan en lotes pequeños para no bloquear la pantalla
  // ni abrir 45 conexiones simultáneas contra la Lambda/RDS.
  for (let start = 0; start < dates.length; start += batchSize) {
    const batch = dates.slice(start, start + batchSize);
    const results = await Promise.all(batch.map(async date => {
      const fecha = localISODate(date);
      try {
        return { fecha, citas: await loadDoctorAgendaFromAPI(CURRENT_DOCTOR_RUT, fecha) };
      } catch (error) {
        console.warn(`No fue posible cargar ${fecha}:`, error);
        return { fecha, citas: [] };
      }
    }));

    results.forEach(({ fecha, citas }) => {
      loadedAgendaDates.add(fecha);
      ensureAgendaPatients(citas);
      citas.forEach(cita => byId.set(String(cita.id_atencion || cita.id), cita));
    });

    // Pintamos cada lote apenas llega. Así la agenda aparece progresivamente.
    DATA.appointments = [...byId.values()];
    renderHome();
    renderPatients();
    if ($("view-agenda") && !$("view-agenda").hidden) {
      renderCalendarDays();
      renderSelectedDay(selectedCalendarDate || TODAY);
    }
  }
}

/* =========================================================
   LOAD REAL TEST PATIENT
   ========================================================= */

async function loadInitialPatientFromAPI(rut) {
  if (!rut) return;
  console.log("VIK Doctor: cargando paciente solicitado desde la BD");

  try {
    const realPatient = await loadPatientFromAPI(
      rut
    );

    const index = DATA.patients.findIndex(
      patient => patientRut(patient) === realPatient.rut
    );

    if (index >= 0) {
      DATA.patients[index] = {
        ...DATA.patients[index],
        ...realPatient
      };
    } else {
      DATA.patients.push(realPatient);
    }

    selectedPatient = DATA.patients.find(
      patient => patientRut(patient) === realPatient.rut
    ) || realPatient;

    DATA.attentions = DATA.patients.flatMap(
      patient => Array.isArray(patient.attentions) ? patient.attentions : []
    );

    DATA.documents = DATA.patients.flatMap(
      patient => Array.isArray(patient.documents) ? patient.documents : []
    );

    // No registrar fichas clínicas en consola.

    renderHome();
    renderPatients();
    renderDocuments();
    renderCalendar();
    renderConsultationView();
    renderFollowUpView();

  } catch (error) {
    console.warn(
      "No fue posible cargar el paciente real desde RDS:",
      error
    );

    // Sin fallback ficticio: si la API falla, la interfaz queda sin datos inventados.
  }
}


/* =========================================================
   INITIALIZE
   ========================================================= */

function initialize() {
  bindEvents();
  if (DEMO_MODE) { initializeDemo(); return; }
  applyDoctorIdentityToUI();

  renderHome();
  renderPatients();
  renderDocuments();
  renderCalendar();
  renderConsultationView();
  renderFollowUpView();
  renderSelectedDay(TODAY);

  switchView("inicio");

  selectedPatient = null;

  console.log(
    "VIK Doctor portal initialized.",
    selectedPatient
  );

  if (!DOCTOR_SESSION.valid) {
    const loadError = $("loadError");
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = "No existe una sesión profesional válida. Inicia sesión desde el portal de acceso antes de abrir el portal médico.";
    }
    window.setTimeout(() => {
      window.location.replace("../login/index.html");
    }, 600);
    return;
  }

  loadDoctorProfile();
  loadDoctorAgenda();
}

/* =========================================================
   DEMO MODE (kept in this file to keep the portal self-contained)
   ========================================================= */

function initializeDemo() {
  CURRENT_DOCTOR = {nombre:"Valentina",apellido:"Demo",especialidad:"Medicina general",id_profesional:"DEMO-DR"};
  CURRENT_DOCTOR_RUT = "DEMO-DR";
  CURRENT_ESTABLISHMENT = "Centro de demostración VIK";
  const dateAt = (days,hour,minute=0) => {
    const date = new Date(); date.setDate(date.getDate()+days); date.setHours(hour,minute,0,0);
    return `${toISODate(date)}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`;
  };
  const people = [
    {id:"DEMO-P1",nombre:"Camila",apellido:"Torres · Demo",rut:"DEMO-001",birth_date:"1988-05-12",conditions:["Hipertensión registrada · dato ficticio"],allergies:["Penicilina · antecedente ficticio"],medications:["Tratamiento habitual pendiente de conciliación"],reason:"Control y revisión de antecedentes",hour:9},
    {id:"DEMO-P2",nombre:"Diego",apellido:"Rojas · Demo",rut:"DEMO-002",birth_date:"1975-09-21",conditions:[],allergies:[],medications:[],reason:"Revisión de resultados",hour:10},
    {id:"DEMO-P3",nombre:"Elena",apellido:"Fuentes · Demo",rut:"DEMO-003",birth_date:"1996-02-08",conditions:[],allergies:[],medications:[],reason:"Consulta de seguimiento",hour:11}
  ];
  DATA.patients = people.map((p,index) => ({...p,id_paciente:p.id,_localDraft:true,_demo:true,sex:"No registrado",phone:"",email:"",personalHistory:["Antecedentes de ejemplo para explorar la ficha."],familyHistory:[],observations:[],preferences:[],consents:[],decisions:[],providers:[{name:"Valentina Demo",specialty:"Medicina general"}],documents:[],attentions:[{
    id:`DEMO-H${index}`,id_atencion:`DEMO-H${index}`,id_paciente:p.id,patient_id:p.id,rut:p.rut,patient_name:`${p.nombre} ${p.apellido}`,fecha_hora:dateAt(-30-index,10),date:dateAt(-30-index,10),motivo:"Atención anterior de demostración",reason:"Atención anterior de demostración",diagnostico:"Registro ficticio para mostrar el historial",observaciones:"Ejemplo de evaluación previa. Sin validez clínica.",status:"FINALIZADA",estado:"FINALIZADA",professional:"Valentina Demo",establishment:CURRENT_ESTABLISHMENT
  }]}));
  DATA.appointments = DATA.patients.map((p,index)=>(
    ({id:`DEMO-A${index}`,id_atencion:`DEMO-A${index}`,patient_id:p.id,id_paciente:p.id,rut:p.rut,patient_name:patientName(p),fecha_hora:dateAt(0,p.hour),date:dateAt(0,p.hour),motivo:p.reason,reason:p.reason,status:index===1?"BORRADOR":"PROGRAMADA",estado:index===1?"BORRADOR":"PROGRAMADA",professional:"Valentina Demo",specialty:"Medicina general",establishment:CURRENT_ESTABLISHMENT,duration:30,
    ...(index===1?{anamnesis:"El paciente trae antecedentes para revisión. Ejemplo ficticio.",observaciones:"Registro de demostración iniciado; completar durante el recorrido.",_dirty:true}: {})})
  ));
  DATA.appointments.push({...DATA.appointments[0],id:"DEMO-NEXT",id_atencion:"DEMO-NEXT",date:dateAt(2,12),fecha_hora:dateAt(2,12),reason:"Próximo control de ejemplo",motivo:"Próximo control de ejemplo"});
  DATA.attentions = DATA.patients.flatMap(p=>p.attentions);
  DATA.documents = [];
  attentionDrafts.clear();
  attentionDrafts.set("DEMO-A1",{...DATA.appointments[1]});
  selectedPatient = null; currentConsultation = null;
  applyDoctorIdentityToUI();
  $("loadError").hidden = true;
  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.innerHTML = `<div><strong>Demostración · datos ficticios</strong><span>Explora la jornada, abre una ficha y recorre la atención. Los cambios son temporales; no se envían a la API.</span></div><div class="demo-actions"><button type="button" class="secondary-button" id="demoStart">Probar una atención</button><button type="button" class="secondary-button" id="demoReset">Reiniciar demo</button><a href="index.html">Salir de la demo</a></div>`;
  document.querySelector('.page-surface').prepend(banner);
  $("demoStart").onclick = async()=>{await openRecord(DATA.patients[0]);};
  $("demoReset").onclick = ()=>{if(window.confirm("¿Reiniciar los datos ficticios y descartar los cambios de esta demostración?")){currentConsultation=null;attentionDrafts.clear();DATA.patients=[];location.reload();}};
  renderHome();renderPatients();renderCalendar();renderDocuments();renderConsultationView();renderFollowUpView();
  switchView("inicio");
}

/* =========================================================
   SafeMed and structured treatment helpers
   ========================================================= */

const medicationFields = [["name","Medicamento / principio activo"],["presentation","Presentación"],["dose","Dosis"],["route","Vía"],["frequency","Frecuencia"],["duration","Duración"]];

function medicationSummary(items = []) {
  return items.map((item,index) => `${index+1}. ${medicationFields.map(([key,label]) => `${label}: ${item[key] || "No registrado"}`).join(" · ")}`).join("\n");
}

function medicationMissing(items = []) {
  return items.flatMap((item,index) => medicationFields.filter(([key]) => !item[key]?.trim()).map(([,label]) => `Medicamento ${index+1}: ${label.toLowerCase()}`));
}

function captureMedications() {
  const rows = document.querySelectorAll("#medicationEditor [data-medication-row]");
  currentConsultation.medications_proposed = [...rows].map(row => Object.fromEntries([
    ["id",row.dataset.medicationRow], ...medicationFields.map(([key]) => [key,row.querySelector(`[data-medication-field="${key}"]`).value.trim()])
  ]));
  if ($("safeMedDecision")) currentConsultation.safemed_professional_note = $("safeMedDecision").value.trim();
}

/* =========================================================
   Clinical attention workflow
   ========================================================= */

const attentionDrafts = new Map();
let attentionStep = 0;
const attentionSteps = ["Evaluación", "Diagnóstico y plan", "Documentos", "Revisión"];
const clinicalFields = {
  consultReason: "motivo", consultObservations: "observaciones", consultHistory: "anamnesis", consultExam: "examen_fisico",
  consultDiagnosis: "diagnostico", consultTreatment: "tratamiento", consultIndications: "indicaciones", consultFollowDate: "fecha_control", consultFollowPlan: "plan_seguimiento"
};
const vitalFields = [["sistolica","PA sistólica","mmHg",1,350],["diastolica","PA diastólica","mmHg",1,250],["pulso","Frecuencia cardíaca","lpm",1,350],["respiratoria","Frecuencia respiratoria","rpm",1,150],["temperatura","Temperatura","°C",20,50],["saturacion","SpO₂","%",0,100],["peso","Peso","kg",0.1,700],["talla","Talla","cm",10,300]];

function attentionKey(item = currentConsultation) { return String(item?.id_atencion || item?.id || ""); }
function captureAttention() {
  if (!currentConsultation || !$("attentionForm") || $("attentionForm").dataset.attention !== attentionKey() || agendaStatusKey(currentConsultation) === "finalizada") return;
  for (const [id, field] of Object.entries(clinicalFields)) if ($(id)) currentConsultation[field] = $(id).value.trim();
  captureMedications();
  currentConsultation.signos_vitales = {...currentConsultation.signos_vitales};
  for (const [key] of vitalFields) { const input = $(`vital-${key}`); if (input) currentConsultation.signos_vitales[key] = input.value === "" ? null : Number(input.value); }
  currentConsultation.reason=currentConsultation.motivo; currentConsultation.observations=currentConsultation.observaciones; currentConsultation.diagnosis=currentConsultation.diagnostico; currentConsultation.treatment=currentConsultation.tratamiento; currentConsultation.instructions=currentConsultation.indicaciones; currentConsultation._step=attentionStep;
  attentionDrafts.set(attentionKey(), {...currentConsultation});
}
function preserveAttention() { captureAttention(); if (currentConsultation && !currentConsultation._serverSaved && agendaStatusKey(currentConsultation) !== "finalizada") attentionDrafts.set(attentionKey(), {...currentConsultation}); }
function canChangeAttention(nextKey) { if (clinicalAiLoading) { toast("Espera a que termine la solicitud de apoyo clínico."); return false; } if (!currentConsultation || attentionKey() === String(nextKey)) return true; preserveAttention(); return !currentConsultation._dirty || window.confirm("La atención actual tiene un borrador temporal. Se conservará mientras esta página esté abierta. ¿Cambiar de atención?"); }
function attentionField(id,label,rows=3) { const value=currentConsultation[clinicalFields[id]] || ""; return `<label class="full">${label}<textarea id="${id}" rows="${rows}">${escapeHTML(value)}</textarea></label>`; }

function renderDiagnosisWorkspace() {
  const c=currentConsultation;
  return `<div class="diagnosis-layout"><div class="diagnosis-editor"><details class="evaluation-reference"><summary>Consultar evaluación registrada</summary><dl class="review-grid">${[["Motivo",c.motivo],["Anamnesis",c.anamnesis],["Examen físico",c.examen_fisico],["Evaluación",c.observaciones]].map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHTML(value || "No registrado")}</dd></div>`).join("")}</dl></details>${attentionField("consultDiagnosis","Diagnóstico o impresión clínica *")}${attentionField("consultTreatment","Plan terapéutico y medidas no farmacológicas")}<section class="medication-section"><h4>Medicamentos propuestos</h4><p class="muted">Registra cada medicamento. Estos cambios no modifican todavía el tratamiento activo de la ficha.</p><div id="medicationEditor">${(c.medications_proposed || []).map((item,index)=>`<article class="medication-row" data-medication-row="${escapeHTML(item.id)}"><div class="medication-heading"><strong>Medicamento ${index+1}</strong><button type="button" class="secondary-button" data-remove-medication="${escapeHTML(item.id)}" aria-label="Quitar medicamento ${index+1}">Quitar</button></div><div class="medication-fields">${medicationFields.map(([key,label])=>`<label>${label}<input data-medication-field="${key}" value="${escapeHTML(item[key] || "")}" autocomplete="off"></label>`).join("")}</div></article>`).join("") || '<p class="muted">No se han agregado medicamentos.</p>'}</div><button type="button" class="secondary-button" id="addMedication">+ Agregar medicamento</button></section>${attentionField("consultIndications","Indicaciones para el paciente")}<label>Fecha propuesta de control<input id="consultFollowDate" type="date" value="${escapeHTML(c.fecha_control || "")}"></label>${attentionField("consultFollowPlan","Seguimiento y pendientes")}<p class="muted">La fecha propuesta no reserva una cita.</p></div><aside class="safemed-panel"><p class="eyebrow">APOYO A LA DECISIÓN</p><h3>SafeMed</h3><span class="safemed-state">Pendiente de conexión</span><section><h4>Apoyo diagnóstico</h4><p>Hallazgos, hipótesis a considerar, información faltante y posibles evaluaciones, con fundamentos y fuentes.</p><button type="button" class="secondary-button" disabled>Analizar evaluación</button></section><section><h4>Seguridad del tratamiento</h4><p>Revisión de medicamentos propuestos frente a alergias y tratamientos registrados.</p><p><strong>Alergias registradas:</strong> ${escapeHTML(selectedPatient.allergies?.join(" · ") || "Sin información; verificar")}</p><p><strong>Medicamentos activos:</strong> ${escapeHTML(selectedPatient.medications?.join(" · ") || "Sin información; verificar")}</p><button type="button" class="secondary-button" disabled>Revisar medicamentos</button></section><p class="safemed-notice">No se ha realizado un análisis. No hay recomendaciones ni comprobación de interacciones disponibles.</p><label>Consideraciones del profesional<textarea id="safeMedDecision" rows="4" placeholder="Fundamentos o aspectos que requieren revisión…">${escapeHTML(c.safemed_professional_note || "")}</textarea></label><small>Nota del profesional; no constituye una validación de SafeMed.</small></aside></div>`;
}

function bindMedicationEditor() {
  $("addMedication")?.addEventListener("click", () => { captureAttention(); currentConsultation.medications_proposed.push({id:crypto.randomUUID()}); currentConsultation._dirty=true; renderAttentionWorkflow(); document.querySelector('#medicationEditor [data-medication-row]:last-child input')?.focus(); });
  document.querySelectorAll("[data-remove-medication]").forEach(button => button.addEventListener("click", () => { captureAttention(); const item=currentConsultation.medications_proposed.find(item=>item.id===button.dataset.removeMedication); if (medicationFields.some(([key])=>item[key]) && !window.confirm("¿Quitar este medicamento del tratamiento propuesto? Los borradores de recetas ya creados conservarán su contenido.")) return; currentConsultation.medications_proposed=currentConsultation.medications_proposed.filter(item=>item.id!==button.dataset.removeMedication); currentConsultation._dirty=true; renderAttentionWorkflow(); }));
}

function renderTreatmentReview() {
  const c=currentConsultation, meds=c.medications_proposed || [], missing=medicationMissing(meds), docs=(selectedPatient.documents || []).filter(doc=>doc._localDraft && String(doc.id_atencion)===attentionKey()), stale=docs.filter(doc=>doc.type==="RECETA" && JSON.stringify(medicationComparisonSnapshot(doc.medications || []))!==JSON.stringify(medicationComparisonSnapshot(meds)));
  return `<section class="treatment-review"><h4>Tratamiento propuesto</h4><pre>${escapeHTML(medicationSummary(meds) || "Sin medicamentos propuestos")}</pre>${missing.length ? `<p class="workflow-missing">Completar: ${escapeHTML(missing.join("; "))}.</p>` : ""}<h4>Revisión SafeMed</h4><p class="workflow-notice">No realizada · apoyo diagnóstico y revisión farmacológica pendientes de conexión.</p><p><strong>Consideraciones del profesional:</strong> ${escapeHTML(c.safemed_professional_note || "No registradas")}</p><h4>Documentos de la atención</h4><p>${docs.length} borrador(es) preparado(s).</p>${stale.length ? '<p class="workflow-missing">El tratamiento cambió respecto de una receta preparada. Revisa y prepara un nuevo borrador antes de emitir.</p>' : ""}<h4>Pendientes</h4><p>${escapeHTML(c.plan_seguimiento || "Sin seguimiento registrado")}</p></section>`;
}

function bindWorkflowContextToggle() {
  const layout = document.querySelector(".workflow-layout");
  const context = layout?.querySelector(".workflow-context");
  const workspace = layout?.querySelector(".workflow-workspace");
  if (!layout || !context || !workspace || workspace.querySelector("#toggleWorkflowContext")) return;

  const button = document.createElement("button");
  button.id = "toggleWorkflowContext";
  button.type = "button";
  button.className = "secondary-button workflow-context-toggle";
  button.textContent = "Ocultar panel";
  workspace.insertBefore(button, workspace.firstElementChild);
  button.addEventListener("click", () => {
    const collapsed = layout.classList.toggle("context-collapsed");
    button.textContent = collapsed ? "Mostrar contexto" : "Ocultar panel";
    button.setAttribute("aria-expanded", String(!collapsed));
  });
}

function renderAttentionWorkflow() {
  const container=$("consultationContent");
  if (!currentConsultation || !selectedPatient) { container.innerHTML=`<section class="panel workflow-empty"><p class="eyebrow">ATENCIÓN CLÍNICA</p><h2>Selecciona al paciente que vas a atender</h2><p>Revisa su ficha antes de iniciar el registro clínico.</p><button class="primary-button" onclick="switchView('agenda')">Ir a la agenda</button> <button class="secondary-button" onclick="switchView('pacientes')">Buscar paciente</button></section>`; return; }
  const c=currentConsultation; attentionStep=c._step || 0; const summary=currentClinicalSummary(); for (const [field,value] of Object.entries({motivo:summary.reason,observaciones:summary.observations,diagnostico:summary.diagnosis,tratamiento:summary.treatment,indicaciones:summary.indications})) if (c[field]==null) c[field]=value;
  const closed=c._serverSaved || agendaStatusKey(c)==="finalizada", list=(values,fallback)=>escapeHTML(values?.length ? values.join(" · ") : fallback);
  container.innerHTML=`<section class="workflow-shell"><header class="panel workflow-patient"><div><p class="eyebrow">PACIENTE EN ATENCIÓN</p><h2>${escapeHTML(patientName(selectedPatient))}</h2><p>RUT ${escapeHTML(patientRut(selectedPatient) || "No registrado")} · ${escapeHTML(calculateAge(patientBirthDate(selectedPatient)) || "Edad no registrada")}</p></div><button class="secondary-button" type="button" data-open-patient="${escapeHTML(selectedPatient.id || selectedPatient.id_paciente)}">Revisar ficha</button><div class="workflow-allergies"><strong>Alergias registradas</strong><span>${list(selectedPatient.allergies,"Sin información registrada · verificar con el paciente")}</span></div></header><div class="workflow-notice" role="status">${closed ? "Atención finalizada · consulta de solo lectura." : "Los cambios permanecen locales hasta que selecciones Guardar borrador."}</div><div class="workflow-layout ${attentionStep===1 ? "diagnosis-active" : ""}"><aside class="panel workflow-context"><p class="eyebrow">CONTEXTO CLÍNICO</p><h3>Antes de registrar</h3><dl><dt>Condiciones</dt><dd>${list(selectedPatient.conditions,"Sin información registrada")}</dd><dt>Medicamentos</dt><dd>${list(selectedPatient.medications,"Sin información registrada")}</dd><dt>Profesional</dt><dd>${escapeHTML(doctorFullName())}</dd><dt>Establecimiento</dt><dd>${escapeHTML(CURRENT_ESTABLISHMENT)}</dd></dl><p class="muted">Confirma antecedentes y tratamientos con el paciente.</p></aside><div class="panel workflow-workspace"><nav class="workflow-steps" aria-label="Etapas de la atención">${attentionSteps.map((name,i)=>`<button type="button" data-attention-step="${i}" ${i===attentionStep?'aria-current="step"':""}><span>${i+1}</span>${name}</button>`).join("")}</nav><form id="attentionForm" data-attention="${escapeHTML(attentionKey())}" novalidate><fieldset ${closed?"disabled":""}><section class="workflow-stage" data-stage="0" ${attentionStep!==0?"hidden":""}><p class="eyebrow">PASO 1 DE 4</p><h3>Evaluación clínica</h3><p class="muted">Registra el motivo, la historia y los hallazgos de esta atención.</p><label>Motivo de consulta *<input id="consultReason" value="${escapeHTML(c.motivo)}" required></label>${attentionField("consultHistory","Anamnesis",4)}<h4>Signos vitales <small>Opcionales · registrar solo mediciones disponibles</small></h4><div class="vitals-grid">${vitalFields.map(([key,label,unit,min,max])=>`<label>${label} (${unit})<input id="vital-${key}" type="number" step="any" min="${min}" max="${max}" value="${escapeHTML(c.signos_vitales?.[key] ?? "")}"></label>`).join("")}</div>${attentionField("consultExam","Examen físico",4)}${attentionField("consultObservations","Evaluación y observaciones *",4)}</section><section class="workflow-stage" data-stage="1" ${attentionStep!==1?"hidden":""}><p class="eyebrow">PASO 2 DE 4</p><h3>Diagnóstico y plan</h3><p class="muted">Decisiones registradas por el profesional responsable.</p>${renderDiagnosisWorkspace()}</section><section class="workflow-stage" data-stage="2" ${attentionStep!==2?"hidden":""}><p class="eyebrow">PASO 3 DE 4</p><h3>Documentos de esta atención</h3><p class="muted">Prepara los documentos necesarios. Puedes continuar sin agregar documentos.</p><div class="workflow-notice">Los documentos quedan preparados; al finalizar la atención la Lambda genera los PDF, los sube a S3 y los registra en la ficha clínica.</div><div class="clinical-document-actions">${[["RECETA","Receta"],["ORDEN_EXAMEN","Orden de examen"],["DERIVACION","Derivación"],["INDICACIONES","Indicaciones"]].map(([type,label])=>`<button type="button" class="secondary-button" data-create-document="${type}">${label}</button>`).join("")}</div>${renderAttentionDocuments(selectedPatient,c)}</section><section class="workflow-stage" data-stage="3" ${attentionStep!==3?"hidden":""}><p class="eyebrow">PASO 4 DE 4</p><h3>Revisión de la atención</h3><p class="muted">Verifica la identidad del paciente y el contenido antes del cierre.</p><div id="attentionReview"></div><div class="workflow-notice">${closed?"Registro finalizado.":"Al finalizar, la atención y sus documentos se guardan en este navegador."}</div><button class="primary-button" type="button" ${closed?"disabled":""}>${closed?"Atención finalizada":"Finalizar atención"}</button></section></fieldset></form><footer class="workflow-actions"><span id="draftStatus" role="status">${closed?"Solo lectura":c._dirty?"Cambios sin guardar":"Borrador guardado en este navegador"}</span><div><button class="secondary-button" id="saveWorkflowDraft" type="button" ${closed?"disabled":""}>Guardar borrador</button><button class="secondary-button" id="previousAttentionStep" type="button" ${attentionStep===0?"hidden":""}>Anterior</button><button class="primary-button" id="nextAttentionStep" type="button" ${attentionStep===3?"hidden":""}>${attentionStep===2?"Revisar atención":"Continuar"}</button></div></footer></div></div></section>`;
  renderAttentionReview();
  const finalizeButton = [...container.querySelectorAll("button")].find(button => button.textContent.includes("Finalizar atención"));
  if (finalizeButton) {
    finalizeButton.disabled = closed;
    finalizeButton.textContent = closed ? "Atención finalizada" : "Finalizar atención";
    finalizeButton.addEventListener("click", finalizeCurrentAttention);
  }
  bindWorkflowContextToggle();
  container.querySelectorAll("[data-attention-step]").forEach(button=>button.addEventListener("click",()=>changeAttentionStep(Number(button.dataset.attentionStep))));
  $("previousAttentionStep").onclick=()=>changeAttentionStep(attentionStep-1); $("nextAttentionStep").onclick=()=>changeAttentionStep(attentionStep+1); $("attentionForm").onsubmit=event=>event.preventDefault();
  $("attentionForm").addEventListener("input",()=>{c._dirty=true;c.estado="BORRADOR";c.status="BORRADOR";captureAttention();$("draftStatus").textContent="Cambios sin guardar";});
  $("saveWorkflowDraft").onclick=async()=>{
    captureAttention();
    const button = $("saveWorkflowDraft");
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      if (!DEMO_MODE) await saveAttentionToAPI(currentConsultation);
      c._dirty = false;
      attentionDrafts.delete(attentionKey());
      const currentId = attentionKey();
      selectedPatient.attentions = (selectedPatient.attentions || []).map(item =>
        String(item.id_atencion || item.id) === currentId ? { ...item, ...c } : item
      );
      DATA.attentions = DATA.patients.flatMap(patient =>
        Array.isArray(patient.attentions) ? patient.attentions : []
      );
      $("draftStatus").textContent = `Borrador guardado a las ${new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}`;
      toast(DEMO_MODE ? "Borrador actualizado en la demostración." : "Borrador guardado en este navegador.");
    } catch (error) {
      c._dirty = true;
      $("draftStatus").textContent = "No se pudo guardar el borrador";
      toast(error.message || "No fue posible guardar el borrador.");
    } finally {
      button.disabled = false;
      button.textContent = "Guardar borrador";
    }
  };
  bindMedicationEditor();
  bindSafeMedActions();
  if (typeof enhanceDemoFlow === "function") enhanceDemoFlow();
}
function changeAttentionStep(step) { if (step>attentionStep) { const invalid=[...document.querySelectorAll(`[data-stage="${attentionStep}"] input`)].find(input=>!input.checkValidity()); if (invalid) { invalid.reportValidity(); return; } } captureAttention(); currentConsultation._step=Math.max(0,Math.min(3,step)); renderAttentionWorkflow(); document.querySelector(`[data-stage="${currentConsultation._step}"] h3`)?.scrollIntoView({block:"center"}); }
function renderAttentionReview() { const c=currentConsultation, fields=[["Motivo",c.motivo],["Anamnesis",c.anamnesis],["Examen físico",c.examen_fisico],["Evaluación",c.observaciones],["Diagnóstico",c.diagnostico],["Tratamiento",c.tratamiento],["Indicaciones",c.indicaciones],["Fecha propuesta de control",c.fecha_control],["Seguimiento",c.plan_seguimiento]], missing=[["motivo","motivo"],["observaciones","evaluación"],["diagnostico","diagnóstico"]].filter(([key])=>!c[key]?.trim()).map(([,label])=>label); $("attentionReview").innerHTML=`${missing.length?`<p class="workflow-missing">Falta completar: ${missing.join(", ")}.</p>`:'<p class="workflow-complete">Los campos clínicos mínimos están completos.</p>'}<dl class="review-grid">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHTML(value || "No registrado")}</dd></div>`).join("")}<div><dt>Signos vitales</dt><dd>${vitalFields.filter(([key])=>c.signos_vitales?.[key]!=null).map(([key,label,unit])=>`${label}: ${escapeHTML(c.signos_vitales[key])} ${unit}`).join(" · ") || "No registrados"}</dd></div></dl>${renderTreatmentReview()}`; }
window.addEventListener("beforeunload",event=>{if(currentConsultation?._dirty || [...attentionDrafts.values()].some(item=>item._dirty) || DATA.patients.some(patient=>patient._localDraft||patient.documents?.some(doc=>doc._localDraft))){event.preventDefault();event.returnValue="";}});




/* =========================================================
   START APPLICATION
   ========================================================= */

console.log("VIK Doctor app.js loaded");

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("VIK Doctor DOM loaded");
    initialize();
  });
} else {
  console.log("VIK Doctor DOM already ready");
  initialize();
}
