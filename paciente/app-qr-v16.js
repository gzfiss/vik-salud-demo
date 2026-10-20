"use strict";
window.VIKSafeMed = (() => {
  const core=window.VIKSafeMedCore;
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${({clock:'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',pill:'M8 4a5 5 0 0 1 7 7l-4 4a5 5 0 0 1-7-7l4-4M6 6l7 7',chat:'M4 4h16v12H9l-5 4V4',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3',heart:'M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6l-8 8',file:'M14 3H5v18h14V8l-5-5M14 3v5h5M8 13h8M8 17h6',alert:'m12 3 10 18H2L12 3M12 9v5M12 17h.01'})[name]||'M4 12h16'}"/></svg>`;
  const fmt=value=>new Intl.DateTimeFormat('es-CL',{timeZone:window.VIKSafeMedConfig.timeZone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  let patient=null,storage=null,storageError='',tab='tracking',interval=null,busy=false,messages=[],result=null,summary=null,requestError='';
  const aiReady=()=>window.VIKSafeMedConfig?.enabled&&window.VIKSafeMedConfig?.endpoint;
  const meds=()=> (patient?.medications || []).filter(m=>core.active(m));
  const read=()=>{if(!storage)return null;try{return storage.read();}catch(e){storageError=e.message;return null;}};
  function setPatient(p) {
    const changed=core.cleanRut(patient?.rut)!==core.cleanRut(p?.rut);
    patient=p;
    if(changed){tab='tracking';messages=[];result=null;summary=null;requestError='';closeReminder();}
    storageError='';
    try{storage=core.store(p.rut);storage.read();}catch(e){storageError=e.message;storage=null;}
  }
  const card=(title,body,name='file',extra='')=>`<article class="sm-card ${extra}"><h3><span class="sm-icon">${icon(name)}</span>${title}</h3>${body}</article>`;
  const empty=message=>`<div class="sm-empty">${icon('file')}<p>${E(message)}</p></div>`;
  const alertText=item=>typeof item==='string'?item:(item?.texto || item?.mensaje || item?.title || 'Revisa este hallazgo con tu profesional.');
  const resultHTML=r=>`<div class="sm-analysis"><span class="sm-tag">Ejemplo simulado · Pendiente de revisión profesional</span><h3>Resultado del análisis</h3><p>${E(r.resumen)}</p><h4>Hallazgos para consultar</h4>${r.alertas.length?`<ul>${r.alertas.map(a=>`<li>${E(alertText(a))}</li>`).join('')}</ul>`:'<p>No se incluyeron alertas en este análisis. Esto no garantiza la seguridad del tratamiento.</p>'}<p class="sm-small">${E(fmt(r.generatedAt))} · Confirma estos resultados con tu equipo de salud.</p></div>`;
  function tracking(state) {
    const slots=core.schedule(meds()),pending=slots.filter(r=>r.due&&!state?.intakes.some(i=>i.key===r.key));
    const next=pending[0] || slots.find(r=>!r.due&&!state?.intakes.some(i=>i.key===r.key));
    const records=[...(state?.intakes || []).map(i=>({...i,type:'intake'})),...(state?.wellbeing || []).map(i=>({...i,type:'feeling'}))].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
    return `<div class="sm-grid">${card(next?.due?'Toma pendiente de registrar':'Próxima toma',next?`<div class="sm-med-row"><span class="sm-circle">${icon('pill')}</span><div><strong>${E(next.name)}</strong><p>${E(next.dose)} · Según receta</p><span class="sm-tag">${E(next.day)} · ${E(next.time)}</span></div></div>${next.due?`<button class="sm-primary" data-sm-intake="${E(next.key)}" ${!state?'disabled':''}>Registrar que lo tomé</button><p class="sm-small">No tener un registro no significa que hayas omitido la toma.</p>`:'<p class="sm-small">El recordatorio aparecerá a la hora registrada.</p>'}`:empty(meds().length?'No hay un horario diario explícito en tu receta. SafeMed no inventa horarios.':'No hay medicamentos activos registrados en tu ficha.'),'clock')}
    ${card('¿Cómo te sientes hoy?',`<p class="sm-muted">Lleva un registro de cómo te sientes durante tu tratamiento.</p><form id="sm-wellbeing"><fieldset ${!state?'disabled':''}><legend>Hoy me siento…</legend><div class="sm-feelings">${['Bien','Regular','Mal'].map((v,i)=>`<label><input type="radio" name="feeling" value="${v}" required><span>${['☺','◉','☹'][i]} ${v}</span></label>`).join('')}</div><label class="sm-label" for="sm-note">¿Quieres agregar algo? <span>(opcional)</span></label><textarea id="sm-note" name="note" maxlength="1000" rows="3" placeholder="Escribe lo que quieres comentar en tu próximo control"></textarea><button class="sm-primary" type="submit">Guardar mi registro</button></fieldset></form>`,'heart')}
    ${card('Mi registro',records.length?`<ol class="sm-timeline">${records.slice(0,8).map(r=>`<li><time>${E(fmt(r.recordedAt))}</time><strong>${r.type==='intake'?`Toma declarada · ${E(r.name)}`:`Me sentí ${E(r.feeling).toLowerCase()}`}</strong><p>${r.type==='intake'?`Horario de receta: ${E(r.day)} · ${E(r.time)}`:E(r.note||'Sin observaciones adicionales.')}</p></li>`).join('')}</ol>${records.length>8?'<button class="sm-secondary" data-sm-history>Ver todos mis registros</button>':''}`:empty('Todavía no has registrado tomas ni cómo te sientes.'),'file')}
    ${card('Resumen para mi doctor',`<p class="sm-muted">La demostración puede organizar tus tomas declaradas y observaciones para tu próxima consulta.</p><button class="sm-primary" data-sm-summary ${!state||!records.length||!aiReady()||busy?'disabled':''}>${busy?'Procesando…':'Generar resumen de ejemplo'}</button>${!aiReady()?'<p class="sm-small">Disponible cuando conectemos la IA de SafeMed.</p>':''}${summary?`<div class="sm-analysis"><span class="sm-tag">Resumen simulado</span><p>${E(summary)}</p><p class="sm-small">Comprueba el resumen con tus registros antes de compartirlo. No se envía automáticamente.</p></div>`:''}<button class="sm-secondary" data-sm-export ${!records.length?'disabled':''}>Descargar mis registros</button>`,'spark','sm-soft')}
    </div>`;
  }
  function review(){
    return `<div class="sm-stats"><div>${icon('pill')}<strong>${meds().length}</strong><span>Medicamentos activos registrados</span></div><div>${icon('alert')}<strong>${patient.allergies?.length||0}</strong><span>Alergias registradas</span></div><div>${icon('clock')}<strong>${result?'Ejemplo simulado':'Pendiente de análisis'}</strong><span>${result?'Requiere revisión profesional':'Todavía no hay una evaluación'}</span></div></div><div class="sm-grid">${card('Datos para la revisión',`<div class="sm-med-list">${meds().length?meds().map(m=>`<div class="sm-med-row"><span class="sm-circle">${icon('pill')}</span><div><strong>${E(m.name)}</strong><p>${E(m.dose)} · ${E(m.frequency)}</p></div></div>`).join(''):empty('No hay medicamentos activos registrados.')}<h4>Alergias de tu ficha</h4>${patient.allergies?.length?patient.allergies.map(a=>`<span class="sm-tag sm-alert">${E(a.name)}</span>`).join(' '):'<p class="sm-muted">No hay alergias registradas. Esto no confirma que no tengas alergias.</p>'}</div><button class="sm-secondary" data-view="ficha">Ver mi ficha</button>`,'file')}${card('Explora una revisión simulada',`<p class="sm-muted">SafeMed organiza tus indicaciones y dudas para la próxima consulta. Esta versión no evalúa interacciones farmacológicas.</p><button class="sm-primary" data-sm-review ${!aiReady()||busy||!meds().length?'disabled':''}>${busy?'Analizando…':'Analizar mi tratamiento'}</button>${!aiReady()?'<p class="sm-small">La revisión con IA todavía no está conectada.</p>':''}<p class="sm-small">La evaluación requiere revisión de tu profesional.</p>`,'spark','sm-soft')}</div><div class="sm-card sm-result" aria-live="polite">${result?resultHTML(result):empty('Aún no tienes un análisis SafeMed disponible.')}</div>`;
  }
  function chat(){
    return `<div class="sm-chat-layout">${card('Información de tu ficha',`<p class="sm-muted">Estos datos darán contexto a tus preguntas.</p><h4>Medicamentos activos</h4>${meds().map(m=>`<p><strong>${E(m.name)}</strong><br>${E(m.dose)}</p>`).join('')||'<p>No hay medicamentos registrados.</p>'}<h4>Alergias registradas</h4>${patient.allergies?.map(a=>`<p>${E(a.name)}</p>`).join('')||'<p>No hay alergias registradas.</p>'}<button class="sm-secondary" data-view="ficha">Ver mi ficha e indicaciones</button>`,'file')}
    <section class="sm-card sm-chat"><div class="sm-chat-heading"><h3>Pregúntale a SafeMed</h3><span class="sm-tag">${aiReady()?'Asistente simulado':'IA pendiente de conexión'}</span></div><p class="sm-muted">Resuelve dudas sobre tus medicamentos y las indicaciones de tu doctor.</p><div class="sm-messages" aria-live="polite" role="log"><div class="sm-bubble sm-assistant">${aiReady()?'¿Qué quieres consultar sobre tu tratamiento?':'Aquí podrás consultar tus dudas cuando conectemos la IA. Ya puedes preparar tu pregunta.'}</div>${messages.map(m=>`<div class="sm-bubble ${m.role==='user'?'sm-user':'sm-assistant'}">${E(m.text)}</div>`).join('')}</div><div class="sm-suggestions">${['¿Para qué sirve mi medicamento?','¿Qué dice mi receta?','¿Qué debo preguntarle a mi doctor?'].map(q=>`<button class="sm-secondary" data-sm-question="${E(q)}">${q}</button>`).join('')}</div><form id="sm-chat-form"><label class="sm-label" for="sm-question">Tu pregunta</label><div class="sm-composer"><textarea id="sm-question" name="question" rows="2" maxlength="1000" required placeholder="Escribe tu pregunta sobre tu tratamiento…"></textarea><button class="sm-primary" type="submit" ${!aiReady()||busy?'disabled':''}>${busy?'…':'Enviar'}</button></div></form><p class="sm-small">Esta respuesta es un ejemplo fijo, sin IA real. No cambies ni suspendas medicamentos por una respuesta de IA.</p></section></div>`;
  }
  function mount(p=patient){
    if(!p)return;if(p!==patient)setPatient(p);
    const root=document.getElementById('view-safemed');if(!root)return;
    const state=read();
    root.innerHTML=`<div class="sm-shell"><header class="sm-intro"><div><p class="sm-eyebrow">SAFEMED · TU TRATAMIENTO CONTIGO</p><h2>Comprende y lleva un registro de tu tratamiento</h2><p class="sm-muted">Tus indicaciones, tus dudas y cómo te sientes, en un solo lugar.</p></div><span class="sm-tag">${aiReady()?'Conexión configurada':'Preparado para conectar IA'}</span></header><div class="sm-local-note">${icon('file')}<span>Los registros se guardan solo en este navegador y no se envían al doctor. La ficha proviene de VIK.</span></div><div class="sm-tabs" role="tablist" aria-label="Funciones SafeMed">${[['tracking','Mi seguimiento','clock'],['review','Revisión simulada','spark'],['chat','Pregúntale a SafeMed','chat']].map(([key,label,name])=>`<button role="tab" id="sm-tab-${key}" aria-controls="sm-content" aria-selected="${tab===key}" tabindex="${tab===key?'0':'-1'}" data-sm-tab="${key}" class="${tab===key?'active':''}">${icon(name)}${label}</button>`).join('')}</div>${storageError?`<div class="sm-error" role="alert">${E(storageError)}</div>`:''}${requestError?`<div class="sm-error" role="alert">${E(requestError)}</div>`:''}<div id="sm-content" role="tabpanel" aria-labelledby="sm-tab-${tab}" tabindex="0">${tab==='tracking'?tracking(state):tab==='review'?review():chat()}</div><div class="sm-settings"><label><input id="sm-reminders" type="checkbox" ${state?.reminders?'checked':''} ${!state?'disabled':''}> Recordatorios al entrar o mientras el portal esté abierto</label><button class="sm-text" data-sm-clear>Borrar mis registros locales</button></div><p class="sm-small">Los horarios se muestran en ${E(window.VIKSafeMedConfig.timeZone)}. SafeMed no modifica tu receta.</p></div>`;
    root.onclick=click;root.onchange=change;root.onsubmit=submit;root.onkeydown=keys;
  }
  function showMessage(text){const el=document.getElementById('toast');if(el){el.textContent=text;el.hidden=false;setTimeout(()=>el.hidden=true,5000);}}
  function refresh(){mount();}
  function findSlot(key){return core.schedule(meds()).find(r=>r.key===key);}
  function record(slot){if(!storage||!slot)return;storage.intake(slot);summary=null;refresh();showMessage('Toma guardada como declarada por ti.');}
  function clinicalContext(){
    const value=v=>String(v??'').trim();
    return {
      medicamentos:meds().map(m=>({id:value(m.id),nombre:value(m.name),dosis:value(m.dose),frecuencia:value(m.frequency),estado:value(m.status),fecha_inicio:value(m.startDate),fecha_fin:value(m.endDate)})),
      alergias:(patient.allergies||[]).map(a=>({nombre:value(a.name)})),
      indicaciones:patient.safeMedIndications||[]
    };
  }
  async function request(action,values,validate){
    if(busy)return;const requestRut=core.cleanRut(patient.rut);busy=true;requestError='';refresh();
    try{const r=await window.VIKApi.solicitarSafeMed(action,{...values,context:clinicalContext()});if(core.cleanRut(patient.rut)!==requestRut)return;validate(r);}
    catch(e){requestError=e.message;}
    finally{busy=false;refresh();}
  }
  function exportRecords(){
    const state=read();if(!state)return;
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),timeZone:window.VIKSafeMedConfig.timeZone,declaredByPatient:true,intakes:state.intakes,wellbeing:state.wellbeing},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mis-registros-safemed.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function history(){
    const state=read();if(!state)return;
    const rows=[...state.intakes.map(r=>({...r,text:'Toma declarada · '+r.name})),...state.wellbeing.map(r=>({...r,text:'Me sentí '+r.feeling+' · '+r.note}))].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
    const dlg=document.createElement('dialog');dlg.className='sm-dialog';dlg.setAttribute('aria-labelledby','sm-history-title');dlg.innerHTML=`<button class="sm-close" aria-label="Cerrar">×</button><h2 id="sm-history-title">Mis registros SafeMed</h2><ol class="sm-timeline">${rows.map(r=>`<li><time>${E(fmt(r.recordedAt))}</time><p>${E(r.text)}</p></li>`).join('')}</ol>`;document.body.append(dlg);dlg.querySelector('button').onclick=()=>dlg.close();dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();
  }
  function clearRecords(){
    const dlg=document.createElement('dialog');dlg.className='sm-dialog';dlg.setAttribute('aria-labelledby','sm-clear-title');dlg.innerHTML='<h2 id="sm-clear-title">¿Borrar mis registros locales?</h2><p>Se borrarán las tomas y observaciones de este paciente guardadas en este navegador. La ficha clínica de VIK no cambia.</p><div class="sm-dialog-actions"><button class="sm-secondary" data-cancel>Cancelar</button><button class="sm-primary" data-confirm>Borrar registros</button></div>';
    document.body.append(dlg);dlg.querySelector('[data-cancel]').onclick=()=>dlg.close();dlg.querySelector('[data-confirm]').onclick=()=>{try{const s=storage||core.store(patient.rut);s.clear();setPatient(patient);summary=null;refresh();showMessage('Registros locales borrados.');dlg.close();}catch(e){showMessage(e.message);}};dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();
  }
  function click(e){
    const b=e.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.smTab){tab=b.dataset.smTab;requestError='';refresh();document.getElementById('sm-tab-'+tab)?.focus();}
      if(b.hasAttribute('data-sm-intake'))record(findSlot(b.dataset.smIntake));
      if(b.hasAttribute('data-sm-export'))exportRecords();
      if(b.hasAttribute('data-sm-history'))history();
      if(b.hasAttribute('data-sm-clear'))clearRecords();
      if(b.dataset.smQuestion){const input=document.getElementById('sm-question');input.value=b.dataset.smQuestion;input.focus();}
      if(b.hasAttribute('data-sm-review')) request('safemed_review',{},r=>{
        if(r.kind!=='review'||r.status!=='generated'||typeof r.resumen!=='string'||!r.resumen.trim()||!Array.isArray(r.alertas)||/hello from lambda/i.test(r.resumen))throw Error('Todavía no hay un análisis válido de SafeMed.');
        result={...r,generatedAt:new Date().toISOString()};
      });
      if(b.hasAttribute('data-sm-summary')){const state=read();if(state)request('safemed_summary',{records:{intakes:state.intakes.map(i=>({medicationId:i.medicationId,day:i.day,time:i.time,recordedAt:i.recordedAt})),wellbeing:state.wellbeing.map(i=>({feeling:i.feeling,note:i.note,recordedAt:i.recordedAt}))}},r=>{
        if(r.kind!=='summary'||r.status!=='generated'||typeof r.resumen!=='string'||!r.resumen.trim()||/hello from lambda/i.test(r.resumen))throw Error('Todavía no hay un resumen válido de SafeMed.');summary=r.resumen;
      });}
    }catch(e){showMessage(e.message);}
  }
  function change(e){if(e.target.id==='sm-reminders')try{storage.update(s=>s.reminders=e.target.checked);if(!e.target.checked)closeReminder();showMessage(e.target.checked?'Recordatorios activados.':'Recordatorios desactivados.');}catch(err){showMessage(err.message);refresh();}}
  function keys(e){const current=e.target.closest('[data-sm-tab]');if(!current||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['tracking','review','chat'];const index=tabs.indexOf(tab);tab=e.key==='Home'?tabs[0]:e.key==='End'?tabs[2]:tabs[(index+(e.key==='ArrowRight'?1:2))%3];refresh();document.getElementById('sm-tab-'+tab).focus();}
  function submit(e){
    if(!['sm-wellbeing','sm-chat-form'].includes(e.target.id))return;e.preventDefault();
    try{
      const form=new FormData(e.target);
      if(e.target.id==='sm-wellbeing'){storage.feeling(form.get('feeling'),String(form.get('note')||''));summary=null;refresh();showMessage('Registro guardado en este navegador.');}
      else{
        const question=String(form.get('question')||'').trim();if(!question||!aiReady()||busy)return;
        const prior=messages.slice(-12);messages.push({role:'user',text:question});
        request('safemed_chat',{question,history:prior},r=>{
          if(r.kind!=='chat'||r.status!=='generated'||typeof r.respuesta!=='string'||!r.respuesta.trim()||/hello from lambda/i.test(r.respuesta))throw Error('Todavía no hay una respuesta válida de SafeMed.');messages.push({role:'assistant',text:r.respuesta});
        });
      }
    }catch(err){showMessage(err.message);}
  }
  function closeReminder(){const dlg=document.getElementById('sm-reminder-dialog');if(dlg){dlg.close();dlg.remove();}}
  function reminder(){
    if(!patient||!storage||document.querySelector('dialog[open]')||document.hidden)return;
    let slot;try{slot=storage.pending(meds())[0];}catch(e){return;}if(!slot)return;
    const dlg=document.createElement('dialog');dlg.id='sm-reminder-dialog';dlg.className='sm-dialog sm-reminder';dlg.setAttribute('aria-labelledby','sm-reminder-title');
    dlg.innerHTML=`<button class="sm-close" data-close aria-label="Cerrar recordatorio">×</button><span class="sm-modal-symbol">${icon('clock')}</span><h2 id="sm-reminder-title">Toma pendiente de registrar</h2><p class="sm-muted">Según el horario registrado en tu receta</p><div class="sm-med-row"><span class="sm-circle">${icon('pill')}</span><div><strong>${E(slot.name)}</strong><p>${E(slot.dose)}</p><span class="sm-tag">${E(slot.day)} · ${E(slot.time)}</span></div></div><p>¿Ya registraste esta toma?</p><div class="sm-dialog-actions"><button class="sm-primary" data-taken>Registrar que lo tomé</button><button class="sm-secondary" data-snooze>Recordar en 10 min</button><button class="sm-text" data-close>Cerrar</button></div><p class="sm-small">Este registro declara lo que tú informas. No recomienda tomar una dosis atrasada ni modifica tu receta.</p>`;
    const dismiss=()=>{try{storage.update(s=>s.dismissed[slot.key]=core.clock().day);}catch(e){showMessage(e.message);}dlg.close();};
    dlg.querySelectorAll('[data-close]').forEach(b=>b.onclick=dismiss);
    dlg.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    dlg.querySelector('[data-taken]').onclick=()=>{try{record(slot);dlg.close();}catch(e){showMessage(e.message);}};
    dlg.querySelector('[data-snooze]').onclick=()=>{try{storage.update(s=>{s.snoozed[slot.key]=Date.now()+600000;delete s.dismissed[slot.key];});dlg.close();showMessage('Volveremos a mostrar el aviso en 10 minutos mientras el portal esté abierto.');}catch(e){showMessage(e.message);}};
    dlg.addEventListener('close',()=>dlg.remove());document.body.append(dlg);dlg.showModal();
  }
  function start(p){setPatient(p);mount();if(interval)clearInterval(interval);reminder();interval=setInterval(reminder,30000);}
  window.addEventListener('storage',e=>{if(storage&&e.key===storage.key){closeReminder();refresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reminder();});
  return {mount,start,setPatient,reminder};
})();

"use strict";

// Ficha clínica obtenida por POST usando la sesión del login.
// SafeMed popup pendiente de bienvenida.

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

const iso = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const date = value =>
  !value ||
  Number.isNaN(
    new Date(String(value).slice(0, 10) + 'T12:00:00').getTime()
  )
    ? 'No informada'
    : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value.slice(0, 10) + 'T12:00:00'));

const dateTime = value =>
  new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const normalize = value =>
  String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const shifted = days => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
	};

// SafeMed se presenta como un popup al entrar al portal del paciente.

// API y lógica de negocio separadas en api.js y funcionalidades.js

const { repository, isUpcoming, accessStatus } = window.VIKFunciones;

const views = {
  inicio: [
    'Mi salud, en un lugar',
    'Tu información y tu cuidado, conectados.'
  ],
  ficha: [
    'Mi ficha',
    'Una historia de salud, en todos tus establecimientos.'
  ],
  documentos: [
    'Mis documentos',
    'Exámenes, recetas e informes a tu alcance.'
  ],
  citas: [
    'Mis citas',
    'Tus próximas visitas y el registro de citas anteriores.'
  ],
  seguimiento: [
    'Seguimiento',
    'Revisa solicitudes y coordina tus proximos controles.'
  ],
  accesos: [
    'Accesos a mi ficha',
    'Revisa y administra tus autorizaciones.'
  ],
  qr: [
    'QR de emergencia',
    'Solo lo esencial para una atención de emergencia.'
  ],
  safemed: [
    'SafeMed',
    'Comprende y lleva un registro de tu tratamiento.'
  ]
};

const navLabels = {
  inicio: 'Inicio',
  ficha: 'Mi ficha',
  documentos: 'Documentos',
  citas: 'Mis citas',
  seguimiento: 'Seguimiento',
  accesos: 'Accesos',
  qr: 'QR de emergencia',
  safemed: 'SafeMed'
};

const icons = {
  inicio:
    '<path d="m3 10 9-7 9 7v11H3zM9 21v-8h6v8"/>',

  ficha:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6m-3-3v6M8 15h8m-8 3h5"/>',

  documentos:
    '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6"/>',

  citas:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',

  seguimiento:
    '<path d="M4 5h16v14H4z"/><path d="M8 3v4m8-4v4M7 12h10M7 16h6"/>',

  accesos:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',

  qr:
    '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z"/>',

  safemed:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'
};

let data,
  currentView = 'inicio',
  period = 'upcoming',
  cursor = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ),
  selectedDate = iso(new Date());

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(
    () => ($('toast').hidden = true),
    3500
  );
}

