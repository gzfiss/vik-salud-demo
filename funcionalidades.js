"use strict";

/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {

  const sidebarToggle = $("sidebarToggle");
  sidebarToggle?.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.querySelector("span:last-child").textContent = collapsed ? "Mostrar menú" : "Ocultar menú";
    sidebarToggle.querySelector("span:first-child").textContent = collapsed ? "›" : "‹";
  });

  /* =========================================================
     MAIN NAVIGATION
     ========================================================= */

  document
    .querySelectorAll("#navigation [data-view]")
    .forEach(button => {

      button.addEventListener("click", () => {

        const view = button.dataset.view;

        console.log("Doctor navigation:", view);

        switchView(view);

      });

    });


  $("closeClinicalAccessModal")?.addEventListener("click", () => $("clinicalAccessModal")?.close());
  $("clinicalAccessRefresh")?.addEventListener("click", async () => {
    const rut = $("clinicalAccessModal")?.dataset.patientRut;
    if (rut) await viewClinicalAccessStatus(rut);
  });
  $("clinicalAccessRequest")?.addEventListener("click", async () => {
    const modal = $("clinicalAccessModal");
    const rut = modal?.dataset.patientRut;
    const button = $("clinicalAccessRequest");
    if (!rut || !button || !window.confirm("¿Enviar una solicitud al paciente? Deberá aprobarla en su portal.")) return;
    button.disabled = true;
    try {
      await requestClinicalAccessToAPI({ rut });
      showClinicalAccessDialog(rut, await inspectClinicalAccessFromAPI(rut));
      toast("Solicitud registrada. Espera la respuesta del paciente.");
    } catch (error) {
      // Ante 409/estado conflictivo, refrescar para mostrar la situación vigente.
      try { showClinicalAccessDialog(rut, await inspectClinicalAccessFromAPI(rut)); }
      catch { button.disabled = false; }
      toast(error?.message || "No se pudo registrar la solicitud.");
    }
  });

  /* =========================================================
     PATIENT RECORD
     ========================================================= */

  document.addEventListener("click", async event => {

    const removeDraftButton = event.target.closest("[data-remove-clinical-draft]");
    if (removeDraftButton) {
      const id = removeDraftButton.dataset.removeClinicalDraft;
      if (!selectedPatient || !currentConsultation || agendaStatusKey(currentConsultation) === "finalizada") return;
      const doc = (selectedPatient.documents || []).find(item => item.id_documento === id);
      if (!doc || !doc._localDraft || String(doc.id_atencion) !== String(currentConsultation.id_atencion || currentConsultation.id)) return;
      if (!window.confirm("¿Quitar este borrador local? No se generó ningún PDF todavía.")) return;
      selectedPatient.documents = selectedPatient.documents.filter(item => item !== doc);
      DATA.documents = DATA.patients.flatMap(patient => patient.documents || []);
      renderDocuments();
      renderConsultationView();
      toast("Borrador local eliminado.");
      return;
    }

    const prepareAttentionButton = event.target.closest("[data-prepare-attention]");
    if (prepareAttentionButton) {
      prepareAttention(prepareAttentionButton.dataset.prepareAttention);
      return;
    }

    const startAttentionButton =
      event.target.closest("[data-start-attention]");

    if (startAttentionButton) {
      startConsultation(startAttentionButton.dataset.startAttention);
      return;
    }


    const patientButton =
      event.target.closest("[data-open-patient]");

    if (patientButton) {

      const patient = patientById(
        patientButton.dataset.openPatient
      );

      if (patient) {
        openRecord(patient);
      }

      return;
    }


    const agendaAction =
      event.target.closest("[data-agenda-action]");

    if (agendaAction) {
      const action = agendaAction.dataset.agendaAction;

      if (action === "reprogramar") {
        const attentionId = agendaAction.dataset.attentionId || agendaAction.dataset.idAtencion || window.prompt("ID de la atención a reprogramar:");
        const newDate = window.prompt("Nueva fecha y hora (AAAA-MM-DDTHH:MM):");
        if (!attentionId || !newDate) return;
        try {
          const attention = agendaItems().find(item => String(item.id_atencion || item.id) === String(attentionId));
          const patient = attention && agendaPatient(attention);
          const patientId = attention?.id_paciente || attention?.patient_id || patient?.id_paciente || patient?.id;
          const rut = attention?.rut || attention?.patient_rut || (patient ? patientRut(patient) : "");
          if (!patientId && !rut) throw new Error("No se encontró el paciente asociado a la atención.");
          await saveAttentionToAPI({
            id_atencion: attentionId,
            id_paciente: patientId,
            rut,
            cambios: { fecha_hora: newDate, estado: attention?.estado || attention?.status || "PROGRAMADA" }
          });
          for (const collection of [DATA.appointments, DATA.attentions]) {
            if (!Array.isArray(collection)) continue;
            collection.forEach(item => {
              if (String(item.id_atencion || item.id) !== String(attentionId)) return;
              item.fecha_hora = newDate;
              item.date = newDate;
            });
          }
          toast("Cita reprogramada correctamente.");
          if (typeof renderAgenda === "function") renderAgenda();
        } catch (error) { toast(error.message || "No fue posible reprogramar la cita."); }
      } else if (action === "solicitar-acceso") {
        const rut = agendaAction.dataset.rut || agendaAction.dataset.patientRut || window.prompt("RUT del paciente:");
        await viewClinicalAccessStatus(rut);

      }

      return;
    }




    const registerPatientButton = event.target.closest("[data-register-patient]");
    if (registerPatientButton) {
      openRegisterPatientModal(registerPatientButton.dataset.prefillRut || "");
      return;
    }

    const createDocumentButton = event.target.closest("[data-create-document]");
    if (createDocumentButton) {
      openClinicalDocumentModal(createDocumentButton.dataset.createDocument || "RECETA");
      return;
    }

    const recordTab =
      event.target.closest("[data-record-tab]");

    if (recordTab) {

      currentRecordTab =
        recordTab.dataset.recordTab;

      updateRecordTabs();

      document
        .querySelectorAll("[data-record-section]")
        .forEach(section => {

          section.hidden =
            section.dataset.recordSection !==
            currentRecordTab;

        });

      return;
    }

  });

  $("closePrepareAttentionModal")?.addEventListener("click", () => {
    const modal = $("prepareAttentionModal");
    if (modal?.open) modal.close();
  });
  $("prepareAttentionRecord")?.addEventListener("click", () => {
    const modal = $("prepareAttentionModal");
    const patient = patientById(modal?.dataset.patientId || "");
    if (modal?.open) modal.close();
    if (patient) openRecord(patient);
  });
  $("prepareAttentionStart")?.addEventListener("click", () => {
    const modal = $("prepareAttentionModal");
    const attentionId = modal?.dataset.attentionId || "";
    if (modal?.open) modal.close();
    if (attentionId) startConsultation(attentionId);
  });


  /* =========================================================
     NEW ATTENTION
     ========================================================= */

  const addAttentionButton =
    $("addAttentionBtn");

  if (addAttentionButton) {

    addAttentionButton.addEventListener(
      "click",
      () => {
        startConsultationFromSelectedPatient();
      }
    );

  }


  /* =========================================================
     EDIT PATIENT
     ========================================================= */

  const editPatientBtn =
    $("editPatientBtn");

  if (editPatientBtn) {

    editPatientBtn.addEventListener(
      "click",
      openEditPatientModal
    );

  }


  const closeEditPatientModal =
    $("closeEditPatientModal");

  if (closeEditPatientModal) {

    closeEditPatientModal.addEventListener(
      "click",
      closeEditPatientDialog
    );

  }


  const cancelEditPatient =
    $("cancelEditPatient");

  if (cancelEditPatient) {

    cancelEditPatient.addEventListener(
      "click",
      closeEditPatientDialog
    );

  }


  const editPatientForm =
    $("editPatientForm");

  if (editPatientForm) {

    editPatientForm.addEventListener(
      "submit",
      savePatientChanges
    );

  }


  /* =========================================================
     DOCUMENTS
     ========================================================= */

  const recordDocumentsButton =
    $("recordDocumentsBtn");

  if (recordDocumentsButton) {

    recordDocumentsButton.addEventListener(
      "click",
      () => {
        currentRecordTab = "documentos";
        updateRecordTabs();
        document.querySelectorAll("[data-record-section]").forEach(section => {
          section.hidden = section.dataset.recordSection !== "documentos";
        });
      }
    );

  }

  const uploadRecordDocumentBtn = $("uploadRecordDocumentBtn");

  if (uploadRecordDocumentBtn) {
    uploadRecordDocumentBtn.addEventListener("click", () => {
      toast("El flujo de subida de recetas y documentos se conectará al S3 privado en el siguiente paso.");
    });
  }

  if (uploadRecordDocumentBtn) {
    uploadRecordDocumentBtn.replaceWith(uploadRecordDocumentBtn.cloneNode(true));
    $("uploadRecordDocumentBtn").addEventListener("click", () => openClinicalDocumentModal("RECETA"));
  }

  const notificationButton = document.querySelector(".notification-button");

  if (notificationButton) {
    notificationButton.addEventListener("click", () => {
      toast("Notificaciones clínicas: módulo preparado para integrar recordatorios y avisos.");
    });
  }

  $("closeRegisterPatientModal")?.addEventListener("click", closeRegisterPatientModal);
  $("cancelRegisterPatient")?.addEventListener("click", closeRegisterPatientModal);
  $("registerPatientForm")?.addEventListener("submit", saveNewPatientFromFrontend);

  $("closeClinicalDocumentModal")?.addEventListener("click", closeClinicalDocumentModal);
  $("cancelClinicalDocument")?.addEventListener("click", closeClinicalDocumentModal);
  $("clinicalDocumentType")?.addEventListener("change", updateClinicalDocumentFields);
  $("clinicalDocumentForm")?.addEventListener("submit", event => { event.preventDefault(); saveClinicalDocumentFromFrontend("EMITIDO"); });
  $("saveClinicalDocumentDraft")?.addEventListener("click", () => saveClinicalDocumentFromFrontend("BORRADOR"));

}





