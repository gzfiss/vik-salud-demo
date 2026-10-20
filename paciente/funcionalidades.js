"use strict";

// ============================================================
// VIK SALUD · FUNCIONALIDADES PACIENTE
// Lógica de negocio/estado del frontend. No contiene renderizado.
// La comunicación HTTP real vive en api.js.
// ============================================================

window.VIKFunciones = (() => {
  let db = null;
  const copy = value => structuredClone(value);

  const isUpcoming = appointment => {
    if (!appointment?.date || !appointment?.time) return false;
    return new Date(`${appointment.date}T${appointment.time}`) >= new Date() &&
      ['Programada', 'Confirmada'].includes(appointment.status);
  };

  const accessStatus = access => {
    if (access.revoked) return 'Revocado';
    if (access.expires && new Date(access.expires) <= new Date()) return 'Vencido';
    return 'Activo';
  };

  // Las listas de seguimiento y permisos son independientes de la ficha.
  // Se cargan en paralelo, y durante el primer ingreso no bloquean la pantalla.
  async function loadSecondaryFor(target) {
    const results = await Promise.allSettled([
      window.VIKApi.obtenerSolicitudesSeguimiento(),
      window.VIKApi.obtenerSolicitudesAcceso()
    ]);
    // Evitar que una respuesta antigua sobreescriba una ficha recargada.
    if (db !== target) return copy(db);

    target.followups = results[0].status === 'fulfilled' ? results[0].value : [];
    target.followupsError = results[0].status === 'rejected'
      ? (results[0].reason?.message || 'No fue posible consultar seguimientos.') : '';
    target.accessRequests = results[1].status === 'fulfilled' ? results[1].value : [];
    target.accessRequestsError = results[1].status === 'rejected'
      ? (results[1].reason?.message || 'No fue posible consultar autorizaciones.') : '';

    target.accesses = target.accessRequests
      .filter(item => String(item.estado || '').toUpperCase() === 'APROBADA')
      .map(item => ({
        ...item,
        id: item.id_solicitud,
        recipient: item.id_profesional,
        granted: item.fecha_aprobacion || item.fecha_solicitud,
        expires: item.fecha_expiracion || null,
        revoked: false
      }));
    target.accessLog = target.accessRequests.map(item => ({
      at: item.fecha_respuesta || item.fecha_solicitud,
      text: `${String(item.estado_visual || item.estado || '').toLowerCase()} · Profesional ID ${item.id_profesional || '—'}`
    }));
    return copy(db);
  }

  const repository = {
    async load({ force = false, deferSecondary = false } = {}) {
      if (db && !force) return copy(db);
      const target = await window.VIKApi.obtenerFichaPaciente();
      db = target;
      window.VIKCitasAvisos.load(target.patient);
      target.appointments.forEach(a => { a.reminder = window.VIKCitasAvisos.enabled(a.id); });
      target.followups = [];
      target.accessRequests = [];
      target.followupsError = '';
      target.accessRequestsError = '';
      if (deferSecondary) return copy(target);
      return loadSecondaryFor(target);
    },

    async loadSecondary() {
      if (!db) throw new Error('La ficha aún no está disponible.');
      return loadSecondaryFor(db);
    },

    async respondFollowup(idSolicitud, estado, motivoRechazo = '') {
      await window.VIKApi.responderSolicitudSeguimiento(idSolicitud, estado, motivoRechazo);
      await repository.load({ force: true });
    },

    async respondAccessRequest(idSolicitud, decision) {
      await window.VIKApi.responderSolicitudAcceso(idSolicitud, decision);
      await repository.load({ force: true });
    },

    async revokeAccess(idSolicitud) {
      await window.VIKApi.revocarAcceso(idSolicitud);
      await repository.load({ force: true });
    },

    async reminder(id) {
      const appointment = db?.appointments.find(a => String(a.id) === String(id));
      if (!appointment || !isUpcoming(appointment)) {
        throw new Error('Esta cita no admite recordatorios.');
      }
      appointment.reminder = window.VIKCitasAvisos.toggle(appointment.id);
      return appointment.reminder;
    },

    async updateQR(action) {
      if (!db) throw new Error('La ficha aún no está cargada.');
      if (action === 'regenerate' || !db.qr.active) {
        const qr = await window.VIKApi.generarQR();
        const token = String(qr.token || qr.codigo_qr_emergencia || '').trim();
        if (!token) throw new Error('La API no confirmó el identificador del QR.');
        db.qr = { ...db.qr, active: true, code: token, url: qr.url || '', version: (db.qr.version || 0) + 1 };
      } else {
        await window.VIKApi.desactivarQR();
        db.qr = { ...db.qr, active: false };
      }
    },

    async document(id) {
      const document = db?.documents.find(d => String(d.id) === String(id));
      if (!document) throw new Error('Documento no disponible.');

      // La URL de S3 no se guarda en el frontend. Se solicita a la API
      // solamente cuando el paciente decide abrir este documento.
      const acceso = await window.VIKApi.obtenerUrlDocumento(document.id);

      return {
        ...copy(document),
        url: acceso.url,
        expiresIn: acceso.expira_en_segundos,
        mimeType: acceso.mime_type || document.mimeType
      };
    }
  };

  return {
    repository,
    isUpcoming,
    accessStatus
  };
})();

