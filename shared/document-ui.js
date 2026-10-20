/* Shared presentation only. All content is fictional, never a signed prescription. */
window.VIKDocuments = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types = {
    Receta: {symbol:'℞',label:'Recetas',tone:'mint'},
    Examen: {symbol:'⌁',label:'Exámenes',tone:'lavender'},
    Informe: {symbol:'≡',label:'Informes',tone:'lavender'},
    Imagen: {symbol:'▧',label:'Imágenes',tone:'peach'},
    Otro: {symbol:'▤',label:'Otros',tone:'neutral'}
  };
  function normalized(d) { return {...d,title:d.title || d.name,encounter:d.encounter || d.attentionId}; }
  function date(value) {return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value.slice(0,10)+'T12:00'));}
  function card(document, attribute, patientName='') {
    const d=normalized(document),t=types[d.type] || types.Otro;
    return `<article class="clinical-document ${t.tone}"><div class="document-card-top"><span class="file-symbol" aria-hidden="true">${t.symbol}</span><span class="file-type">${escape(d.type)}</span><time>${date(d.date)}</time></div><h3>${escape(d.title)}</h3><p class="document-owner">${escape(patientName || d.place)}</p><div class="document-metadata"><span>Emisor</span><strong>${escape(d.issuer || 'Equipo clínico')}</strong><span>Establecimiento</span><strong>${escape(d.place)}</strong></div><div class="document-card-bottom"><span>${d.encounter?`Atención ${escape(d.encounter)}`:'Sin atención asociada'}</span><button class="document-open" ${attribute}="${escape(d.id)}" aria-label="Ver ${escape(d.title)}">Ver ${d.type==='Receta'?'receta':'documento'} ↗</button></div></article>`;
  }
  function preview(document, patientName) {
    const d=normalized(document),t=types[d.type] || types.Otro;
    return `<div class="document-demo">VISTA DE DEMOSTRACIÓN · SIN VALIDEZ CLÍNICA</div><article class="document-sheet"><header class="sheet-header"><div><strong>VIK Salud</strong><span>${escape(d.place)}</span></div><span class="sheet-symbol">${t.symbol}</span></header><p class="sheet-kicker">${escape(d.type)} · ${escape(d.id)}</p><h3>${escape(d.title)}</h3><dl class="sheet-details"><div><dt>Paciente</dt><dd>${escape(patientName)}</dd></div><div><dt>Fecha de emisión</dt><dd>${date(d.date)}</dd></div><div><dt>Profesional / emisor</dt><dd>${escape(d.issuer || 'No informado')}</dd></div><div><dt>Atención asociada</dt><dd>${escape(d.encounter || 'No asociada')}</dd></div></dl>${d.type==='Receta'?`<div class="prescription-heading">Tratamiento registrado</div>${(d.prescription || []).map((m,i)=>`<div class="prescription-line"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${escape(m.name)} <small>${escape(m.dose)}</small></strong><p>${escape(m.frequency)}</p><small>Duración: ${escape(m.duration)}</small></div></div>`).join('') || '<p>No hay medicamentos detallados en este documento.</p>'}`:`<div class="document-placeholder"><span aria-hidden="true">${t.symbol}</span><h4>${d.type==='Imagen'?'Estudio de imagen':d.type==='Examen'?'Resultado de examen':'Contenido del documento'}</h4><p>${escape(d.summary)}</p></div>`}<footer class="sheet-footer"><strong>Contenido ficticio · documento sin firma</strong><span>No corresponde a una receta válida ni a un resultado real. El archivo original no está conectado.</span></footer></article>`;
  }
  function categories(documents, active='all', attribute='data-doc-category') {
    return [['all',{symbol:'▤',label:'Todos'}],...Object.entries(types)].map(([key,t])=>`<button ${attribute}="${key}" aria-pressed="${active===key}"><span aria-hidden="true">${t.symbol}</span><strong>${t.label}</strong><small>${key==='all'?documents.length:documents.filter(d=>d.type===key).length}</small></button>`).join('');
  }
  return {card,preview,categories};
})();