/* =========================================================
   PATIENT REGISTRATION · FRONTEND CONTRACT
   ========================================================= */

function openRegisterPatientModal(prefillRut = "") {
  const modal = $("registerPatientModal");
  if (!modal) return;
  $("registerPatientForm")?.reset();
  if ($("newPatientRut")) $("newPatientRut").value = prefillRut || "";
  if (typeof modal.showModal === "function") modal.showModal(); else modal.hidden = false;
}

function closeRegisterPatientModal() {
  const modal = $("registerPatientModal");
  if (!modal) return;
  if (typeof modal.close === "function" && modal.open) modal.close(); else modal.hidden = true;
}

async function saveNewPatientFromFrontend(event) {
  event.preventDefault();
  if (!canChangeAttention("")) return;
  preserveAttention();
  const rut = $("newPatientRut")?.value.trim() || "";
  const nombre = $("newPatientName")?.value.trim() || "";
  const apellido = $("newPatientLastName")?.value.trim() || "";
  if (!rut || !nombre || !apellido) { toast("Completa RUT, nombre y apellido."); return; }

  const duplicate = DATA.patients.find(patient => patientRut(patient).replace(/\s/g, "") === rut.replace(/\s/g, ""));
  if (duplicate) { closeRegisterPatientModal(); openRecord(duplicate); return; }

  const submitButton = event.currentTarget?.querySelector('[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Registrando…";
  }

  const patientPayload = {
    rut,
    nombre,
    apellido,
    fecha_nacimiento: $("newPatientBirthDate")?.value || "",
    telefono: $("newPatientPhone")?.value.trim() || "",
    correo: $("newPatientEmail")?.value.trim() || "",
    sexo: $("newPatientSex")?.value.trim() || "",
    grupo_sanguineo: $("newPatientBloodGroup")?.value.trim() || ""
  };

  try {
    const created = DEMO_MODE
      ? { id_paciente: `DEMO-P-${Date.now()}`, rut, demo: true }
      : await createPatientInAPI(patientPayload);

    if (!created?.id_paciente) {
      throw new Error("La API no devolvió el identificador persistente del paciente.");
    }

  const patient = {
    id: created.id_paciente,
    id_paciente: created.id_paciente,
    ...patientPayload,
    name: nombre,
    last_name: apellido,
    birth_date: patientPayload.fecha_nacimiento,
    allergies:[], conditions:[], medications:[], personalHistory:[], familyHistory:[], observations:[], decisions:[], preferences:[], consents:[], providers:[], documents:[], attentions:[],
    _source: DEMO_MODE ? "Demostración local" : "Doctor API / RDS"
  };
  DATA.patients.push(patient);
  currentConsultation = null;
  clinicalAiResult = null;
  selectedPatient = patient;
  closeRegisterPatientModal();
  renderHome(); renderPatients(); renderDocuments();
  openRecord(patient);
  toast(DEMO_MODE ? "Ficha creada en la demostración." : "Paciente registrado correctamente.");
  } catch (error) {
    toast(error.message || "No fue posible registrar el paciente.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Registrar paciente";
    }
  }
}