"use strict";
// Pure scheduling functions plus per-patient browser storage. No medical decisions.
window.VIKSafeMedCore = (() => {
  const timezone = () => window.VIKSafeMedConfig?.timeZone || 'America/Santiago';
  const cleanRut = value => String(value || '').replace(/[.\s-]/g, '').toUpperCase();
  function clock(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone(), year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).formatToParts(now).map(p => [p.type,p.value]));
    return { day:`${parts.year}-${parts.month}-${parts.day}`, time:`${parts.hour}:${parts.minute}` };
  }
  const nextDay = day => new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  function active(m, day = clock().day) {
    const status = String(m.status || '').trim().toLowerCase();
    if (status && !['activo','activa','vigente','en curso'].includes(status)) return false;
    return (!m.startDate || m.startDate.slice(0,10)<=day) && (!m.endDate || m.endDate.slice(0,10)>=day);
  }
  function hours(m) {
    if (m.id == null || !m.name || !m.dose || /no informad/i.test(m.dose)) return [];
    let times = [];
    if (Array.isArray(m.scheduleTimes) && m.scheduleType === 'diaria') times=m.scheduleTimes;
    else {
      // Only an explicit DAILY list is accepted. 'Cada 8 horas' is not a daily schedule.
      const frequency=String(m.frequency || '').trim();
      const match=frequency.match(/^(?:diario|diaria|diariamente|todos los dias|todos los días)\s+(?:a las\s+)?((?:[01]\d|2[0-3]):[0-5]\d(?:\s*(?:,|y|;)\s*(?:[01]\d|2[0-3]):[0-5]\d)*)$/i);
      if (match) times=match[1].match(/\d{2}:\d{2}/g) || [];
    }
    return [...new Set(times.filter(t => typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
  }
  function schedule(medications, now = new Date()) {
    const c=clock(now), rows=[];
    for(const m of medications || []) for(const day of [c.day,nextDay(c.day)]) {
      if (!active(m,day)) continue;
      for(const time of hours(m)) rows.push({key:JSON.stringify([String(m.id),day,time]), medicationId:String(m.id), name:m.name, dose:m.dose, day,time, timeZone:timezone(), due:day===c.day && time<=c.time});
    }
    return rows.sort((a,b)=>(a.day+a.time).localeCompare(b.day+b.time));
  }
  function store(rut) {
    const id=cleanRut(rut);
    if(!id || /NOINFORMADO/.test(id)) throw Error('No se pudo identificar al paciente para guardar su seguimiento.');
    const key='vik-demo:safemed:'+new URL(window.VIKDemo.base).pathname+':'+id;
    const empty=()=>({version:1,intakes:[],wellbeing:[],reminders:true,snoozed:{},dismissed:{}});
    function read() {
      let raw;try{raw=localStorage.getItem(key);}catch{throw Error('El navegador no permite guardar el seguimiento.');}
      if(!raw) return empty();
      try{
        const value=JSON.parse(raw);
        if(value.version!==1 || !Array.isArray(value.intakes) || !Array.isArray(value.wellbeing) || typeof value.reminders!=='boolean' || !value.snoozed || !value.dismissed) throw Error();
        return value;
      }catch{throw Error('No se pudo leer el seguimiento guardado. Puedes borrar los registros locales desde SafeMed.');}
    }
    function update(fn) {
      const value=read();fn(value);
      try{localStorage.setItem(key,JSON.stringify(value));}catch{throw Error('No se pudo guardar. Revisa el espacio y los permisos del navegador.');}
      return value;
    }
    return {read, key, update,
      clear(){try{localStorage.removeItem(key);}catch{throw Error('No se pudieron borrar los registros locales.');}},
      intake(slot){return update(s=>{if(!s.intakes.some(i=>i.key===slot.key)) s.intakes.unshift({...slot, recordedAt:new Date().toISOString(), declaredByPatient:true}); delete s.snoozed[slot.key];});},
      feeling(feeling,note){if(!['Bien','Regular','Mal'].includes(feeling)) throw Error('Selecciona cómo te sientes.'); if(note.length>1000)throw Error('Escribe hasta 1000 caracteres.'); return update(s=>s.wellbeing.unshift({id:crypto.randomUUID(),feeling,note:note.trim(),recordedAt:new Date().toISOString(),declaredByPatient:true}));},
      pending(medications,now=new Date()) {const s=read(); if(!s.reminders)return [];const c=clock(now); return schedule(medications,now).filter(r=>r.due&&!s.intakes.some(i=>i.key===r.key)&&(!s.snoozed[r.key]||s.snoozed[r.key]<=now.getTime())&&s.dismissed[r.key]!==c.day);}
    };
  }
  return {clock,active,hours,schedule,store,cleanRut};
})();
