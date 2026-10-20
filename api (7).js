"use strict";
// SafeMed API configured. Responses are validated before showing AI results.
window.VIKSafeMedConfig = Object.freeze({
  enabled: true,
  endpoint: 'demo:safemed-paciente',
  timeoutMs: 25000,
  timeZone: 'America/Santiago'
});

"use strict";

// ============================================================
// VIK SALUD · API PACIENTE
// Este archivo SOLO se encarga de hablar con el adaptador local.
// Flujo actual: Portal paciente -> API Gateway -> Lambda -> almacén local.
// ============================================================

window.VIKApi = (() => {
  const API_URL = 'demo:paciente';
  // SafeMed configuration is defined at the beginning of this file.
  const ACCESS_API_URL = API_URL;

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const formatDate = value => {
    if (!value) return 'No informada';
    const raw = String(value).slice(0, 10);
    const parsed = new Date(raw + 'T12:00:00');
    if (Number.isNaN(parsed.getTime())) return 'No informada';
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(parsed);
  };

  function obtenerRutSesion() {
    let user = {};
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of ['vikSession', 'vikUser']) {
        try {
          const parsed = JSON.parse(storage.getItem(key) || '{}');
          if (parsed && typeof parsed === 'object' && parsed.rut) { user = parsed; break; }
        } catch {}
      }
      if (user.rut) break;
    }
    const rut = sessionStorage.getItem('vikRut') || sessionStorage.getItem('rut') || user.rut || localStorage.getItem('vikRut');
    const role = sessionStorage.getItem('vikRole') || sessionStorage.getItem('rol') || user.rol || user.role || localStorage.getItem('vikRole');

    if (!rut || typeof rut !== 'string' || !rut.trim()) {
      window.location.replace('../login/index.html');
      throw new Error('No hay un RUT en la sesión. Inicia sesión nuevamente.');
    }
    if (role && normalize(role) !== 'paciente') {
      window.location.replace('../login/index.html');
      throw new Error('Esta página requiere una sesión de paciente.');
    }

    sessionStorage.setItem('rut', rut.trim());
    if (role) sessionStorage.setItem('rol', role);
    return rut.trim();
  }

  function mapearFicha(payload) {
    if (
      !payload ||
      !payload.paciente ||
      typeof payload.paciente !== 'object' ||
      Array.isArray(payload.paciente) ||
      !Array.isArray(payload.recursos_clinicos) ||
      !Array.isArray(payload.atenciones)
    ) {
      throw new Error('La API no devolvió una ficha válida.');
    }

    const p = payload.paciente;
    const resources = payload.recursos_clinicos;
    // `documentos` contiene metadatos de almacén local para cargar la ficha rápidamente.
    // La Lambda verifica la existencia del objeto en S3 cuando se pulsa «Ver».
    // Solo se usa el recurso clínico como respaldo para instalaciones antiguas
    // que todavía no entregan esa propiedad.
    const rawDocuments = Array.isArray(payload.documentos)
      ? payload.documentos
      : resources.filter(r => {
          const key = String(r.s3_key ?? '').trim();
          return key && key.toUpperCase() !== 'NO_APLICA';
        });
    const info = value => value == null || value === '' ? 'No informado' : String(value);

    const clinical = types => resources
      .filter(r => types.includes(normalize(r.tipo_recurso || '')))
      .map(r => ({
        id: r.id_recurso,
        name: info(r.nombre),
        dose: info(r.dosis),
        frequency: info(r.frecuencia),
        startDate: r.fecha_inicio || '',
        endDate: r.fecha_fin || '',
        status: r.estado || '',
        scheduleType: r.tipo_horario || '',
        scheduleTimes: Array.isArray(r.horarios) ? r.horarios : [],
        detail: [
          r.descripcion,
          r.estado,
          r.dosis,
          r.frecuencia,
          r.fecha_inicio ? 'Desde ' + formatDate(r.fecha_inicio) : null,
          r.fecha_fin ? 'Hasta ' + formatDate(r.fecha_fin) : null
        ].filter(Boolean).join(' · '),
        emergency: r.emergency === true
      }));

    const normalizarEstado = value => {
      const key = normalize(value || '');
      const labels = {
        programada: 'Programada',
        confirmada: 'Confirmada',
        borrador: 'Borrador',
        finalizada: 'Finalizada',
        cancelada: 'Cancelada'
      };
      return labels[key] || info(value);
    };

    const atencionesMapeadas = payload.atenciones.map(a => {
      const professional = a.profesional || {};
      const place = a.establecimiento || {};
      return {
        id: a.id_atencion,
        date: a.fecha_hora || a.fecha_atencion || '',
        place: info(place.nombre),
        professional: [professional.nombre, professional.apellido].filter(Boolean).join(' ') || 'No informado',
        specialty: professional.especialidad || professional.profesion || 'Atención de salud',
        placeDetail: [place.tipo, place.direccion, place.comuna, place.region].filter(Boolean).join(' · '),
        reason: info(a.motivo),
        summary: info(a.resumen),
        status: normalizarEstado(a.estado),
        diagnosis: a.diagnostico,
        indications: a.indicaciones,
        durationMinutes: a.duracion_minutos,
        modality: a.modalidad,
        observations: a.observaciones,
        plan: a.plan
      };
    });

    const appointments = atencionesMapeadas
      .filter(a => ['programada', 'confirmada', 'finalizada', 'cancelada'].includes(normalize(a.status)))
      .filter(a => a.date)
      .map(a => {
        const raw = String(a.date);
        const [datePart = '', timePart = ''] = raw.split('T');
        return {
          id: a.id,
          date: datePart,
          time: timePart.slice(0, 5) || '00:00',
          status: a.status,
          specialty: a.specialty || 'Atención de salud',
          reason: a.reason,
          place: a.place,
          professional: a.professional,
          placeDetail: a.placeDetail,
          modality: a.modality || 'Presencial',
          durationMinutes: a.durationMinutes || 30,
          reminder: false
        };
      });

    // Documentos clínicos: la API devuelve únicamente metadatos.
    // El enlace privado de S3 se solicita recién cuando el paciente pulsa "Ver".
    const documentType = value => {
      const key = normalize(value || '');
      if (key.includes('receta')) return 'Receta';
      if (key.includes('orden')) return 'Examen';
      if (key.includes('examen') || key.includes('resultado')) return 'Examen';
      if (key.includes('informe')) return 'Informe';
      if (key.includes('imagen') || key.includes('radiografia') || key.includes('scanner')) return 'Imagen';
      if (key.includes('derivacion')) return 'Derivación';
      if (key.includes('indicacion')) return 'Indicaciones';
      return 'Otro';
    };

    const seenDocumentIds = new Set();
    const documents = rawDocuments.filter(d => {
      const id = d?.id_recurso ?? d?.id;
      if (id == null || String(id).trim() === '' || seenDocumentIds.has(String(id))) return false;
      seenDocumentIds.add(String(id));
      return true;
    }).map(d => ({
      id: d.id_recurso ?? d.id,
      type: documentType(d.tipo_recurso ?? d.tipo),
      title: info(d.nombre ?? d.title),
      date: d.fecha_registro || d.fecha_documento || '',
      place: info(d.establecimiento?.nombre ?? d.place),
      issuer: info(d.profesional?.nombre ?? d.issuer),
      encounter: d.id_atencion ?? d.encounter ?? null,
      summary: info(d.descripcion ?? d.summary),
      mimeType: d.mime_type || d.mimeType || 'application/octet-stream',
      status: info(d.estado),
      source: 's3'
    }));

    return {
      patient: {
        id: p.id_paciente,
        name: [p.nombre, p.apellido].filter(Boolean).join(' ') || 'Paciente',
        rut: info(p.rut),
        birth: p.fecha_nacimiento,
        sex: info(p.sexo),
        nationality: info(p.nacionalidad),
        healthSystem: info(p.sistema_salud),
        phone: info(p.telefono),
        email: info(p.correo),
        blood: info(p.grupo_sanguineo),
        emergency: info(p.correo_contacto),
        emergencyType: info(p.tipo_contacto),
        religion: info(p.religion),
        ethnicity: info(p.etnia),
        decision: info(p.decision_clinica),
        allergies: clinical(['alergia']),
        medications: clinical(['medicamento']),
        conditions: clinical(['condicion']),
        history: clinical(['antecedente', 'antecedente clinico']),
        safeMedIndications: atencionesMapeadas.filter(a => normalize(a.status) === 'finalizada' || a.status === 'No informado').filter(a => a.indications).slice(0, 10).map(a => ({ fecha: a.date, indicaciones: String(a.indications).slice(0, 1000) }))
      },
      encounters: atencionesMapeadas.filter(a => normalize(a.status) === 'finalizada'),

      documents,
      appointments,
      recipients: [],
      accesses: [],
      accessLog: [],
      qr: {
        active: p.qr_activo === true || p.qr_activo === 1 || p.qr_activo === '1' || String(p.qr_activo).toLowerCase() === 'true',
        version: 1,
        code: p.codigo_qr_emergencia
      },
      safeMed: { status: 'pending' }
    };
  }

  async function obtenerFichaPaciente() {
    const rut = obtenerRutSesion();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await window.VIKDemo.fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut }),
        signal: controller.signal
      });

      let payload = await response.json();

      // Compatible con respuestas directas y Lambda proxy.
      if (payload.body !== undefined) {
        let body = payload.body;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch {}
        }
        if (payload.statusCode && Number(payload.statusCode) >= 400) {
          throw new Error(body?.error || body?.message || `No fue posible consultar la ficha (${payload.statusCode}).`);
        }
        payload = body;
      }

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `No fue posible consultar la ficha (${response.status}).`);
      }

      return mapearFicha(payload);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('La consulta tardó demasiado. Intenta nuevamente.');
      }
      if (error instanceof TypeError) {
        throw new Error('No fue posible conectar con la API de ficha clínica.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function obtenerUrlDocumento(idRecurso) {
    const rut = obtenerRutSesion();
    if (idRecurso == null || String(idRecurso).trim() === '') {
      throw new Error('Documento no válido.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await window.VIKDemo.fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'ver_documento',
          rut,
          id_recurso: Number.isNaN(Number(idRecurso)) ? idRecurso : Number(idRecurso)
        }),
        signal: controller.signal
      });

      let payload = await response.json();

      if (payload?.body !== undefined) {
        if (payload.statusCode && Number(payload.statusCode) >= 400) {
          let errorBody = payload.body;
          if (typeof errorBody === 'string') {
            try { errorBody = JSON.parse(errorBody); } catch {}
          }
          throw new Error(errorBody?.error || errorBody?.message || `No fue posible abrir el documento (${payload.statusCode}).`);
        }
        payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      }

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `No fue posible abrir el documento (${response.status}).`);
      }

      if (!payload?.documento?.url) {
        throw new Error(payload?.error || 'La API no devolvió una URL temporal para el documento.');
      }

      return payload.documento;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('La solicitud del documento tardó demasiado. Intenta nuevamente.');
      }
      if (error instanceof TypeError) {
        throw new Error('No fue posible conectar con la API de documentos.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function obtenerSolicitudesSeguimiento() {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'listar_solicitudes_seguimiento', rut })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) {
      if (payload.statusCode && Number(payload.statusCode) >= 400) throw new Error('No fue posible cargar el seguimiento.');
      payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
    }
    if (!response.ok || payload?.error || payload?.success !== true) throw new Error(payload?.error || 'No fue posible cargar el seguimiento.');
    return Array.isArray(payload?.solicitudes) ? payload.solicitudes : [];
  }

  async function responderSolicitudSeguimiento(idSolicitud, estado, motivoRechazo = '') {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'resolver_solicitud_seguimiento', rut,
        id_solicitud: idSolicitud, estado, motivo_rechazo: motivoRechazo
      })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) {
      const status = Number(payload.statusCode || response.status);
      payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      if (status >= 400) throw new Error(payload?.error || 'No fue posible responder el seguimiento.');
    }
    if (!response.ok || payload?.error || payload?.success !== true) {
      throw new Error(payload?.error || payload?.message || 'El servidor no confirmó la respuesta de seguimiento.');
    }
    return payload;
  }

  async function obtenerSolicitudesAcceso() {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(ACCESS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listar_solicitudes_acceso', rut })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) {
      const status = Number(payload.statusCode || response.status);
      payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      if (status >= 400) throw new Error(payload?.error || 'No fue posible cargar las solicitudes de acceso.');
    }
    if (!response.ok || payload?.error || payload?.success === false) {
      throw new Error(payload?.error || 'No fue posible cargar las solicitudes de acceso.');
    }
    return Array.isArray(payload?.solicitudes) ? payload.solicitudes : [];
  }

  async function responderSolicitudAcceso(idSolicitud, decision) {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(ACCESS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'responder_solicitud_acceso', rut,
        id_solicitud: idSolicitud, decision
      })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) {
      const status = Number(payload.statusCode || response.status);
      payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      if (status >= 400) throw new Error(payload?.error || 'No fue posible responder la solicitud de acceso.');
    }
    if (!response.ok || payload?.error || payload?.success !== true) {
      throw new Error(payload?.error || payload?.message || 'El servidor no confirmó la respuesta de acceso.');
    }
    return payload;
  }

  async function revocarAcceso(idSolicitud) {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(ACCESS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revocar_acceso', rut, id_solicitud: idSolicitud })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) {
      let body = payload.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      if (Number(payload.statusCode) >= 400) {
        throw new Error(body?.error || body?.message || 'No fue posible revocar el acceso.');
      }
      payload = body;
    }
    if (!response.ok || payload?.error || payload?.success !== true) {
      throw new Error(payload?.error || payload?.message || 'No fue posible revocar el acceso.');
    }
    return payload;
  }

  async function generarQR() {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'generar_qr', rut })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
    if (!response.ok || payload?.error || payload?.success !== true) throw new Error(payload?.error || 'El servidor no confirmó la generación del QR.');
    const qr = payload.qr || payload;
    if (!qr?.token && !qr?.codigo_qr_emergencia) throw new Error('El servidor no devolvió el token del QR.');
    return qr;
  }

  async function desactivarQR() {
    const rut = obtenerRutSesion();
    const response = await window.VIKDemo.fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'desactivar_qr', rut })
    });
    let payload = await response.json();
    if (payload?.body !== undefined) payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
    if (!response.ok || payload?.error || payload?.success !== true || payload?.qr_activo !== false) {
      throw new Error(payload?.error || 'El servidor no confirmó la desactivación del QR.');
    }
    return payload;
  }

  async function solicitarSafeMed(action, values = {}) {
    const config = window.VIKSafeMedConfig || {};
    if (!config.enabled || !config.endpoint) throw new Error('La IA de SafeMed todavía no está conectada.');
    if (!values.context || typeof values.context !== 'object' || Array.isArray(values.context)) throw new Error('Carga tu ficha antes de consultar SafeMed.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs || 25000);
    try {
      const response = await window.VIKDemo.fetch(config.endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...values, action}), signal:controller.signal
      });
      let payload = await response.json();
      if (payload?.body !== undefined) {
        if (Number(payload.statusCode) >= 400) throw new Error('SafeMed no pudo completar la solicitud.');
        payload = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;
      }
      if (!response.ok || payload?.error) throw new Error('SafeMed no pudo completar la solicitud.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Todavía no hay una respuesta válida de SafeMed.');
      return payload;
    } catch(error) {
      if (error.name === 'AbortError') throw new Error('SafeMed tardó demasiado. Intenta nuevamente.');
      if (error instanceof TypeError) throw new Error('No pudimos conectar con SafeMed. Intenta más tarde.');
      throw error;
    } finally { clearTimeout(timer); }
  }


  return {
    API_URL,
    obtenerRutSesion,
    obtenerFichaPaciente,
    obtenerUrlDocumento,
    obtenerSolicitudesSeguimiento,
    responderSolicitudSeguimiento,
    obtenerSolicitudesAcceso,
    responderSolicitudAcceso,
    revocarAcceso,
    generarQR,
    desactivarQR,
    solicitarSafeMed
  };
})();