/* =========================================================
   CLINICAL DOCUMENTS · FRONTEND CONTRACT
   ========================================================= */

function openClinicalDocumentModal(type = "RECETA") {
  captureAttention();
  if (!selectedPatient || !currentConsultation) { toast("Inicia una atención antes de crear un documento clínico."); return; }
  const modal = $("clinicalDocumentModal");
  if (!modal) return;
  $("clinicalDocumentForm")?.reset();
  if ($("clinicalDocumentType")) $("clinicalDocumentType").value = type;
  if ($("clinicalDocumentPatient")) $("clinicalDocumentPatient").value = `${patientName(selectedPatient)} · ${patientRut(selectedPatient) || "RUT pendiente"}`;
  if ($("clinicalDocumentIssueDate")) $("clinicalDocumentIssueDate").value = toISODate(new Date());
  updateClinicalDocumentFields();
  if (typeof modal.showModal === "function") modal.showModal(); else modal.hidden = false;
}

function closeClinicalDocumentModal() {
  const modal = $("clinicalDocumentModal");
  if (!modal) return;
  if (typeof modal.close === "function" && modal.open) modal.close(); else modal.hidden = true;
}

function updateClinicalDocumentFields() {
  const type = $("clinicalDocumentType")?.value || "RECETA";
  const prescription = $("prescriptionFields");
  if (prescription) prescription.hidden = type !== "RECETA";
  const groups = {
    ORDEN_EXAMEN: $("orderDocumentFields"),
    DERIVACION: $("referralDocumentFields"),
    INDICACIONES: $("indicationsDocumentFields")
  };
  Object.entries(groups).forEach(([documentType, group]) => {
    if (!group) return;
    const visible = type === documentType;
    group.hidden = !visible;
    group.querySelectorAll("[data-document-required]").forEach(input => {
      input.required = visible;
    });
  });
  if (type === "RECETA") prefillPrescriptionFields();
  const details = $("clinicalDocumentDetails");
  if (details && !details.value.trim()) {
    details.value = type === "INDICACIONES"
      ? currentConsultation?.indicaciones || ""
      : currentConsultation?.observaciones || currentConsultation?.resumen || "";
  }
  renderPrescriptionPreview();
  const expiry = $("clinicalDocumentExpiryDate");
  if (expiry) expiry.required = ["RECETA","ORDEN_EXAMEN","DERIVACION"].includes(type);
  const title = $("clinicalDocumentModalTitle");
  if (title) title.textContent = ({RECETA:"Crear receta",ORDEN_EXAMEN:"Crear orden de examen",DERIVACION:"Crear derivación",INDICACIONES:"Crear indicaciones"}[type] || "Crear documento");
}