let modalOpener = null;

function modal(title, content) {
  modalOpener = document.activeElement;

  $('modalTitle').textContent = title;
  $('modalContent').innerHTML = content;

  if (!$('modal').open) {
    $('modal').showModal();
  }
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function items(list) {
  return list
    .map(
      x => `
        <div class="row">
          <div>
            <strong>${esc(x.name)}</strong>
            <p>${esc(x.detail)}</p>
          </div>
        </div>
      `
    )
    .join('');
}

function fields(list) {
  return `
    <dl>
      ${list
        .map(
          ([k, v]) => `
            <div>
              <dt>${esc(k)}</dt>
              <dd>${esc(v)}</dd>
            </div>
          `
        )
        .join('')}
    </dl>
  `;
}



function compactDocRow(d) {
  return `
    <div class="row compact-doc">
      <div>
        <strong>${esc(d.title)}</strong>
        <p>${esc(d.type)} · ${date(d.date)} · ${esc(d.place)}</p>
      </div>
      <button class="secondary" data-document="${d.id}">
        Ver
      </button>
    </div>
  `;
}

function appointmentCard(a, panel = true) {
  return `
    <article class="appointment-card ${panel ? 'panel' : ''}">
      <span class="pill ${
        a.status === 'Finalizada'
          ? 'mint'
          : a.status === 'Cancelada'
          ? 'neutral'
          : ''
      }">
        ${esc(a.status)}
      </span>

      <h3>${esc(a.specialty)}</h3>

      <p>
        <strong>${date(a.date)} · ${esc(a.time)}</strong>
      </p>

      <p>${esc(a.reason)}</p>

      <p>
        ${esc(a.place)} ·
        ${esc(a.professional || 'Profesional por asignar')}
      </p>

      ${
        isUpcoming(a)
          ? `
            <button
              class="secondary"
              data-reminder="${a.id}"
              aria-pressed="${a.reminder}"
              style="margin-top:12px"
            >
              ${
                a.reminder
                  ? '✓ Aviso activado · 30 min antes'
                  : 'Activar recordatorio · 30 min antes'
              }
            </button>
          `
          : ''
      }
    </article>
  `;
}

function renderDocuments() {
  $('documentCategories').innerHTML =
    [['Receta', 'Recetas', 'M7 4h10v16H7zM10 9h4M10 13h4'],
     ['Examen', 'Exámenes', 'M9 3h6M10 3v7l-5 9h14l-5-9V3M8 15h8'],
     ['Informe', 'Informes', 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4'],
     ['Imagen', 'Imágenes', 'M3 4h18v16H3zM3 17l6-7 5 5 3-3 4 5M15 8h1'],
     ['Derivación', 'Derivaciones', 'M5 3h10l4 4v14H5zM15 3v5h5M8 13h8M8 17h6'],
     ['Indicaciones', 'Indicaciones', 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5'],
     ['Otro', 'Otros', 'M3 6h7l2 3h9v11H3z']].map(([type, label, path]) =>
      `<button type="button" class="archive-category ${$('docType').value === type ? 'active' : ''}" data-doc-category="${type}" aria-pressed="${$('docType').value === type}"><span class="category-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="${path}"/></svg></span><span><strong>${data.documents.filter(d => d.type === type).length}</strong><small>${label}</small></span><span class="category-arrow" aria-hidden="true">›</span></button>`
    ).join('');

  const q = normalize($('docSearch').value.trim());
  const from = $('docFrom').value;
  const to = $('docTo').value;

  if (from && to && from > to) {
    $('documentCount').textContent =
      'La fecha Desde debe ser anterior o igual a Hasta.';

    $('documentList').innerHTML =
      empty('Ajusta el rango de fechas.');

    return;
  }

  const docs = data.documents
    .filter(
      d =>
        normalize(d.title + ' ' + d.place).includes(q) &&
        ($('docType').value === 'all' ||
          d.type === $('docType').value) &&
        ($('docPlace').value === 'all' ||
          d.place === $('docPlace').value) &&
        (!from || String(d.date || '').slice(0, 10) >= from) &&
        (!to || String(d.date || '').slice(0, 10) <= to)
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date)
    );

  $('documentCount').textContent =
    `${docs.length} documento(s) encontrados`;

  $('documentList').innerHTML =
    docs.map(d => `<article class="archive-row" data-document-row>
      <div class="archive-document"><span class="archive-file" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h6"/></svg></span><div><h3>${esc(d.title || 'Documento')}</h3><p>${esc(d.type || 'Otro')} · ${esc(d.status || 'Activo')}</p></div></div>
      <div><span class="archive-badge" data-type="${esc(d.type || 'Otro')}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d.type === 'Imagen' ? 'M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 4M16 9h.01' : 'M14 3H6v18h12V7zM14 3v5h4M9 12h6M9 16h4'}"/></svg>${esc(d.type || 'Otro')}</span></div>
      <div class="archive-place">${esc(d.place || 'No informado')}</div>
      <time class="archive-date">${esc(d.date ? date(d.date) : 'Sin fecha')}</time>
      <button class="archive-open" type="button" data-document="${esc(d.id)}" aria-label="Abrir ${esc(d.title || 'documento')}">Ver documento <span aria-hidden="true">↗</span></button>
    </article>`).join('') ||
    empty(
      'No hay documentos para estos filtros. Prueba limpiar la búsqueda.'
    );
}

function renderCalendar() {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();

  const first = new Date(y, m, 1);

  const start = new Date(
    y,
    m,
    1 - (first.getDay() + 6) % 7
  );

  $('calendarTitle').textContent =
    new Intl.DateTimeFormat('es-CL', {
      month: 'long',
      year: 'numeric'
    }).format(cursor);

  $('calendar').innerHTML = Array.from(
    { length: 42 },
    (_, i) => {
      const d = new Date(start);

      d.setDate(start.getDate() + i);

      const key = iso(d);

      const apps = data.appointments.filter(
        a => a.date === key
      );

      return `
        <button
          class="${d.getMonth() !== m ? 'muted-day ' : ''}${
            key === selectedDate ? 'selected ' : ''
          }${key === iso(new Date()) ? 'today' : ''}"
          data-day="${key}"
          aria-pressed="${key === selectedDate}"
          aria-label="${date(key)}: ${apps.length} citas"
        >

          <span class="day-number">
            ${d.getDate()}
          </span>

          ${apps
            .map(
              a => `
                <span
                  class="calendar-appointment"
                >
                  <strong>${esc(a.time)}${a.reminder ? ' · 🔔' : ''}</strong>
                  <small>${esc(data.patient.name || 'Paciente')}</small>
                </span>
              `
            )
            .join('')}

        </button>
      `;
    }
  ).join('');

  $('selectedDay').textContent =
    date(selectedDate);

  $('dayAppointments').innerHTML =
    data.appointments
      .filter(a => a.date === selectedDate)
      .sort((a, b) =>
        a.time.localeCompare(b.time)
      )
      .map(a => appointmentCard(a, false))
      .join('') ||
    empty('No hay citas para este día.');

  const list = data.appointments
    .filter(a =>
      period === 'upcoming'
        ? isUpcoming(a)
        : !isUpcoming(a)
    )
    .sort((a, b) =>
      period === 'upcoming'
        ? (a.date + a.time).localeCompare(
            b.date + b.time
          )
        : (b.date + b.time).localeCompare(
            a.date + a.time
          )
    );

  $('appointmentList').innerHTML =
    list.map(a => appointmentCard(a)).join('') ||
    empty('No hay citas en esta categoría.');

  document
    .querySelectorAll('[data-period]')
    .forEach(b =>
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.period === period)
      )
    );
}

