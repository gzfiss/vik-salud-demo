"use strict";

const DOCTOR_API_URL =
  "demo:doctor";

// API dedicada de SafeMed. Usa exclusivamente Amazon Nova 2 Lite en backend.
const SAFEMED_API_URL =
  "demo:safemed-doctor";

/* =========================================================
   API
   ========================================================= */

function convertApiPatient(data) {
  const patient = data?.paciente;

  if (!patient) {
    throw new Error("La API no devolvió información del paciente.");
  }

  const resources = Array.isArray(data.recursos_clinicos)
    ? data.recursos_clinicos
    : [];

  const attentions = Array.isArray(data.atenciones)
    ? data.atenciones
    : [];

  const normalizeType = value => String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase();

  const byType = (...types) => {
    const accepted = new Set(types.map(normalizeType));
    return resources.filter(resource => accepted.has(normalizeType(resource.tipo_recurso)));
  };

  const allergies = byType("Alergia", "Alergias")
    .map(resource => resource.nombre)
    .filter(Boolean);

  const conditions = byType("Condición", "Condicion", "Condición médica")
    .filter(resource =>
      ["Condición", "Condicion", "Condición médica"].includes(
        resource.tipo_recurso
      )
    )
    .map(resource => resource.nombre)
    .filter(Boolean);

  const medications = byType("Medicamento", "Medicamentos")
    .map(resource => {
      const details = [
        resource.dosis,
        resource.frecuencia
      ].filter(Boolean);

      return details.length
        ? `${resource.nombre} · ${details.join(" · ")}`
        : resource.nombre;
    })
    .filter(Boolean);

  const convertedAttentions = attentions.map(attention => {
    const professional = attention.profesional || {};
    const establishment = attention.establecimiento || {};

    return {
      id: attention.id_atencion,
      id_atencion: attention.id_atencion,
      patient_id: patient.id_paciente,
      id_paciente: patient.id_paciente,
      patient_name: [patient.nombre, patient.apellido].filter(Boolean).join(" "),
      rut: patient.rut || "",
      date: attention.fecha_hora,
      fecha_hora: attention.fecha_hora,
      specialty: professional.especialidad || "",
      especialidad: professional.especialidad || "",
      reason: attention.motivo || "",
      motivo: attention.motivo || "",
      diagnosis: attention.diagnostico || "",
      diagnostico: attention.diagnostico || "",
      notes: attention.resumen || "",
      notas: attention.resumen || "",
      instructions: attention.indicaciones || "",
      indicaciones: attention.indicaciones || "",
      observations: attention.observaciones || "",
      observaciones: attention.observaciones || "",
      anamnesis: attention.anamnesis || "",
      examen_fisico: attention.examen_fisico || "",
      tratamiento: attention.tratamiento || "",
      signos_vitales: attention.signos_vitales || {},
      plan_seguimiento: attention.plan_seguimiento || "",
      fecha_control: attention.fecha_control || "",
      status: attention.estado || "",
      estado: attention.estado || "",
      duration: attention.duracion_minutos || null,
      duracion_minutos: attention.duracion_minutos || null,
      modality: attention.modalidad || "",
      modalidad: attention.modalidad || "",
      professional_id: professional.id_profesional || null,
      id_profesional: professional.id_profesional || null,
      professional: [
        professional.nombre,
        professional.apellido
      ].filter(Boolean).join(" "),
      establishment_id: establishment.id_establecimiento || null,
      id_establecimiento: establishment.id_establecimiento || null,
      establishment: establishment.nombre || "",
      establecimiento: establishment.nombre || ""
    };
  });

  const documents = resources
    .filter(resource => resource.s3_key && resource.mime_type)
    .map(resource => ({
      id: resource.id_recurso,
      id_recurso: resource.id_recurso,
      id_atencion: resource.id_atencion || null,
      name: resource.nombre || "Documento clínico",
      type: resource.tipo_recurso || "Documento",
      tipo_recurso: resource.tipo_recurso || "Documento",
      date: resource.fecha_registro || resource.fecha_actualizacion || "",
      fecha_registro: resource.fecha_registro || "",
      s3_key: resource.s3_key,
      mime_type: resource.mime_type,
      status: resource.estado || "Activo",
      estado: resource.estado || "Activo",
      metadata: resource.metadata || {}
    }));

  const resourceValues = types => byType(...types)
    .map(resource => resource.nombre || resource.descripcion)
    .filter(Boolean);

  return {
    id: patient.id_paciente,
    id_paciente: patient.id_paciente,

    rut: patient.rut,

    name: patient.nombre,
    first_name: patient.nombre,
    nombre: patient.nombre,

    last_name: patient.apellido,
    apellido: patient.apellido,

    birth_date: patient.fecha_nacimiento,
    fecha_nacimiento: patient.fecha_nacimiento,

    sex: patient.sexo,
    sexo: patient.sexo,

    nationality: patient.nacionalidad,
    nacionalidad: patient.nacionalidad,

    ethnicity: patient.etnia,
    etnia: patient.etnia,

    religion: patient.religion,

    blood_type: patient.grupo_sanguineo,
    grupo_sanguineo: patient.grupo_sanguineo,

    email: patient.correo,
    correo: patient.correo,

    phone: patient.telefono,
    telefono: patient.telefono,

    qr: patient.codigo_qr_emergencia,
    qr_activo: patient.qr_activo,

    establishment:
      patient.establecimiento ||
      CURRENT_ESTABLISHMENT,

    establecimiento:
      patient.establecimiento ||
      CURRENT_ESTABLISHMENT,

    allergies,
    conditions,
    medications,

    personalHistory: resourceValues(["AntecedentePersonal"]),
    familyHistory: resourceValues(["AntecedenteFamiliar"]),
    observations: resourceValues(["Observacion", "Observación"]),
    decisions: resourceValues(["Decision", "Decisión"]),
    preferences: resourceValues(["Preferencia"]),
    consents: resourceValues(["Consentimiento"]),

    providers: attentions
      .map(attention => attention.profesional)
      .filter(Boolean)
      .map(professional => ({
        name: [
          professional.nombre,
          professional.apellido
        ].filter(Boolean).join(" "),
        specialty: professional.especialidad || ""
      })),

    documents,

    attentions: convertedAttentions,

    _source: "Demo local"
  };
}