function prefillPrescriptionFields() {
  const medication = currentConsultation?.medications_proposed?.[0];
  if (!medication) return;

  const values = {
    clinicalDocumentMedication: medication.name,
    clinicalDocumentPresentation: medication.presentation,
    clinicalDocumentDose: medication.dose,
    clinicalDocumentRoute: medication.route,
    clinicalDocumentFrequency: medication.frequency,
    clinicalDocumentDuration: medication.duration
  };

  Object.entries(values).forEach(([id, value]) => {
    const input = $(id);
    if (input && !input.value.trim()) input.value = value || "";
  });

  const details = $("clinicalDocumentDetails");
  if (details && !details.value.trim()) {
    details.value = [currentConsultation.indicaciones, currentConsultation.tratamiento]
      .filter(Boolean)
      .join("\n\n");
  }
}

function renderPrescriptionPreview() {
  const preview = $("prescriptionPreview");
  if (!preview) return;

  const type = $("clinicalDocumentType")?.value || "RECETA";
  if (type !== "RECETA") {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }

  const medications = currentConsultation?.medications_proposed || [];
  preview.hidden = false;
  preview.innerHTML = medications.length
    ? `<strong>Medicamentos propuestos</strong><ul>${medications.map(item => `<li>${escapeHTML(medicationSummary([item]))}</li>`).join("")}</ul>`
    : `<strong>Receta sin medicamentos propuestos</strong><p class="muted">Completa el tratamiento en “Diagnóstico y plan” para poder guardar la receta.</p>`;
}

function medicationForClinicalDocument(item = {}) {
  const name = String(item.name || item.nombre || item.medicamento || "").trim();
  const presentation = String(item.presentation || item.presentacion || "").trim();
  const dose = String(item.dose || item.dosis || "").trim();
  const route = String(item.route || item.via || item["vía"] || "").trim();
  const frequency = String(item.frequency || item.frecuencia || "").trim();
  const duration = String(item.duration || item.duracion || item["duración"] || "").trim();
  return {
    name, presentation, dose, route, frequency, duration,
    medicamento: [name, presentation].filter(Boolean).join(" · "),
    dosis: dose, via: route, frecuencia: frequency, duracion: duration
  };
}

// El formulario de receta puede ajustar el primer medicamento mostrado.
// Esos ajustes deben viajar en el documento estructurado, no solo en la UI.
function medicationsFromClinicalDocumentForm() {
  const proposed = Array.isArray(currentConsultation?.medications_proposed)
    ? currentConsultation.medications_proposed
    : [];
  const inputs = {
    name: "clinicalDocumentMedication",
    presentation: "clinicalDocumentPresentation",
    dose: "clinicalDocumentDose",
    route: "clinicalDocumentRoute",
    frequency: "clinicalDocumentFrequency",
    duration: "clinicalDocumentDuration"
  };
  return proposed.map((item, index) => {
    if (index !== 0) return { ...item };
    const edited = { ...item };
    for (const [key, id] of Object.entries(inputs)) {
      if ($(id)) edited[key] = $(id).value.trim();
    }
    return edited;
  });
}

function clinicalDocumentContent(type, medications, expiryDate) {
  const details = $("clinicalDocumentDetails")?.value.trim() || "";
  const attention = currentConsultation || {};
  if (type === "RECETA") return {
    medicamentos: medications.map(medicationForClinicalDocument),
    indicaciones: details, fecha_vencimiento: expiryDate,
    fecha_control: attention.fecha_control || "",
    alergias_verificadas: false, tratamiento_revisado: false
  };
  if (type === "ORDEN_EXAMEN") return {
    solicitud: $("clinicalDocumentRequest")?.value.trim() || "",
    prioridad: $("clinicalDocumentPriority")?.value || "Rutina",
    antecedentes_relevantes: attention.resumen || attention.observaciones || "",
    observaciones: details, fecha_vencimiento: expiryDate
  };
  if (type === "DERIVACION") return {
    especialidad_destino: $("clinicalDocumentSpecialty")?.value.trim() || "",
    establecimiento_destino: $("clinicalDocumentDestination")?.value.trim() || "",
    motivo_derivacion: $("clinicalDocumentReferralReason")?.value.trim() || "",
    antecedentes_relevantes: attention.resumen || attention.observaciones || "",
    prioridad: $("clinicalDocumentReferralPriority")?.value || "Preferente",
    fecha_vencimiento: expiryDate
  };
  return {
    contexto: attention.diagnostico || attention.motivo || "", indicaciones: details,
    signos_alarma: $("clinicalDocumentWarningSigns")?.value.trim() || "",
    fecha_control: attention.fecha_control || "", modalidad: attention.modalidad || ""
  };
}