function renderAccess() {
  const requests = Array.isArray(data.accessRequests) ? data.accessRequests : [];
  const statusOf = request => String(request.estado || '').toUpperCase();
  const professionalOf = request => {
    const professional = request.profesional || request.profesional_solicitante || request.professional || {};
    return {
      name: professional.nombre || professional.name || request.nombre_profesional || `Profesional ID ${request.id_profesional || '—'}`,
      specialty: professional.especialidad || professional.specialty || 'Profesional de salud',
      place: request.establecimiento?.nombre || professional.establecimiento || request.establecimiento || 'Red VIK Salud'
    };
  };
  const isActive = request => statusOf(request) === 'APROBADA' &&
    (!request.fecha_expiracion || new Date(request.fecha_expiracion) > new Date());
  const pending = requests.filter(request => statusOf(request) === 'PENDIENTE');
  const active = requests.filter(isActive);
  const history = requests.filter(request => !pending.includes(request) && !active.includes(request));
  const recentHistory = history.slice(0, 5);

  $('view-accesos').innerHTML = `
    ${data.accessRequestsError ? `<div class="notice"><strong>No pudimos actualizar tus autorizaciones.</strong><p>${esc(data.accessRequestsError)}</p></div>` : ''}
    <section class="access-dashboard-heading">
      <div>
        <p class="eyebrow">GESTIÓN DE PERMISOS</p>
        <h2>Administra tus accesos</h2>
        <p class="muted">Responde solicitudes de profesionales y consulta su estado registrado.</p>
      </div>
    </section>
    <div class="notice"><strong>Permisos de demostración.</strong><p>Las decisiones se guardan en este navegador y controlan el recorrido de ejemplo. No corresponden a autorizaciones para datos clínicos reales.</p></div>

    <section class="access-summary-grid" aria-label="Resumen de accesos">
      <article class="access-summary-card pending"><span class="access-summary-icon">◷</span><div><small>Solicitudes pendientes</small><strong>${pending.length}</strong><span>Requieren tu respuesta</span></div></article>
      <article class="access-summary-card active"><span class="access-summary-icon">♧</span><div><small>Accesos activos</small><strong>${active.length}</strong><span>Profesionales con acceso</span></div></article>
      <article class="access-summary-card history"><span class="access-summary-icon">▤</span><div><small>Historial reciente</small><strong>${history.length}</strong><span>Movimientos registrados</span></div></article>
    </section>

    <div class="access-main-grid">
      <section class="panel access-section">
        <div class="access-section-heading"><div><span class="section-icon">◷</span><div><p class="eyebrow">REQUIEREN TU DECISIÓN</p><h2>Solicitudes pendientes</h2></div></div><span class="status-badge status-pendiente">${pending.length} pendientes</span></div>
        <div class="access-request-list">
          ${pending.length ? pending.map(request => {
            const professional = professionalOf(request);
            const initials = professional.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('');
            return `<article class="access-request-card"><div class="access-person-line"><span class="access-avatar">${esc(initials)}</span><div><strong>${esc(professional.name)}</strong><small>${esc(professional.specialty)}</small><small>${esc(professional.place)}</small></div><span class="status-badge status-pendiente">Pendiente</span></div><div class="access-request-meta"><span>Solicitud recibida el ${esc(date(request.fecha_solicitud))}</span><span>${esc(request.motivo || 'Consulta de ficha clínica')}</span></div><div class="access-card-actions"><button class="primary" data-access-accept="${esc(request.id_solicitud)}">Aceptar</button><button class="secondary" data-access-reject="${esc(request.id_solicitud)}">Rechazar</button></div></article>`;
          }).join('') : empty('No tienes solicitudes de acceso pendientes.')}
        </div>
      </section>

      <div class="access-side-column">
        <section class="panel access-section">
          <div class="access-section-heading"><div><span class="section-icon active">●</span><div><p class="eyebrow">PERMISOS VIGENTES</p><h2>Accesos activos</h2></div></div><span class="status-badge status-aprobada">${active.length} activos</span></div>
          <div class="access-active-list">
            ${active.length ? active.slice(0, 4).map(request => { const professional = professionalOf(request); const initials = professional.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(''); return `<article class="access-active-row"><span class="access-avatar small">${esc(initials)}</span><div><strong>${esc(professional.name)}</strong><small>${esc(professional.specialty)} · ${esc(professional.place)}</small><small>Hasta ${esc(date(request.fecha_expiracion))}</small></div><span class="status-badge status-aprobada">Activo</span></article>`; }).join('') : empty('No tienes accesos activos.')}
          </div>
          ${active.length ? `<div class="access-card-actions">${active.map(request => `<button class="secondary" data-access-revoke="${esc(request.id_solicitud)}">Revocar acceso</button>`).join('')}</div>` : ''}
          ${active.length > 4 ? `<p class="access-more">Ver todos los accesos (${active.length})</p>` : ''}
        </section>

        <section class="panel access-section">
          <div class="access-section-heading"><div><span class="section-icon">▤</span><div><h2>Historial reciente</h2></div></div><span class="status-badge">${history.length} registros</span></div>
          <button class="access-history-toggle" type="button" data-history-toggle aria-expanded="false">Mostrar historial</button>
          <div class="access-history-list is-collapsed">
            ${recentHistory.length ? recentHistory.map(request => { const professional = professionalOf(request); const state = statusOf(request); const label = ({REVOCADA:'Revocado', EXPIRADA:'Vencido', RECHAZADA:'Rechazado'})[String(request.estado_visual || '').toUpperCase()] || (state === 'APROBADA' ? 'Vencido' : state === 'RECHAZADA' && request.fecha_aprobacion ? 'Revocado' : state === 'RECHAZADA' ? 'Rechazado' : state === 'EXPIRADA' ? 'Vencido' : 'Estado no identificado'); return `<article class="access-history-row"><span class="history-dot ${normalize(state)}">${state === 'APROBADA' ? '✓' : state === 'RECHAZADA' ? '×' : '◷'}</span><div><strong>${label}</strong><small>${esc(professional.name)} · ${esc(date(request.fecha_solicitud))}</small></div><span class="status-badge status-${normalize(state)}">${label}</span></article>`; }).join('') : empty('Todavía no hay movimientos de acceso.')}
          </div>
        </section>
      </div>
    </div>
  `;

  $('view-accesos').querySelectorAll('[data-access-accept]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await repository.respondAccessRequest(button.dataset.accessAccept, 'APROBADA'); await refresh(); toast('Acceso de demostración aprobado.'); }
    catch (error) { button.disabled = false; toast(error.message); }
  }));
  $('view-accesos').querySelectorAll('[data-access-reject]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('¿Quieres rechazar esta solicitud de acceso?')) return;
    button.disabled = true;
    try { await repository.respondAccessRequest(button.dataset.accessReject, 'RECHAZADA'); await refresh(); toast('Solicitud de acceso rechazada.'); }
    catch (error) { button.disabled = false; toast(error.message); }
  }));
  $('view-accesos').querySelectorAll('[data-access-revoke]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('¿Quieres revocar este acceso?')) return;
    button.disabled = true;
    try {
      await repository.revokeAccess(button.dataset.accessRevoke);
      await refresh();
      toast('Revocación registrada. La protección de ficha y documentos depende de la autorización del servidor.');
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  }));
  const historyToggle = $('view-accesos').querySelector('[data-history-toggle]');
  const historyList = $('view-accesos').querySelector('.access-history-list');
  historyToggle?.addEventListener('click', () => {
    const expanded = historyToggle.getAttribute('aria-expanded') === 'true';
    historyToggle.setAttribute('aria-expanded', String(!expanded));
    historyToggle.textContent = expanded ? 'Mostrar historial' : 'Ocultar historial';
    historyList?.classList.toggle('is-collapsed', expanded);
  });
}