async function loadPatientFromAPI(rut) {
  if (!DEMO_MODE) await requireClinicalAccessFromAPI(rut);
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rut,
      doctor_rut: CURRENT_DOCTOR_RUT
    })
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("La API devolvió una respuesta no válida.");
  }

  let result = data;
  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta de la ficha no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (!response.ok || result.error) {
    throw new Error(
      result.error ||
      `Error de la API (${response.status}).`
    );
  }

  return convertApiPatient(result);
}



/* =========================================================
   UPDATE PATIENT API
   ========================================================= */

async function updatePatientInAPI(rut, doctorRut, cambios) {
  const response = await doctorFetch(
    DOCTOR_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "update_patient",
        rut,
        doctor_rut: doctorRut,
        cambios
      })
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("La API devolvió una respuesta no válida.");
  }

  let result = data;

  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta de la API no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.mensaje ||
      result.error ||
      "No fue posible actualizar la información."
    );
  }

  return result;
}

/* =========================================================
   PATIENT CREATION API
   The Lambda assigns the persistent id_paciente. The portal
   must not present a local draft as a registered patient.
   ========================================================= */

async function createPatientInAPI(patient) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "create_patient",
      doctor_rut: CURRENT_DOCTOR_RUT,
      ...patient
    })
  });

  return parseDoctorResult(
    response,
    "No fue posible registrar el paciente en la base de datos"
  );
}




/* =========================================================
   DOCTOR PROFILE API
   Valida el RUT de la sesión contra almacén local y devuelve
   únicamente el profesional autenticado.
   ========================================================= */