async function saveClinicalDocumentFromFrontend(status) {
  if (!selectedPatient || !currentConsultation) return;
  const type = $("clinicalDocumentType")?.value || "RECETA";
  const issueDate = $("clinicalDocumentIssueDate")?.value || toISODate(new Date());
  const medications = type === "RECETA" ? medicationsFromClinicalDocumentForm() : [];
  if (type === "RECETA" && medications.length > 3) {
    toast("Esta versión del generador PDF admite hasta 3 medicamentos por receta. Divide la prescripción o solicita ampliar la Lambda antes de emitir.");
    return;
  }
  if (type === "RECETA" && (!medications.length || medicationMissing(medications).length)) {
    toast("Completa nombre, presentación, dosis, vía, frecuencia y duración de cada medicamento antes de preparar la receta.");
    return;
  }
  const expiryDate = $("clinicalDocumentExpiryDate")?.value || "";
  if (["RECETA","ORDEN_EXAMEN","DERIVACION"].includes(type) && !expiryDate) { toast("Define la fecha de vencimiento del documento."); return; }
  if (expiryDate && expiryDate < issueDate) { toast("La fecha de vencimiento no puede ser anterior a la emisión."); return; }
  const form = $("clinicalDocumentForm");
  if (form && !form.reportValidity()) return;

  const label = {RECETA:"Receta",ORDEN_EXAMEN:"Orden de examen",DERIVACION:"Derivación",INDICACIONES:"Indicaciones"}[type] || "Documento clínico";
  const document = {
    id_documento:`DOC-${Date.now()}`,
    id_paciente:selectedPatient.id_paciente || selectedPatient.id,
    id_atencion:currentConsultation.id_atencion || currentConsultation.id,
    id_profesional:CURRENT_DOCTOR.id_profesional || CURRENT_DOCTOR.id || "",
    name:label,
    type,
    medications: type === "RECETA" ? medications.map(medicationForClinicalDocument) : [],
    status,
    fecha_emision:issueDate,
    date:issueDate,
    fecha_vencimiento:expiryDate,
    medication: $("clinicalDocumentMedication")?.value.trim() || "",
    presentation: $("clinicalDocumentPresentation")?.value.trim() || "",
    dose: $("clinicalDocumentDose")?.value.trim() || "",
    route: $("clinicalDocumentRoute")?.value.trim() || "",
    frequency: $("clinicalDocumentFrequency")?.value.trim() || "",
    duration: $("clinicalDocumentDuration")?.value.trim() || "",
    details: $("clinicalDocumentDetails")?.value.trim() || "",
    contenido: clinicalDocumentContent(type, medications, expiryDate),
    version:1,
    _demoCreated: Boolean(DEMO_MODE)
  };

  // La emisión definitiva y el PDF los realiza finalizar_atencion en la Lambda.
  // Aquí solo dejamos el documento estructurado asociado a la atención.
  if (!DEMO_MODE && status === "EMITIDO") {
    document.status = "BORRADOR";
    document._localDraft = true;
    if (!Array.isArray(selectedPatient.documents)) selectedPatient.documents=[];
    selectedPatient.documents.push(document);
    DATA.documents = DATA.patients.flatMap(patient => Array.isArray(patient.documents) ? patient.documents : []);
    closeClinicalDocumentModal();
    renderDocuments(); renderConsultationView();
    toast("Documento preparado. El PDF se generará al finalizar la atención.");
    return;
  }

  if (status === "BORRADOR" || DEMO_MODE) {
    document._localDraft = true;
    if (!Array.isArray(selectedPatient.documents)) selectedPatient.documents=[];
    selectedPatient.documents.push(document);
    DATA.documents = DATA.patients.flatMap(patient => Array.isArray(patient.documents) ? patient.documents : []);
    closeClinicalDocumentModal();
    renderDocuments(); renderConsultationView();
    toast(DEMO_MODE ? "Documento guardado en la demostración." : "Borrador guardado solo en esta página. El PDF se creará al finalizar la atención.");
    return;
  }

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,.pdf";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  fileInput.click();
  await new Promise(resolve => fileInput.addEventListener("change", resolve, { once: true }));
  const file = fileInput.files?.[0];
  fileInput.remove();
  if (!file) { toast("Selecciona el PDF que se emitirá para este documento."); return; }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast("Solo se permiten documentos PDF.");
    return;
  }

  const doctorRut = (typeof CURRENT_DOCTOR_RUT !== "undefined" && CURRENT_DOCTOR_RUT) || "";
  const backendType = { RECETA: "Receta", ORDEN_EXAMEN: "Examen", DERIVACION: "Informe", INDICACIONES: "Otro" }[type] || "Otro";
  const patientRutValueForUpload = patientRut(selectedPatient);
  const attentionId = currentConsultation.id_atencion || currentConsultation.id || null;
  try {
    toast("Preparando subida segura a S3...");
    const uploadData = await generarSubidaDocumento({
      rut: patientRutValueForUpload, doctor_rut: doctorRut, id_atencion: attentionId,
      tipo_recurso: backendType, nombre_archivo: file.name, mime_type: "application/pdf"
    });
    const uploadResponse = await window.VIKDemo.fetch(uploadData.upload_url, {
      method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file
    });
    if (!uploadResponse.ok) throw new Error(`S3 rechazó la subida (${uploadResponse.status}).`);
    const description = [document.details, document.medication, document.dose, document.frequency, document.duration, document.fecha_vencimiento ? `Vence: ${document.fecha_vencimiento}` : ""]
      .filter(Boolean).join("\n");
    const registered = await registrarDocumento({
      rut: patientRutValueForUpload, doctor_rut: doctorRut, id_atencion: attentionId,
      tipo_recurso: backendType, nombre: `${label} · ${file.name}`, descripcion: description,
      s3_key: uploadData.s3_key, mime_type: "application/pdf"
    });
    document.id = registered.id_recurso;
    document.id_recurso = registered.id_recurso;
    document.name = `${label} · ${file.name}`;
    document.type = backendType;
    document.tipo_recurso = backendType;
    document.s3_key = uploadData.s3_key;
    document.mime_type = "application/pdf";
    document.status = "Activo";
    document._localDraft = false;
    if (!Array.isArray(selectedPatient.documents)) selectedPatient.documents=[];
    selectedPatient.documents.push(document);
    DATA.documents = DATA.patients.flatMap(patient => Array.isArray(patient.documents) ? patient.documents : []);
    closeClinicalDocumentModal();
    renderDocuments(); renderConsultationView();
    toast("Documento emitido, registrado y guardado en S3.");
  } catch (error) {
    console.error("Error emitiendo documento clínico", error);
    toast(error.message || "No fue posible emitir el documento.");
  }
}