// Explicit allowlist.
// Never pass the complete patient object to the emergency view.

function emergencyData() {
  // Vista orientativa según los campos que retorna emergency_by_token de
  // lambda_paciente.py. La respuesta pública real sigue siendo la fuente de verdad.
  const p = data.patient;
  const isActive = item => !item.status || ['activo', 'active'].includes(normalize(item.status));
  return [
    ['Nombre', p.name],
    ['Grupo sanguíneo', p.blood],
    ['Alergias registradas activas', p.allergies.filter(isActive).map(a => a.name).join('; ') || 'No registradas'],
    ['Condiciones registradas activas', p.conditions.filter(isActive).map(c => c.name).join('; ') || 'No registradas']
  ];
}

/* ============================================================
   VIK SALUD · QR REAL
   ============================================================

   El QR contiene una URL pública de emergencia con el token
   como parámetro ?token=...

   NO contiene:
   - nombre
   - RUT
   - alergias
   - medicamentos
   - diagnósticos
   - historial clínico

   El QR es REAL y ESCANEABLE. Al escanearlo abre:
   /qr-emergencia/index.html?token=<uuid>

   La página de emergencia usa ese token para consultar de forma
   segura los datos críticos permitidos.
   ============================================================ */

function renderQR() {

  const qrCode = String(
    data.qr?.code || ''
  ).trim();

  // El QR debe contener una URL web completa, no solo el UUID.
  // Al escanearlo, el teléfono abrirá la página pública de emergencia.
  const qrUrl = qrCode
    ? `${new URL('../qr/index.html', window.location.href).href}?token=${encodeURIComponent(qrCode)}`
    : '';

  const qrActive = Boolean(
    data.qr?.active
  );

  $('view-qr').innerHTML = `
    <div
      class="notice"
      style="margin-bottom:20px"
    >
      <strong>
        Tu QR no entrega la ficha completa.
      </strong>

      <p>
        El código contiene un enlace de demostración hacia
        la vista de emergencia de VIK Salud.
      </p>
    </div>

    <div class="qr-layout">

      <article class="panel qr-card">

        <p class="eyebrow">
          Identificación de emergencia
        </p>

        <h2>
          Mi QR VIK
        </h2>

        <span class="pill ${
          qrActive ? 'mint' : 'neutral'
        }">
          QR ${qrActive ? 'activo' : 'inactivo'}
        </span>

        <div
          id="realQrCode"
          class="qr-visual ${
            qrActive ? '' : 'disabled'
          }"
          role="img"
          aria-label="Código QR de emergencia"
          style="
            background:#fff;
            min-height:260px;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:20px;
            box-sizing:border-box;
          "
        >
          ${
            qrActive
              ? ''
              : '<strong>QR INACTIVO</strong>'
          }
        </div>

        <p class="caption">
          Al escanearlo se abrirá la vista de emergencia
          asociada a este QR.
        </p>

        ${qrActive ? `<p><a href="${esc(qrUrl)}" target="_blank" rel="noopener">Abrir página de emergencia de esta demo ↗</a></p>` : ""}
        <div class="actions">

          <button
            class="primary"
            data-action="qr-preview"
            ${qrActive ? '' : 'disabled'}
          >
            Vista de emergencia
          </button>

          <button
            class="secondary"
            data-action="qr-toggle"
          >
            ${
              qrActive
                ? 'Desactivar QR'
                : 'Activar QR'
            }
          </button>

          <button
            class="secondary"
            data-action="qr-regenerate"
          >
            Regenerar QR
          </button>

        </div>

      </article>

      <article class="panel critical">

        <p class="eyebrow">
          Contenido limitado
        </p>

        <h2>
          Vista orientativa de información de emergencia
        </h2>

        ${fields(emergencyData())}

        <p class="caption">
          La vista de emergencia usa datos ficticios locales. El estado del QR y su revocación
          se guardan en este navegador; no se sincronizan con otros dispositivos.
        </p>

      </article>

    </div>
  `;

  /*
   * GENERACIÓN DEL QR REAL
   *
   * QRCode.js crea un código QR verdadero.
   *
   * El contenido es una URL completa:
   *
   *     ../
   *     qr-emergencia/index.html?token=<uuid>
   *
   */

  if (
    qrActive &&
    qrCode &&
    typeof QRCode !== 'undefined'
  ) {

    const qrContainer =
      $('realQrCode');

    if (qrContainer) {

      qrContainer.innerHTML = '';

      new QRCode(qrContainer, {
        text: qrUrl,
        width: 220,
        height: 220,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

    }

  } else if (
    qrActive &&
    qrCode &&
    typeof QRCode === 'undefined'
  ) {

    const qrContainer =
      $('realQrCode');

    if (qrContainer) {
      qrContainer.innerHTML = `
        <div style="text-align:center">
          <strong>
            No se pudo cargar el generador QR.
          </strong>

          <p class="caption">
            Verifica que QRCode.js esté incluido
            antes de app.js.
          </p>
        </div>
      `;
    }

  }

}

function renderSafeMed() {
  window.VIKSafeMed?.mount(data.patient);
}

function renderFollowup() {
  const container = $('view-seguimiento');
  if (!container) return;
  const requests = Array.isArray(data.followups) ? data.followups : [];
  container.innerHTML = `
    ${data.followupsError ? `<div class="notice"><strong>No pudimos actualizar tus seguimientos.</strong><p>${esc(data.followupsError)}</p></div>` : ''}
    <section class="patient-section-hero">
      <div><p class="eyebrow">COORDINACIÓN CLÍNICA</p><h2>Mis seguimientos</h2><p class="muted">Revisa propuestas de control enviadas por tus profesionales. Aceptar una propuesta no agenda automáticamente una cita.</p></div>
      <span class="hero-mark" aria-hidden="true">↻</span>
    </section>
    <section class="panel followup-patient-list">
      <div class="panel-heading"><div><p class="eyebrow">SOLICITUDES</p><h2>Controles propuestos</h2></div><span class="status-badge">${requests.filter(r => String(r.estado).toUpperCase() === 'PENDIENTE').length} pendientes</span></div>
      ${requests.length ? requests.map(request => `
        <article class="patient-followup-row" data-followup-id="${esc(request.id_solicitud)}">
          <div><strong>${esc(request.motivo || 'Control de seguimiento')}</strong><p>${esc(request.profesional?.nombre ? `${request.profesional.nombre} ${request.profesional.apellido || ''}`.trim() : 'Profesional no informado')} · ${esc(request.modalidad || 'Presencial')}</p><small>Fecha propuesta: ${esc(date(request.fecha_propuesta))}</small></div>
          <div class="patient-followup-actions"><span class="status-badge status-${normalize(request.estado)}">${esc(request.estado || 'PENDIENTE')}</span>${String(request.estado).toUpperCase() === 'PENDIENTE' ? `<button class="primary" data-followup-accept="${esc(request.id_solicitud)}">Aceptar</button><button class="secondary" data-followup-reject="${esc(request.id_solicitud)}">Rechazar</button>` : ''}</div>
        </article>`).join('') : empty('No tienes solicitudes de seguimiento pendientes.')}
    </section>`;
  container.querySelectorAll('[data-followup-accept]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await repository.respondFollowup(button.dataset.followupAccept, 'ACEPTADA'); await refresh(); toast('Seguimiento aceptado.'); }
    catch (error) { button.disabled = false; toast(error.message); }
  }));
  container.querySelectorAll('[data-followup-reject]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('¿Quieres rechazar esta propuesta de seguimiento?')) return;
    try { await repository.respondFollowup(button.dataset.followupReject, 'RECHAZADA'); await refresh(); toast('Seguimiento rechazado.'); }
    catch (error) { toast(error.message); }
  }));
}