async function loadDoctorProfileFromAPI(doctorRut) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "doctor_profile",
      rut: doctorRut
    })
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("La API del profesional devolvió una respuesta no válida.");
  }

  let result = data;

  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta del profesional no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.error ||
      result.mensaje ||
      `No fue posible validar el profesional (${response.status}).`
    );
  }

  if (!result.profesional || !result.profesional.rut) {
    throw new Error("La API no devolvió los datos del profesional.");
  }

  return result.profesional;
}

/* =========================================================
   DOCTOR AGENDA API
   ========================================================= */

async function loadDoctorAgendaFromAPI(doctorRut, fecha, fechaFin = "") {
  const isRange = Boolean(fechaFin && fechaFin !== fecha);
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(isRange ? {
      action: "agenda_doctor",
      rut: doctorRut,
      fecha_inicio: fecha,
      fecha_fin: fechaFin
    } : {
      action: "agenda_doctor",
      rut: doctorRut,
      fecha
    })
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("La API de agenda devolvió una respuesta no válida.");
  }

  let result = data;

  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta de agenda no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (isRange && result.accion !== "agenda_doctor_rango") {
    const error = new Error("La Lambda todavía no tiene habilitada la agenda por rango.");
    error.code = "AGENDA_RANGE_UNSUPPORTED";
    throw error;
  }

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.error ||
      result.mensaje ||
      `No fue posible cargar la agenda (${response.status}).`
    );
  }

  const citas = Array.isArray(result.citas) ? result.citas : [];

  return citas.map(cita => ({
    id: cita.id_atencion,
    id_atencion: cita.id_atencion,
    patient_id: cita.id_paciente,
    id_paciente: cita.id_paciente,
    patient_name: cita.paciente || "Paciente",
    rut: cita.rut || "",
    patient_rut: cita.rut || "",
    date: cita.fecha_hora,
    fecha_hora: cita.fecha_hora,
    reason: cita.motivo || "",
    motivo: cita.motivo || "",
    notes: cita.resumen || "",
    resumen: cita.resumen || "",
    status: cita.estado || "PROGRAMADA",
    estado: cita.estado || "PROGRAMADA",
    diagnosis: cita.diagnostico || "",
    diagnostico: cita.diagnostico || "",
    instructions: cita.indicaciones || "",
    indicaciones: cita.indicaciones || "",
    specialty: cita.profesional?.especialidad || "Medicina General",
    especialidad: cita.profesional?.especialidad || "Medicina General",
    professional_id: cita.profesional?.id_profesional || null,
    id_profesional: cita.profesional?.id_profesional || null,
    professional: [
      cita.profesional?.nombre,
      cita.profesional?.apellido
    ].filter(Boolean).join(" "),
    professional_rut: cita.profesional?.rut || "",
    professional_name: cita.profesional?.nombre || "",
    professional_last_name: cita.profesional?.apellido || "",
    establishment_id: cita.establecimiento?.id_establecimiento || null,
    id_establecimiento: cita.establecimiento?.id_establecimiento || null,
    establishment: cita.establecimiento?.nombre || "",
    establecimiento: cita.establecimiento?.nombre || "",
    duration: cita.duracion_minutos || 30,
    duracion_minutos: cita.duracion_minutos || 30,
    modality: cita.modalidad || "Presencial",
    modalidad: cita.modalidad || "Presencial"
  }));
}

async function loadDoctorAgendaMonthFromAPI(doctorRut, month) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "agenda_doctor_month", rut: doctorRut, mes: month })
  });
  const result = await parseDoctorResult(response, "No fue posible cargar la agenda mensual");
  if (result.accion !== "agenda_doctor_month") {
    throw new Error("La API no confirmó la agenda mensual solicitada.");
  }
  return (Array.isArray(result.citas) ? result.citas : []).map(cita => ({
    ...cita,
    id: cita.id_atencion,
    id_atencion: cita.id_atencion,
    patient_id: cita.id_paciente,
    id_paciente: cita.id_paciente,
    patient_name: cita.paciente || "Paciente",
    patient_rut: cita.rut || "",
    date: cita.fecha_hora,
    reason: cita.motivo || "",
    status: cita.estado || "PROGRAMADA",
    specialty: cita.profesional?.especialidad || "Medicina General",
    professional_id: cita.profesional?.id_profesional || null,
    professional_rut: cita.profesional?.rut || "",
    professional_name: cita.profesional?.nombre || "",
    professional_last_name: cita.profesional?.apellido || "",
    establishment: cita.establecimiento?.nombre || "",
    duration: cita.duracion_minutos || 30,
    modality: cita.modalidad || "Presencial"
  }));
}