async function finalizeCurrentAttention() {
  if (!selectedPatient || !currentConsultation) return;
  captureAttention();
  const missing = [
    ["motivo", "motivo de consulta"],
    ["observaciones", "evaluación y observaciones"],
    ["diagnostico", "diagnóstico"]
  ].filter(([key]) => !String(currentConsultation[key] || "").trim());
  if (missing.length) {
    toast(`Completa ${missing.map(([, label]) => label).join(", ")} antes de finalizar.`);
    return;
  }
  const documents = (selectedPatient.documents || [])
    .filter(document => document._localDraft && String(document.id_atencion || "") === String(currentConsultation.id_atencion || currentConsultation.id || ""))
    .map(document => ({
      tipo: document.tipo_recurso || document.type || "Otro",
      nombre: document.name || "Documento clínico",
      datos: document
    }));
  const planned = medicationComparisonSnapshot(currentConsultation.medications_proposed || []);
  for (const item of documents) {
    if (String(item.datos?.type || "").toUpperCase() !== "RECETA") continue;
    const prescribed = medicationComparisonSnapshot(item.datos.medications || []);
    if (prescribed.length > 3) {
      toast("No se puede finalizar: una receta tiene más de 3 medicamentos y el PDF solo muestra tres.");
      return;
    }
    if (JSON.stringify(prescribed) !== JSON.stringify(planned)) {
      toast("La receta preparada no coincide con el tratamiento propuesto. Corrige el plan y prepara nuevamente la receta antes de finalizar.");
      return;
    }
  }
  const payload = {
    id_atencion: currentConsultation.id_atencion || currentConsultation.id,
    rut: patientRut(selectedPatient),
    attention: currentConsultation,
    documentos: documents
  };
  const button = document.querySelector('[data-finalize-attention]');
  if (button) { button.disabled = true; button.textContent = "Finalizando…"; }
  try {
    const result = DEMO_MODE
      ? { success: true, estado_atencion: "FINALIZADA", documentos_generados: documents.map((item, index) => ({ ...item, id_recurso: item.datos.id_recurso || `DEMO-DOC-${index + 1}`, estado: "Activo" })) }
      : await finalizeAttentionToAPI(payload);
    currentConsultation.estado = "FINALIZADA";
    currentConsultation.status = "FINALIZADA";
    currentConsultation._serverSaved = true;
    currentConsultation._dirty = false;
    const finalizedId = String(currentConsultation.id_atencion || currentConsultation.id || "");
    DATA.appointments = DATA.appointments.map(item =>
      String(item.id_atencion || item.id || "") === finalizedId
        ? { ...item, ...currentConsultation, estado: "FINALIZADA", status: "FINALIZADA", _dirty: false }
        : item
    );
    DATA.attentions = DATA.attentions.map(item =>
      String(item.id_atencion || item.id || "") === finalizedId
        ? { ...item, ...currentConsultation, estado: "FINALIZADA", status: "FINALIZADA", _dirty: false }
        : item
    );
    if (Array.isArray(selectedPatient.attentions)) {
      selectedPatient.attentions = selectedPatient.attentions.map(item =>
        String(item.id_atencion || item.id || "") === finalizedId
          ? { ...item, ...currentConsultation, estado: "FINALIZADA", status: "FINALIZADA" }
          : item
      );
    }
    attentionDrafts.delete(finalizedId);
    const generated = Array.isArray(result.documentos_generados) ? result.documentos_generados : [];
    generated.forEach((generatedDocument, index) => {
      // La Lambda responde en el mismo orden de los borradores enviados.
      const match = documents[index]?.datos;
      if (!match) return;
      // No almacenar view_url: las URLs prefirmadas son temporales.
      match.id = generatedDocument.id_recurso;
      match.id_recurso = generatedDocument.id_recurso;
      match.s3_key = generatedDocument.s3_key || match.s3_key;
      match.mime_type = generatedDocument.mime_type || "application/pdf";
      match._localDraft = false;
      match.status = "Activo";
    });
    renderConsultationView();
    renderDocuments();
    toast(generated.length === documents.length
      ? "Atención finalizada y documentos generados correctamente."
      : "La atención se finalizó, pero la API no confirmó todos los documentos. Revisa la ficha antes de continuar.");
    setTimeout(() => switchView("seguimiento"), 450);
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = "Finalizar atención"; }
    toast(error.message || "No fue posible finalizar la atención.");
  }
}