function renderNotifications() {
  const pendingFollowups = (data.followups || []).filter(r => String(r.estado).toUpperCase() === 'PENDIENTE');
  const pendingAccess = (data.accessRequests || []).filter(r => String(r.estado).toUpperCase() === 'PENDIENTE');
  const pending = [...pendingFollowups, ...pendingAccess];
  const count = $('notificationCount');
  if (count) { count.textContent = String(pending.length); count.hidden = pending.length === 0; }
}

function renderAll() {
  renderHome();
  renderRecord();
  linkEncounterDocuments();
  renderDocuments();
  renderCalendar();
  renderFollowup();
  renderNotifications();
  renderAccess();
  renderQR();
  renderSafeMed();
}

function linkEncounterDocuments() {

  document
    .querySelectorAll('#view-ficha .timeline article')
    .forEach((article, i) => {

      const encounter = [...data.encounters]
        .sort((a, b) =>
          b.date.localeCompare(a.date)
        )[i];

      if (!encounter) return;
      const docs = data.documents.filter(
        d => d.encounter != null && String(d.encounter) === String(encounter.id)
      );

      article.insertAdjacentHTML(
        'beforeend',
        `
          <div class="record-linked-docs">
            ${docs
              .map(
                d => `
                  <button
                    data-document="${d.id}"
                  >
                    ${esc(d.type)} ·
                    ${esc(d.title)}
                  </button>
                `
              )
              .join('')}
          </div>
        `
      );
    });
}