/* =========================================================
   CLINICAL DECISION SUPPORT (AI)
   Contrato frontend para una Lambda/Bedrock dedicada.
   La IA entrega recomendaciones de apoyo; nunca escribe el
   diagnóstico profesional ni recibe identificadores directos.
   ========================================================= */

async function requestClinicalRecommendations(context) {
  // SafeMed puede probarse en demo porque el contexto es ficticio y anonimizado.
  const request = DEMO_MODE ? window.VIKDemo.fetch : doctorFetch;
  const response = await request(SAFEMED_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "clinical_recommendations",
      context
    })
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error("El servicio de apoyo clínico devolvió una respuesta no válida.");
  }

  let result = data;

  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta del servicio de apoyo clínico no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (!response.ok || result.success !== true) {
    throw new Error(
      result.error ||
      result.mensaje ||
      "El servicio de recomendaciones clínicas aún no está disponible."
    );
  }

  return result.recommendations || result.recomendaciones || result;
}

/* =========================================================
   ATTENTION PERSISTENCE CONTRACT
   Preparado para conectar la escritura del registro clínico.
   ========================================================= */

async function saveAttentionToAPI(payload) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "save_attention",
      doctor_rut: CURRENT_DOCTOR_RUT,
      attention: payload
    })
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error("La API de atención devolvió una respuesta no válida.");
  }

  let result = data;
  if (typeof data.body === "string") {
    try {
      result = JSON.parse(data.body);
    } catch {
      throw new Error("La respuesta de guardado no pudo interpretarse.");
    }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }

  if (!response.ok || result.success !== true) {
    throw new Error(result.error || result.mensaje || "No fue posible guardar la atención en la base de datos.");
  }

  return result;
}

async function finalizeAttentionToAPI(payload) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "finalizar_atencion",
      doctor_rut: CURRENT_DOCTOR_RUT,
      ...payload
    })
  });
  return parseDoctorResult(response, "No fue posible finalizar la atención");
}

/* =========================================================
   CLINICAL DOCUMENTS / S3
   The browser never receives a public S3 URL. The Doctor API
   creates a prefixed key, signs the PUT, and registers the
   resource after the upload succeeds.
   ========================================================= */

async function createFollowupRequestToAPI(payload) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "crear_solicitud_seguimiento",
      doctor_rut: CURRENT_DOCTOR_RUT,
      ...payload
    })
  });
  return parseDoctorResult(response, "No fue posible crear la solicitud de seguimiento");
}

/* Estado de consentimiento consultado al backend antes de cargar la ficha.
 * Este control de interfaz NO reemplaza autenticación y autorización en Lambda.
 */
function normalizeClinicalAccessStatus(result) {
  const raw = String(result?.estado_efectivo || result?.estado || "SIN_SOLICITUD").trim().toUpperCase();
  if (raw === "APROBADA") {
    const expires = String(result?.fecha_expiracion || "").trim();
    // Si el contrato antiguo no entrega fecha, no afirmamos consentimiento vigente.
    if (!expires) return "EXPIRADA";
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(expires);
    const parsed = new Date(hasOffset ? expires : `${expires}Z`).getTime();
    if (!Number.isFinite(parsed) || parsed <= Date.now()) return "EXPIRADA";
  }
  if (["APROBADA", "PENDIENTE", "RECHAZADA", "REVOCADA", "EXPIRADA", "SIN_SOLICITUD"].includes(raw)) return raw;
  return "SIN_SOLICITUD";
}