/* =========================================================
   EDIT PATIENT
   ========================================================= */

function openEditPatientModal() {

  if (!selectedPatient) {
    toast("No hay un paciente seleccionado.");
    return;
  }

  const modal = $("editPatientModal");

  if (!modal) {
    toast("No se encontró la ventana de edición.");
    console.error(
      "No existe #editPatientModal en index.html"
    );
    return;
  }


  const fields = {
    editPatientName:
      selectedPatient.nombre ||
      selectedPatient.name ||
      "",

    editPatientLastName:
      selectedPatient.apellido ||
      selectedPatient.last_name ||
      "",

    editPatientRut:
      selectedPatient.rut ||
      "",

    editPatientBirthDate:
      toISODate(
        selectedPatient.fecha_nacimiento ||
        selectedPatient.birth_date
      ),

    editPatientSex:
      selectedPatient.sexo ||
      selectedPatient.sex ||
      "",

    editPatientNationality:
      selectedPatient.nacionalidad ||
      selectedPatient.nationality ||
      "",

    editPatientEthnicity:
      selectedPatient.etnia ||
      selectedPatient.ethnicity ||
      "",

    editPatientReligion:
      selectedPatient.religion ||
      "",

    editPatientBloodGroup:
      selectedPatient.grupo_sanguineo ||
      selectedPatient.blood_type ||
      "",

    editPatientPhone:
      selectedPatient.telefono ||
      selectedPatient.phone ||
      "",

    editPatientEmail:
      selectedPatient.correo ||
      selectedPatient.email ||
      ""
  };


  Object.entries(fields).forEach(
    ([id, value]) => {

      const field = $(id);

      if (field) {
        field.value = value;
      }

    }
  );


  /*
   * The patient's RUT must never be edited.
   */

  const rutField = $("editPatientRut");

  if (rutField) {
    rutField.readOnly = true;
  }


  /*
   * Open the modal.
   */

  if (typeof modal.showModal === "function") {

    if (!modal.open) {
      modal.showModal();
    }

  } else {

    modal.hidden = false;

  }
}


/* =========================================================
   CLOSE EDIT PATIENT MODAL
   ========================================================= */

function closeEditPatientDialog() {

  const modal = $("editPatientModal");

  if (!modal) {
    return;
  }

  if (
    typeof modal.close === "function" &&
    modal.open
  ) {

    modal.close();

  } else {

    modal.hidden = true;

  }
}


/* =========================================================
   SAVE PATIENT CHANGES
   ========================================================= */

