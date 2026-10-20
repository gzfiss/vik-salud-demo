"use strict";

const $ = id => document.getElementById(id);

// =====================================================
// CONFIGURACIÓN API
// =====================================================

const API_URL =
  "demo:login";

// =====================================================
// CONFIGURACIÓN DE ROLES
// =====================================================

let role = "doctor";

const config = {
  doctor: {
    label: "RUT",
    type: "text",
    placeholder: "12.345.678-9",
    help: "Ingresa tu RUT con dígito verificador.",
    context: "Acceso para profesionales autorizados de VIK Salud.",
    button: "Ingresar como doctor",
    destination: "../doctor/index.html"
  },

  paciente: {
    label: "RUT",
    type: "text",
    placeholder: "12.345.678-9",
    help: "Ingresa tu RUT con dígito verificador.",
    context: "Accede a tu ficha, documentos, citas y autorizaciones.",
    button: "Ingresar como paciente",
    destination: "../paciente/index.html"
  },

  directorio: {
    label: "RUT",
    type: "text",
    placeholder: "33.333.333-3",
    help: "Ingresa el RUT de tu cuenta de Directorio.",
    context: "Acceso exclusivo al panel ejecutivo de VIK Salud.",
    button: "Ingresar a Directorio",
    destination: "../VIK_dashboard/index.html"
  }
};

// =====================================================
// SELECCIONAR ROL
// =====================================================

function selectRole(nextRole) {
  if (!config[nextRole]) {
    console.error("Rol no reconocido:", nextRole);
    return;
  }

  role = nextRole;

  const c = config[role];

  document.querySelectorAll(".role-button").forEach(button => {
    const active = button.dataset.role === role;

    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  $("identifierLabel").textContent = c.label;
  $("identifier").type = c.type;
  $("identifier").placeholder = c.placeholder;
  $("identifier").value = "";
  $("identifierHelp").textContent = c.help;
  $("roleContext").lastElementChild.textContent = c.context;
  $("submitButton").textContent = c.button;
  $("loginError").textContent = "";

  $("identifier").focus();
}

// =====================================================
// VALIDAR RUT CHILENO
// =====================================================

function validRut(value) {
  const rut = value
    .replace(/[.\-\s]/g, "")
    .toUpperCase();

  if (!/^\d{7,8}[0-9K]$/.test(rut)) {
    return false;
  }

  let sum = 0;
  let factor = 2;

  for (const digit of rut.slice(0, -1).split("").reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const dv = 11 - (sum % 11);

  const expected =
    dv === 11
      ? "0"
      : dv === 10
        ? "K"
        : String(dv);

  return rut.at(-1) === expected;
}

// =====================================================
// MOSTRAR MENSAJES TEMPORALES
// =====================================================

function toast(message) {
  const toastElement = $("toast");

  toastElement.textContent = message;
  toastElement.hidden = false;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    toastElement.hidden = true;
  }, 3200);
}

// =====================================================
// CAMBIO DE ROL
// =====================================================

document.querySelectorAll(".role-button").forEach(button => {
  button.addEventListener("click", () => {
    selectRole(button.dataset.role);
  });
});

// =====================================================
// MOSTRAR / OCULTAR CONTRASEÑA
// =====================================================

$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  const showing = input.type === "text";

  input.type = showing ? "password" : "text";
  $("togglePassword").textContent = showing ? "Ver" : "Ocultar";

  $("togglePassword").setAttribute(
    "aria-label",
    showing ? "Mostrar contraseña" : "Ocultar contraseña"
  );
});

// =====================================================
// RECUPERAR CONTRASEÑA
// =====================================================

$("forgotPassword").addEventListener("click", () => {
  toast("La recuperación de contraseña se conectará al backend de VIK.");
});

// =====================================================
// INICIO DE SESIÓN
// =====================================================

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const identifier = $("identifier").value.trim();
  const password = $("password").value;
  const error = $("loginError");
  const submitButton = $("submitButton");

  error.textContent = "";

  // Validar campos obligatorios
  if (!identifier || !password) {
    error.textContent = "Completa tus datos de acceso.";
    return;
  }

  // Validar RUT
  if (!validRut(identifier)) {
    error.textContent =
      "Ingresa un RUT válido, incluido su dígito verificador.";
    return;
  }

  // Validar longitud mínima de contraseña
  if (password.length < 6) {
    error.textContent =
      "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Verificando...";

  try {
    // Enviar credenciales a API Gateway
    const response = await window.VIKDemo.fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rut: identifier,
        password: password,
        role: role
      })
    });

    // Leer respuesta del servidor
    const data = await response.json();

    // Comprobar resultado del inicio de sesión
    if (!response.ok || !data.success || !data.user) {
      error.textContent =
        data.message || "No fue posible iniciar sesión.";
      return;
    }

    // Comprobar que el rol de la cuenta coincida
    if (data.user.role !== role) {
      error.textContent =
        "La cuenta no tiene permisos para acceder a este portal.";
      return;
    }

    // Guardar información de la sesión
    sessionStorage.setItem("vikUser", JSON.stringify(data.user));
    sessionStorage.setItem("vikSession", JSON.stringify(data.user));
    sessionStorage.setItem("vikRut", data.user.rut || identifier);
    sessionStorage.setItem("vikRole", data.user.role);

    const fullName = [
      data.user.name || "",
      data.user.last_name || ""
    ].filter(Boolean).join(" ");

    toast(
      fullName
        ? `Bienvenida/o, ${fullName}`
        : "Inicio de sesión exitoso."
    );

    // Redirigir según el rol
    setTimeout(() => {
      window.location.href = config[role].destination;
    }, 700);

  } catch (err) {
    console.error("Error de conexión con VIK Salud:", err);

    error.textContent =
      "No fue posible conectar con el servidor. Inténtalo nuevamente.";

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = config[role].button;
  }
});

// =====================================================
// INICIAR LOGIN
// =====================================================

selectRole("doctor");