function navigate(view) {

  if (!views[view]) return;

  currentView = view;

  if (view === 'accesos') {
    renderAccess();
  }

  document
    .querySelectorAll('.view')
    .forEach(
      v =>
        (v.hidden =
          v.id !== `view-${view}`)
    );

  document
    .querySelectorAll('.nav-item')
    .forEach(b => {

      b.classList.toggle(
        'active',
        b.dataset.view === view
      );

      if (b.dataset.view === view) {
        b.setAttribute(
          'aria-current',
          'page'
        );
      } else {
        b.removeAttribute(
          'aria-current'
        );
      }
    });

  $('pageTitle').textContent =
    views[view][0];

  $('pageSubtitle').textContent =
    views[view][1];

  $('pageTitle').focus({
    preventScroll: true
  });

  window.scrollTo({
    top: 0
  });
}

async function refresh() {
  data = await repository.load({ force: true });
  renderAll();
  window.VIKCitasAvisos?.check();
  window.VIKSafeMed?.setPatient(data.patient);
}

function grantDialog() {

  modal(
    'Autorizar acceso',
    `
      <p class="muted">
        Selecciona quién podrá consultar tu ficha
        en esta simulación.
      </p>

      <form id="grantForm">

        <div class="form-grid">

          <label class="span-two">
            Profesional o establecimiento

            <select
              name="recipient"
              required
            >

              ${data.recipients
                .map(
                  r => `
                    <option value="${r.id}">
                      ${esc(r.name)} ·
                      ${esc(r.place)}
                    </option>
                  `
                )
                .join('')}

            </select>

          </label>

          <label>
            Tipo de acceso

            <select
              name="mode"
              id="grantMode"
            >
              <option value="presencial">
                Atención presencial
              </option>

              <option value="telemedicina">
                Telemedicina temporal
              </option>
            </select>

          </label>

          <label>
            Duración temporal

            <select
              name="hours"
              id="grantHours"
              disabled
            >
              <option value="1">
                1 hora
              </option>

              <option value="24">
                24 horas
              </option>

              <option value="72">
                72 horas
              </option>
            </select>

          </label>

        </div>

        <p class="caption">
          Presencial: hasta revocación.
          Telemedicina: vence al finalizar
          la duración seleccionada.
        </p>

        <div
          id="permissionReview"
          class="permission-summary"
        ></div>

        <label class="check-label">

          <input
            type="checkbox"
            required
          >

          Autorizo la consulta de mi ficha
          por el destinatario seleccionado
          en esta demo.

        </label>

        <p
          id="grantError"
          class="form-error"
          role="alert"
        ></p>

        <button
          class="primary"
          type="submit"
        >
          Confirmar autorización
        </button>

      </form>
    `
  );
}

document.addEventListener(
  'click',
  async e => {

    const button =
      e.target.closest('button');

    if (!button || button.disabled) {
      return;
    }

    try {

      if (button.id === 'notificationButton') {
        const hasAccessRequests = (data.accessRequests || []).some(r => String(r.estado).toUpperCase() === 'PENDIENTE');
        navigate(hasAccessRequests ? 'accesos' : 'seguimiento');
        button.setAttribute('aria-expanded', 'false');
        return;
      }

      if (button.dataset.view) {
        navigate(button.dataset.view);
        return;
      }

      if (button.dataset.period) {
        period = button.dataset.period;
        renderCalendar();
        return;
      }

      if (button.dataset.day) {

        selectedDate =
          button.dataset.day;

        renderCalendar();

        document
          .querySelector(
            `[data-day="${selectedDate}"]`
          )
          ?.focus({
            preventScroll: true
          });

        return;
      }

      if (button.dataset.reminder) {

        const id =
          button.dataset.reminder;

        await repository.reminder(id);

        await refresh();

        document
          .querySelector(
            `#view-${currentView} [data-reminder="${id}"]`
          )
          ?.focus({
            preventScroll: true
          });

        toast(
          'Recordatorio actualizado. Aparecerá un aviso emergente 30 minutos antes si el portal está abierto.'
        );

        return;
      }

      if (button.dataset.document) {

        const originalText =
          button.textContent;

        const viewer =
          window.open(
            'about:blank',
            '_blank'
          );

        button.disabled = true;

        button.setAttribute(
          'aria-busy',
          'true'
        );

        button.textContent =
          'Abriendo…';

        try {

          const d =
            await repository.document(
              button.dataset.document
            );

          if (!d.url) {
            throw new Error(
              'No se recibió el enlace seguro del documento.'
            );
          }

          if (viewer) {

            viewer.opener = null;

            viewer.location.replace(
              d.url
            );

          } else {

            window.location.assign(
              d.url
            );

          }

          toast(
            `Documento abierto${
              d.expiresIn
                ? ` · enlace válido por ${Math.round(
                    d.expiresIn / 60
                  )} min`
                : ''
            }.`
          );

        } catch (error) {

          if (
            viewer &&
            !viewer.closed
          ) {
            viewer.close();
          }

          throw error;

        } finally {

          button.disabled = false;

          button.removeAttribute(
            'aria-busy'
          );

          button.textContent =
            originalText;
        }

        return;
      }

      if (button.dataset.docCategory) {

        $('docType').value =
          button.dataset.docCategory;

        renderDocuments();

        return;
      }

      if (button.dataset.revoke) {

        const id =
          button.dataset.revoke;

        modal(
          'Revocar acceso',
          `
            <p>
              El sistema registrará la revocación de esta solicitud.
              La protección efectiva de la ficha requiere controles en el backend.
            </p>

            <button
              class="primary"
              data-confirm-revoke="${id}"
            >
              Confirmar revocación
            </button>
          `
        );

        return;
      }

      if (button.dataset.confirmRevoke) {

        await repository.revokeAccess(
          button.dataset.confirmRevoke
        );

        $('modal').close();

        await refresh();

        $('pageTitle').focus();

        toast(
          'Revocación registrada. La protección de ficha y documentos depende de la autorización del servidor.'
        );

        return;
      }

      const action =
        button.dataset.action;

      if (action === 'grant') {
        throw new Error('La creación de autorizaciones requiere una solicitud de acceso creada por el backend.');
      }

      if (
        action === 'qr-preview' &&
        data.qr.active
      ) {

        modal(
          'Información de emergencia',
          `
            <p class="eyebrow">
              Vista ficticia · estado local de demostración
            </p>

            <div class="critical">
              ${fields(emergencyData())}
            </div>
          `
        );
      }

      if (
        action === 'qr-toggle' ||
        action === 'qr-regenerate'
      ) {

        modal(
          action === 'qr-toggle'
            ? data.qr.active
              ? 'Desactivar QR'
              : 'Activar QR'
            : 'Regenerar QR',

          `
            <p>
              ${
                action === 'qr-regenerate'
                  ? 'Se emitirá un nuevo código y el anterior dejará de corresponder al paciente. Al regenerar, se activará el QR de esta demo.'
                  : 'Se actualizará la disponibilidad del QR en este navegador.'
              }
            </p>

            <button
              class="primary"
              data-confirm-qr="${
                action === 'qr-regenerate'
                  ? 'regenerate'
                  : 'toggle'
              }"
            >
              Confirmar
            </button>
          `
        );
      }

      if (button.dataset.confirmQr) {

        await repository.updateQR(
          button.dataset.confirmQr
        );

        $('modal').close();

        await refresh();

        $('pageTitle').focus();

        toast(
          'QR actualizado en este navegador.'
        );
      }


    } catch (error) {

      toast(error.message);

    }
  }
);

document.addEventListener(
  'change',
  e => {

    if (e.target.id === 'grantMode') {

      $('grantHours').disabled =
        e.target.value !==
        'telemedicina';

    }

    if (
      e.target.closest('#grantForm')
    ) {
      updatePermissionReview();
    }
  }
);

document.addEventListener(
  'submit',
  async e => {

    if (
      e.target.id !==
      'grantForm'
    ) {
      return;
    }

    e.preventDefault();

    const form = e.target;

    const submit =
      form.querySelector(
        '[type=submit]'
      );

    submit.disabled = true;

    try {

      const values =
        new FormData(form);

      throw new Error('Las autorizaciones se crean desde una solicitud de acceso enviada por un profesional.');

    } catch (error) {

      $('grantError').textContent =
        error.message;

    } finally {

      submit.disabled = false;

    }
  }
);

$('closeModal').addEventListener(
  'click',
  () => $('modal').close()
);

$('modal').addEventListener(
  'close',
  () => {

    if (
      modalOpener?.isConnected
    ) {

      modalOpener.focus({
        preventScroll: true
      });

    } else {

      $('pageTitle').focus({
        preventScroll: true
      });

    }
  }
);

$('documentFilters').addEventListener(
  'submit',
  e => e.preventDefault()
);

$('documentFilters').addEventListener(
  'input',
  renderDocuments
);

$('documentFilters').addEventListener(
  'change',
  renderDocuments
);

$('documentFilters').addEventListener(
  'reset',
  () =>
    setTimeout(
      renderDocuments,
      0
    )
);

$('prevMonth').addEventListener(
  'click',
  () => {

    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth() - 1,
      1
    );

    renderCalendar();
  }
);

$('nextMonth').addEventListener(
  'click',
  () => {

    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      1
    );

    renderCalendar();
  }
);