async function savePatientChanges(event) {

  event.preventDefault();


  if (!selectedPatient) {
    toast("No hay un paciente seleccionado.");
    return;
  }


  /*
   * Safely read a form field.
   */

  const getValue = id => {

    const field = $(id);

    if (!field) {
      return "";
    }

    return field.value.trim();

  };


  /*
   * Values entered by the doctor.
   */

  const newValues = {

    nombre:
      getValue("editPatientName"),

    apellido:
      getValue("editPatientLastName"),

    fecha_nacimiento:
      $("editPatientBirthDate")?.value || "",

    sexo:
      getValue("editPatientSex"),

    nacionalidad:
      getValue("editPatientNationality"),

    etnia:
      getValue("editPatientEthnicity"),

    religion:
      getValue("editPatientReligion"),

    grupo_sanguineo:
      getValue("editPatientBloodGroup"),

    telefono:
      getValue("editPatientPhone"),

    correo:
      getValue("editPatientEmail")
  };


  /*
   * Existing patient values.
   */

  const currentValues = {

    nombre:
      selectedPatient.nombre ||
      selectedPatient.name ||
      "",

    apellido:
      selectedPatient.apellido ||
      selectedPatient.last_name ||
      "",

    fecha_nacimiento:
      toISODate(
        selectedPatient.fecha_nacimiento ||
        selectedPatient.birth_date
      ),

    sexo:
      selectedPatient.sexo ||
      selectedPatient.sex ||
      "",

    nacionalidad:
      selectedPatient.nacionalidad ||
      selectedPatient.nationality ||
      "",

    etnia:
      selectedPatient.etnia ||
      selectedPatient.ethnicity ||
      "",

    religion:
      selectedPatient.religion ||
      "",

    grupo_sanguineo:
      selectedPatient.grupo_sanguineo ||
      selectedPatient.blood_type ||
      "",

    telefono:
      selectedPatient.telefono ||
      selectedPatient.phone ||
      "",

    correo:
      selectedPatient.correo ||
      selectedPatient.email ||
      ""
  };


  /*
   * Only send fields that changed.
   */

  const cambios = {};

  Object.keys(newValues).forEach(field => {

    if (
      String(newValues[field] ?? "") !==
      String(currentValues[field] ?? "")
    ) {

      cambios[field] = newValues[field];

    }

  });


  /*
   * Nothing changed.
   */

  if (Object.keys(cambios).length === 0) {

    closeEditPatientDialog();

    toast("No se realizaron cambios.");

    return;
  }


  /*
   * Use the same professional RUT that came from the login/session.
   * This keeps patient editing attached to the authenticated doctor.
   */

  const doctorRut =
    (typeof CURRENT_DOCTOR_RUT !== "undefined" && CURRENT_DOCTOR_RUT) ||
    sessionStorage.getItem("rut") ||
    "22.222.222-2";


  try {

    toast("Guardando cambios...");


    const result = DEMO_MODE
      ? { demo: true, message: "Cambios conservados temporalmente en la demostración." }
      : await updatePatientInAPI(
          selectedPatient.rut,
          doctorRut,
          cambios
        );


    /* =====================================================
       UPDATE THE PATIENT SHOWN ON SCREEN
       ===================================================== */

    const updatedPatient = {
      ...selectedPatient
    };


    /*
     * Spanish fields.
     */

    if ("nombre" in cambios) {
      updatedPatient.nombre =
        cambios.nombre;
    }

    if ("apellido" in cambios) {
      updatedPatient.apellido =
        cambios.apellido;
    }

    if ("fecha_nacimiento" in cambios) {
      updatedPatient.fecha_nacimiento =
        cambios.fecha_nacimiento;
    }

    if ("sexo" in cambios) {
      updatedPatient.sexo =
        cambios.sexo;
    }

    if ("nacionalidad" in cambios) {
      updatedPatient.nacionalidad =
        cambios.nacionalidad;
    }

    if ("etnia" in cambios) {
      updatedPatient.etnia =
        cambios.etnia;
    }

    if ("religion" in cambios) {
      updatedPatient.religion =
        cambios.religion;
    }

    if ("grupo_sanguineo" in cambios) {
      updatedPatient.grupo_sanguineo =
        cambios.grupo_sanguineo;
    }

    if ("telefono" in cambios) {
      updatedPatient.telefono =
        cambios.telefono;
    }

    if ("correo" in cambios) {
      updatedPatient.correo =
        cambios.correo;
    }


    /*
     * English aliases used by the frontend.
     */

    if ("nombre" in cambios) {

      updatedPatient.name =
        cambios.nombre;

      updatedPatient.first_name =
        cambios.nombre;
    }

    if ("apellido" in cambios) {
      updatedPatient.last_name =
        cambios.apellido;
    }

    if ("fecha_nacimiento" in cambios) {
      updatedPatient.birth_date =
        cambios.fecha_nacimiento;
    }

    if ("sexo" in cambios) {
      updatedPatient.sex =
        cambios.sexo;
    }

    if ("nacionalidad" in cambios) {
      updatedPatient.nationality =
        cambios.nacionalidad;
    }

    if ("etnia" in cambios) {
      updatedPatient.ethnicity =
        cambios.etnia;
    }

    if ("grupo_sanguineo" in cambios) {
      updatedPatient.blood_type =
        cambios.grupo_sanguineo;
    }

    if ("telefono" in cambios) {
      updatedPatient.phone =
        cambios.telefono;
    }

    if ("correo" in cambios) {
      updatedPatient.email =
        cambios.correo;
    }


    /*
     * Update the currently selected patient.
     */

    selectedPatient =
      updatedPatient;


    /*
     * Keep DATA.patients synchronized.
     */

    const patientIndex =
      DATA.patients.findIndex(
        patient =>
          patientRut(patient) ===
          selectedPatient.rut
      );


    if (patientIndex >= 0) {

      DATA.patients[patientIndex] = {
        ...DATA.patients[patientIndex],
        ...selectedPatient
      };

      selectedPatient =
        DATA.patients[patientIndex];

    }


    /*
     * Refresh the interface.
     */

    renderRecord();

    renderPatients();

    renderHome();

    renderDocuments();


    /*
     * Close the edit window.
     */

    closeEditPatientDialog();


    /*
     * Success message.
     */

    toast(
      "La información del paciente fue actualizada correctamente."
    );


    console.log(
      "Paciente actualizado correctamente:",
      result
    );

  } catch (error) {

    console.error(
      "Error al actualizar paciente:",
      error
    );

    toast(
      error.message ||
      "No fue posible actualizar la información del paciente."
    );

  }
}