async function inspectClinicalAccessFromAPI(rut) {
  if (!rut || typeof rut !== "string") throw new Error("No hay RUT de paciente válido para consultar el permiso.");
  const result = await getClinicalAccessStatusFromAPI({ rut });
  if (!result || result.success !== true) throw new Error("La API no pudo confirmar el permiso clínico.");
  return { ...result, estado_efectivo: normalizeClinicalAccessStatus(result) };
}

async function requireClinicalAccessFromAPI(rut) {
  const status = await inspectClinicalAccessFromAPI(rut);
  if (status.estado_efectivo === "APROBADA") return status;
  if (typeof showClinicalAccessDialog === "function") showClinicalAccessDialog(rut, status);
  const error = new Error("Esta ficha requiere una autorización vigente del paciente. Consulta la solicitud de acceso.");
  error.code = "VIK_ACCESS_REQUIRED";
  error.estado = status.estado_efectivo;
  throw error;
}

async function requestClinicalAccessToAPI({ rut, doctor_rut = CURRENT_DOCTOR_RUT }) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "solicitar_acceso_clinico", rut, doctor_rut })
  });
  return parseDoctorResult(response, "No fue posible solicitar acceso a la ficha");
}

async function getClinicalAccessStatusFromAPI({ rut, doctor_rut = CURRENT_DOCTOR_RUT }) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "consultar_estado_acceso_clinico", rut, doctor_rut })
  });
  return parseDoctorResult(response, "No fue posible consultar el permiso clínico");
}

async function resolveFollowupRequestToAPI({ rut, id_solicitud, estado, motivo_rechazo = "" }) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolver_solicitud_seguimiento", rut, id_solicitud, estado, motivo_rechazo, doctor_rut: CURRENT_DOCTOR_RUT })
  });
  return parseDoctorResult(response, "No fue posible resolver la solicitud");
}

async function parseDoctorResult(response, fallbackMessage) {
  let data = {};
  try { data = await response.json(); } catch { throw new Error(fallbackMessage); }
  let result = data;
  if (typeof data.body === "string") {
    try { result = JSON.parse(data.body); } catch { throw new Error(fallbackMessage); }
  } else if (data.body && typeof data.body === "object") {
    result = data.body;
  }
  if (!response.ok || result.success === false || result.error) {
    throw new Error(result.error || result.mensaje || `${fallbackMessage} (${response.status}).`);
  }
  return result;
}

async function generarSubidaDocumento({ rut, doctor_rut, id_atencion, tipo_recurso, nombre_archivo, mime_type }) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generar_subida_documento", rut, doctor_rut, id_atencion,
      tipo_recurso, nombre_archivo, mime_type
    })
  });
  return parseDoctorResult(response, "No fue posible preparar la subida del documento");
}

async function registrarDocumento({ rut, doctor_rut, id_atencion, tipo_recurso, nombre, descripcion, s3_key, mime_type }) {
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "registrar_documento", rut, doctor_rut, id_atencion,
      tipo_recurso, nombre, descripcion, s3_key, mime_type
    })
  });
  return parseDoctorResult(response, "No fue posible registrar el documento");
}

async function getDocument(id_recurso, rut, doctor_rut) {
  if (!DEMO_MODE) await requireClinicalAccessFromAPI(rut);
  const response = await doctorFetch(DOCTOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_document", id_recurso, rut, doctor_rut })
  });
  return parseDoctorResult(response, "No fue posible abrir el documento");
}

async function doctorFetch(url, options = {}) {
  if (DEMO_MODE) throw new Error("Demostración: esta operación no está conectada. No se enviaron datos al servidor.");
  // En el stage con Cognito, VIK_AUTH será un proveedor de sesión en memoria
  // registrado por login (no usar RUT/rol de sessionStorage como credenciales).
  const getAccessToken = window.VIK_AUTH?.getAccessToken;
  const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
  const headers = new Headers(options.headers || {});
  if (typeof token === "string" && token) headers.set("Authorization", `Bearer ${token}`);
  return window.VIKDemo.fetch(url, { ...options, headers });
}
