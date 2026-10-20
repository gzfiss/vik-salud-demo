"use strict";
// VIK SALUD — recordatorios locales de citas. No envían notificaciones externas.
// Se activan solo con el portal abierto y el reloj del dispositivo correcto.
window.VIKCitasAvisos = (() => {
  const MINUTES_BEFORE = 30;
  const AFTER_MINUTES = 10;
  let key = null;
  let state = { enabled: {}, dismissed: {}, snoozed: {} };
  let getAppointments = () => [];
  let interval = null;
  let currentDialog = null;
  let currentPatient = null;

  function load(patient) {
    if (!patient || patient.id == null) return;
    const patientId = String(patient.id);
    if (currentPatient === patientId) return;
    currentPatient = patientId;
    key = `vik-demo:appointments:${new URL(window.VIKDemo.base).pathname}:${patientId}`;
    state = { enabled: {}, dismissed: {}, snoozed: {} };
    try {
      const obj = JSON.parse(localStorage.getItem(key) || '{}');
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const field of ['enabled','dismissed','snoozed']) {
          if (obj[field] && typeof obj[field] === 'object' && !Array.isArray(obj[field])) state[field] = obj[field];
        }
      }
    } catch { /* Sin almacenamiento, recordatorios solo mientras dure la página. */ }
    if (currentDialog?.open) currentDialog.close();
  }
  function save() {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch { /* El aviso seguirá funcionando durante esta visita. */ }
  }
  const enabled = id => Boolean(state.enabled[String(id)]);
  function toggle(id) {
    const k = String(id);
    if (enabled(k)) delete state.enabled[k];
    else state.enabled[k] = true;
    // Restablece recordatorio si el paciente lo vuelve a activar.
    delete state.dismissed[k]; delete state.snoozed[k];
    save();
    return enabled(k);
  }
  function appointmentTime(a) {
    if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date)) || !/^\d\d:\d\d$/.test(String(a.time))) return NaN;
    const parsed = new Date(`${a.date}T${a.time}:00`);
    return parsed.getTime();
  }
  function due(appointments, now = Date.now()) {
    return (appointments || []).filter(a => {
      if (!enabled(a.id) || !['programada','confirmada'].includes(String(a.status || '').toLowerCase())) return false;
      const t = appointmentTime(a);
      if (!Number.isFinite(t)) return false;
      if (state.dismissed[String(a.id)] === t) return false;
      if (Number(state.snoozed[String(a.id)] || 0) > now) return false;
      return now >= t - MINUTES_BEFORE * 60000 && now <= t + AFTER_MINUTES * 60000;
    }).sort((a,b)=>appointmentTime(a)-appointmentTime(b))[0] || null;
  }
  function show(appointment) {
    if (currentDialog?.open || !document.body || document.querySelector('dialog[open]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'vik-cita-aviso';
    dialog.setAttribute('aria-labelledby','vik-cita-aviso-titulo');
    const heading = document.createElement('h2'); heading.id='vik-cita-aviso-titulo'; heading.textContent='Recordatorio de cita';
    const subtitle = document.createElement('p'); subtitle.textContent='Tienes una cita programada próximamente.';
    const details = document.createElement('p'); details.className='vik-cita-aviso-detalle';
    details.textContent = `${appointment.date} · ${appointment.time} · ${appointment.specialty || 'Atención de salud'}`;
    const note = document.createElement('p'); note.className='vik-cita-aviso-nota';
    note.textContent='Aviso local: solo aparece si VIK SALUD está abierto. Revisa siempre tu hora confirmada.';
    const actions = document.createElement('div'); actions.className='vik-cita-aviso-acciones';
    const close = document.createElement('button'); close.type='button'; close.className='primary'; close.textContent='Entendido';
    const snooze = document.createElement('button'); snooze.type='button'; snooze.className='secondary'; snooze.textContent='Recordar en 5 minutos';
    actions.append(close,snooze); dialog.append(heading,subtitle,details,note,actions);
    const dismiss = () => { state.dismissed[String(appointment.id)] = appointmentTime(appointment); delete state.snoozed[String(appointment.id)]; save(); dialog.close(); };
    close.addEventListener('click',dismiss);
    snooze.addEventListener('click',()=>{state.snoozed[String(appointment.id)]=Date.now()+300000; save(); dialog.close();});
    dialog.addEventListener('cancel', e => {e.preventDefault(); dismiss();});
    dialog.addEventListener('close',()=>{dialog.remove();if(currentDialog===dialog) currentDialog=null;});
    document.body.append(dialog);
    currentDialog=dialog;
    if (typeof dialog.showModal==='function') dialog.showModal();
    else dialog.setAttribute('open','');
  }
  function check(now = Date.now()) {
    if (document.hidden || !currentPatient || currentDialog?.open) return;
    const item=due(getAppointments(),now);
    if(item) show(item);
  }
  function start(source) {
    getAppointments = source;
    if (interval != null) clearInterval(interval);
    interval=setInterval(()=>check(),30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();},{once:false});
    check();
  }
  return { load, enabled, toggle, check, start, due, appointmentTime, MINUTES_BEFORE };
})();