$('todayButton').addEventListener(
  'click',
  () => {

    const now = new Date();

    cursor = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    selectedDate = iso(now);

    renderCalendar();
  }
);

function setupSidebarToggle() {
  const sidebarToggle = $('sidebarToggle');
  if (!sidebarToggle || sidebarToggle.dataset.bound === 'true') return;

  sidebarToggle.dataset.bound = 'true';
  sidebarToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggle.querySelector('span:last-child').textContent = collapsed ? 'Mostrar menú' : 'Ocultar menú';
    sidebarToggle.querySelector('span:first-child').textContent = collapsed ? '›' : '‹';
  });
}

async function init() {

  setupSidebarToggle();

  try {

    // Mostrar la ficha apenas responda PostgreSQL, sin esperar las listas
    // independientes de solicitudes de acceso y seguimiento.
    data =
      await repository.load({ deferSecondary: true });

    document
      .querySelectorAll(
        '[data-patient-name]'
      )
      .forEach(
        el =>
          (el.textContent =
            data.patient.name)
      );

    document
      .querySelectorAll(
        '[data-patient-avatar]'
      )
      .forEach(
        el =>
          (el.textContent =
            data.patient.name
              .split(/\s+/)
              .map(n => n[0])
              .slice(0, 2)
              .join(''))
      );

    $('loadStatus').hidden =
      true;

    $('navigation').innerHTML =
      Object.keys(views)
        .map(
          key => `
            <button
              class="nav-item"
              data-view="${key}"
            >

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                ${icons[key]}
              </svg>

              <span>
                ${navLabels[key]}
              </span>

            </button>
          `
        )
        .join('');

    $('docPlace').insertAdjacentHTML(
      'beforeend',
      [
        ...new Set(
          data.documents.map(
            d => d.place
          )
        )
      ]
        .map(
          p =>
            `<option>${esc(p)}</option>`
        )
        .join('')
    );

    renderAll();
    window.VIKCitasAvisos.start(() => data?.appointments || []);

    navigate('inicio');
    window.VIKSafeMed.start(data.patient);

    // Carga secundaria no bloqueante. No vuelve a dibujar toda la página
    // para evitar perder el formulario o el QR que el paciente está usando.
    void repository.loadSecondary().then(updated => {
      if (!updated || data?.patient?.id !== updated.patient?.id) return;
      data.followups = updated.followups;
      data.followupsError = updated.followupsError;
      data.accessRequests = updated.accessRequests;
      data.accessRequestsError = updated.accessRequestsError;
      data.accesses = updated.accesses;
      data.accessLog = updated.accessLog;
      renderNotifications();
      if (!$('modal')?.open) {
        renderFollowup();
        renderAccess();
      }
    }).catch(error => {
      // Se recupera la ficha incluso si fallan las listas secundarias.
      console.warn('No se pudieron cargar las secciones secundarias:', error?.message || 'Error de red');
    });

    setInterval(
      refreshAccessExpiry,
      30000
    );

  } catch (error) {

    $('loadError').hidden =
      false;

    $('loadStatus').hidden =
      true;

    $('loadError').textContent =
      error.message;

    const link =
      document.createElement('a');

    link.href =
      '../login/index.html';

    link.textContent =
      ' Volver al login';

    $('loadError').append(link);
  }
}

async function refreshAccessExpiry() {

  // Re-evaluate expiration without resetting forms or calendar focus.

  if (!data) return;

  const now = Date.now();

  const signature =
    data.accesses
      .map(
        a =>
          a.revoked
            ? 'revoked'
            : a.expires &&
              new Date(
                a.expires
              ).getTime() <= now
            ? 'expired'
            : 'active'
      )
      .join();

  if (
    signature !==
    refreshAccessExpiry.signature
  ) {

    refreshAccessExpiry.signature =
      signature;

    if (
      currentView === 'accesos' &&
      !$('modal').open
    ) {
      renderAccess();
    }
  }
}

function updatePermissionReview() {

  const form =
    $('grantForm');

  if (!form) return;

  const values =
    new FormData(form);

  const r =
    data.recipients.find(
      r =>
        r.id ===
        values.get('recipient')
    );

  const temporal =
    values.get('mode') ===
    'telemedicina';

  const hours =
    Number(
      values.get('hours') || 1
    );

  $('permissionReview').innerHTML = `
    <strong>
      ${esc(r.name)} ·
      ${esc(r.place)}
    </strong>

    <p>
      Podrá consultar tu ficha clínica
      y documentos. No podrá editar
      tus autorizaciones.
    </p>

    <span>
      ${
        temporal
          ? 'Acceso temporal durante ' +
            hours +
            ' hora(s). Vencimiento previsto: ' +
            dateTime(
              new Date(
                Date.now() +
                  hours *
                    3600000
              ).toISOString()
            )
          : 'Vigente hasta que revoques el permiso.'
      }
    </span>
  `;
}

/* VIK paciente: render final para Inicio y Mi ficha.
   Mantiene datos/API; solo cambia presentación. */

function vikUiIcon(name) {

  const paths = {
    chevron: '<path d="m6 9 6 6 6-6"/>',
    person:
      '<circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M18.5 4.5v3m-1.5-1.5h3"/>',

    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',

    pills:
      '<path d="M10.5 13.5 6 18a4 4 0 0 1-5.7-5.7l8-8A4 4 0 1 1 14 10l-3.5 3.5Z"/><path d="m7 7 10 10"/>',

    shield:
      '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="M12 8v8m-4-4h8"/>',

    file:
      '<path d="M14 3H5v18h14V8zM14 3v5h5"/><path d="M8 13h8m-8 4h6"/>',

    activity:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 13h2l2-4 2 8 2-4h2"/>',

    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',

    allergy:
      '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/>',

    condition:
      '<path d="M4 12h4l2-5 4 10 2-5h4"/>',

    blood:
      '<path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12Z"/>'

  };

  return `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${paths[name] || paths.file}
    </svg>
  `;
}

function renderRecord() {

  const p = data.patient;

  const initials =
    p.name
      .split(/\s+/)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const allergyTitle =
    p.allergies.length
      ? `${p.allergies.length} ${
          p.allergies.length === 1
            ? 'alergia registrada'
            : 'alergias registradas'
        }`
      : 'Sin alergias registradas';

  const conditionTitle =
    p.conditions.length
      ? `${p.conditions.length} ${
          p.conditions.length === 1
            ? 'condición en seguimiento'
            : 'condiciones en seguimiento'
        }`
      : 'Sin condiciones activas';

  const medicationTitle =
    p.medications.length
      ? `${p.medications.length} ${
          p.medications.length === 1
            ? 'medicamento actual'
            : 'medicamentos actuales'
        }`
      : 'Sin medicamentos registrados';

  $('view-ficha').innerHTML = `

    <section class="record-intro">

      <div class="identity">

        <span class="avatar">
          ${esc(initials)}
        </span>

        <div>

          <h2>
            ${esc(p.name)}
          </h2>

          <p>
            ${esc(p.rut)} · ID VIK ${esc(p.id)}
          </p>

        </div>

      </div>

      <p class="record-intro-note">
        Tu información de salud, ordenada para
        encontrar lo importante rápidamente.
      </p>

    </section>

    <section
      class="record-clinical-band"
      aria-label="Resumen clínico"
    >

      <article class="record-clinical-item allergy">

        <div class="clinical-head">

          <span class="record-clinical-icon">
            ${vikUiIcon('allergy')}
          </span>

          <p class="eyebrow">
            Alergias
          </p>

        </div>

        <h3>
          ${allergyTitle}
        </h3>

        <details>
          <summary>
            Ver detalles
          </summary>

          ${
            items(p.allergies) ||
            empty('No hay alergias registradas.')
          }

        </details>

      </article>

      <article class="record-clinical-item condition">

        <div class="clinical-head">

          <span class="record-clinical-icon">
            ${vikUiIcon('condition')}
          </span>

          <p class="eyebrow">
            Condiciones
          </p>

        </div>

        <h3>
          ${conditionTitle}
        </h3>

        <details>

          <summary>
            Ver detalles
          </summary>

          ${
            items(p.conditions) ||
            empty('No hay condiciones registradas.')
          }

        </details>

      </article>

      <article class="record-clinical-item meds">

        <div class="clinical-head">

          <span class="record-clinical-icon">
            ${vikUiIcon('pills')}
          </span>

          <p class="eyebrow">
            Medicamentos
          </p>

        </div>

        <h3>
          ${medicationTitle}
        </h3>

        <details>

          <summary>
            Ver detalles
          </summary>

          ${
            items(p.medications) ||
            empty('No hay medicamentos registrados.')
          }

        </details>

      </article>

      <article class="record-clinical-item blood">

        <div class="clinical-head">

          <span class="record-clinical-icon">
            ${vikUiIcon('blood')}
          </span>

          <p class="eyebrow">
            Grupo sanguíneo
          </p>

        </div>

        <h3>
          ${esc(p.blood || 'No informado')}
        </h3>

        <p class="caption">
          Dato registrado en tu ficha.
        </p>

      </article>

    </section>

    <section class="record-sections">

      <details class="record-section">

        <summary>
          Datos personales
        </summary>

        <div class="record-section-body">

          ${fields([
            ['Fecha de nacimiento', date(p.birth)],
            ['Sexo', p.sex],
            ['Nacionalidad', p.nationality],
            ['Sistema de salud', p.healthSystem],
            ['Teléfono', p.phone],
            ['Correo', p.email],
            ['Contacto de emergencia', p.emergency]
          ])}

        </div>

      </details>

      <details class="record-section">

        <summary>
          Antecedentes relevantes
        </summary>

        <div class="record-section-body">

          ${
            items(p.history) ||
            empty(
              'No hay antecedentes adicionales registrados.'
            )
          }

          <div
            class="notice"
            style="margin-top:14px"
          >
            <strong>
              Decisión de salud registrada
            </strong>

            <p>
              ${esc(p.decision)}
            </p>
          </div>

        </div>

      </details>

      <details
        class="record-section"
        open
      >

        <summary>
          Historial de atenciones
        </summary>

        <div class="record-section-body">

          <p class="caption">
            Tus atenciones, aunque hayan ocurrido
            en distintos establecimientos.
          </p>

          <div class="timeline">

            ${
              [...data.encounters]
                .sort((a, b) =>
                  b.date.localeCompare(a.date)
                )
                .map(
                  a => `
                    <article>

                      <span class="eyebrow">
                        ${
                          a.date
                            ? esc(dateTime(a.date))
                            : 'Fecha no informada'
                        }
                      </span>

                      <h3>
                        ${esc(a.reason)}
                      </h3>

                      <p>
                        ${esc(a.place)} ·
                        ${esc(a.professional)}
                      </p>

                      <details>

                        <summary>
                          Ver atención
                        </summary>

                        <p>
                          ${esc(a.summary)}
                        </p>

                        <p>
                          <strong>
                            Estado:
                          </strong>
                          ${esc(a.status)}
                        </p>

                        ${
                          a.specialty
                            ? `
                              <p>
                                Especialidad:
                                ${esc(a.specialty)}
                              </p>
                            `
                            : ''
                        }

                        ${
                          a.placeDetail
                            ? `
                              <p>
                                ${esc(a.placeDetail)}
                              </p>
                            `
                            : ''
                        }

                        ${
                          a.plan
                            ? `
                              <p>
                                <strong>
                                  Plan registrado:
                                </strong>
                                ${esc(a.plan)}
                              </p>
                            `
                            : ''
                        }

                      </details>

                    </article>
                  `
                )
                .join('') ||
              empty(
                'No hay atenciones registradas.'
              )
            }

          </div>

        </div>

      </details>

      <details class="record-section">

        <summary>
          Preferencias personales y culturales
        </summary>

        <div class="record-section-body">

          <p class="caption">
            Datos opcionales de contexto.
            No se incluyen en el QR de emergencia.
          </p>

          ${fields([
            ['Religión / convicción', p.religion],
            [
              'Pertenencia étnica o cultural',
              p.ethnicity
            ]
          ])}

        </div>

      </details>

    </section>
  `;
}

/* --- VIK patient final overrides:
   fixed PNG icons + deterministic themes --- */

/* Tema visual:
   gestionado exclusivamente por ../shared/vik-theme.js */

/* --- V7 override:
   use fixed PNG icons for person, rows,
   safemed and chevron --- */

function homePngIcon(name, cls = '') {
 const names = {person:'person', docs:'file', moves:'activity', safemed:'heart', chevron:'chevron'};
 return '<span class="'+cls+'">'+vikUiIcon(names[name] || 'file')+'</span>';
}

function renderHome() {

  const p = data.patient;

  const next = [...data.appointments]
    .filter(isUpcoming)
    .sort((a, b) =>
      (a.date + a.time).localeCompare(
        b.date + b.time
      )
    )[0];

  const recentDocs =
    [...data.documents]
      .sort((a, b) =>
        b.date.localeCompare(a.date)
      )
      .slice(0, 3);

  const recentMoves =
    [...data.encounters]
      .sort((a, b) =>
        b.date.localeCompare(a.date)
      )
      .slice(0, 3);

  $('view-inicio').innerHTML = `
    <div class="patient-home-ref">

      <section class="home-ref-hero">

        <div
          class="home-ref-person image-person"
        >
          ${homePngIcon(
            'person',
            'home-person-img'
          )}
        </div>

        <div class="home-ref-copy">

          <h2>
            Hola, ${esc(p.name)}
          </h2>

          <p>
            Tu salud a mano. Consulta lo esencial
            y abre los detalles cuando los necesites.
          </p>

          <div class="actions">

            <button
              class="primary"
              data-view="citas"
            >
              ${vikUiIcon('calendar')}
              <span>
                Ver mi próxima cita
              </span>
            </button>

            <button
              class="secondary"
              data-view="qr"
            >
              ${vikUiIcon('shield')}
              <span>
                QR de emergencia
              </span>
            </button>

          </div>

        </div>

        <div class="home-ref-heart">
          ${vikUiIcon('heart')}
        </div>

      </section>

      <section
        class="home-ref-band"
        aria-label="Resumen de salud"
      >

        <article>

          <div
            class="home-ref-icon calendar"
          >
            ${vikUiIcon('calendar')}
          </div>

          <div>

            <p class="eyebrow">
              Próxima cita
            </p>

            ${
              next
                ? `
                  <h3>
                    ${esc(next.specialty)}
                  </h3>

                  <p>
                    ${date(next.date)} ·
                    ${esc(next.time)}
                  </p>

                  <p>
                    ${esc(next.place)}
                  </p>
                `
                : `
                  <h3>
                    No tienes próximas citas registradas.
                  </h3>
                `
            }

            <button
              class="text-button"
              data-view="citas"
            >
              Ver todas mis citas
              <span aria-hidden="true">
                →
              </span>
            </button>

          </div>

        </article>

        <article>

          <div
            class="home-ref-icon meds"
          >
            ${vikUiIcon('pills')}
          </div>

          <div>

            <p class="eyebrow">
              Medicamentos
            </p>

            <h3>
              ${p.medications.length}
              ${
                p.medications.length === 1
                  ? 'medicamento actual'
                  : 'medicamentos actuales'
              }
            </h3>

            <p>
              Tu tratamiento registrado en la ficha.
            </p>

            <details>

              <summary>
                Ver detalles
                <span aria-hidden="true">
                  ›
                </span>
              </summary>

              ${
                items(p.medications) ||
                empty(
                  'No hay medicamentos registrados.'
                )
              }

            </details>

          </div>

        </article>

        <article>

          <div
            class="home-ref-icon emergency"
          >
            ${vikUiIcon('shield')}
          </div>

          <div>

            <p class="eyebrow">
              Emergencia
            </p>

            <h3>
              QR ${data.qr.active ? 'activo' : 'inactivo'}
            </h3>

            <p>
              Muestra solo información crítica.
            </p>

            <button
              class="secondary"
              data-view="qr"
            >
              ${vikUiIcon('shield')}
              <span>
                Abrir QR
              </span>
            </button>

          </div>

        </article>

      </section>

      <details class="home-ref-row">

        <summary class="home-row-summary">

          <span class="home-row-main">

            <span
              class="home-ref-icon small image-row-icon"
            >
              ${homePngIcon(
                'docs',
                'row-small-img'
              )}
            </span>

            <span>

              <strong>
                Documentos recientes
              </strong>

              <small>
                Ver tus documentos y resultados.
              </small>

            </span>

          </span>

          <em class="home-row-count">
            ${recentDocs.length}
            ${
              recentDocs.length === 1
                ? 'documento'
                : 'documentos'
            }
          </em>

          <span class="home-ref-toggle">

            <span>
              Ver detalles
            </span>

            ${homePngIcon(
              'chevron',
              'home-ref-chevron-img'
            )}

          </span>

        </summary>

        <div class="home-ref-detail">
          ${
            recentDocs.map(compactDocRow).join('') ||
            empty('No hay documentos recientes.')
          }
        </div>

      </details>

      <details class="home-ref-row">

        <summary class="home-row-summary">

          <span class="home-row-main">

            <span
              class="home-ref-icon small image-row-icon"
            >
              ${homePngIcon(
                'moves',
                'row-small-img'
              )}
            </span>

            <span>

              <strong>
                Últimos movimientos de mi ficha
              </strong>

              <small>
                Revisa las atenciones y cambios recientes.
              </small>

            </span>

          </span>

          <em class="home-row-count">
            ${recentMoves.length}
            ${
              recentMoves.length === 1
                ? 'movimiento'
                : 'movimientos'
            }
          </em>

          <span class="home-ref-toggle">

            <span>
              Ver detalles
            </span>

            ${homePngIcon(
              'chevron',
              'home-ref-chevron-img'
            )}

          </span>

        </summary>

        <div
          class="home-ref-detail timeline compact-timeline"
        >

          ${
            recentMoves
              .map(
                a => `
                  <article>

                    <span class="caption">
                      ${date(a.date)}
                    </span>

                    <h3>
                      ${esc(a.reason)}
                    </h3>

                    <p>
                      ${esc(a.place)} ·
                      ${esc(a.professional)}
                    </p>

                  </article>
                `
              )
              .join('') ||
            empty(
              'No hay movimientos recientes.'
            )
          }

        </div>

      </details>

      <article class="home-ref-safemed">

        <div
          class="home-ref-icon safemed image-row-icon"
        >
          ${homePngIcon(
            'safemed',
            'row-small-img safemed-img'
          )}
        </div>

        <div>

          <p class="eyebrow">
            SafeMed
          </p>

          <h3>
            Tu tratamiento contigo
          </h3>

          <p>
            Registra cómo te sientes y consulta tus dudas sobre el tratamiento.
          </p>

        </div>

        <button
          class="secondary"
          data-view="safemed"
        >
          Ver SafeMed
          <span aria-hidden="true">
            →
          </span>
        </button>

      </article>

    </div>
  `;
}
// SafeMed: bienvenida inicial del paciente como popup, no como pantalla obligatoria.

// SafeMed MVP: solo avisa cuando la receta trae medicamento, dosis y una hora explícita.


// Si el script externo del generador termina después de mostrar la ficha,
// dibujar el QR sin repetir ninguna consulta AWS.
document.getElementById('vikQrLibrary')?.addEventListener('load', () => {
  if (data?.qr?.active) renderQR();
});

// All renderers and modules are defined before loading clinical data.
init();
