"use strict";

// API Gateway conectado a la Lambda de paciente.
const API_URL =
    "demo:paciente";

document.addEventListener(
    "DOMContentLoaded",
    () => {
        cargarInformacionEmergencia();
    }
);

function obtenerTokenQR() {
    // NUEVO QR: index.html#token=UUID
    // Usamos hash para que no choque con los parámetros X-Amz-* de S3.
    const hash =
        window.location.hash.replace(/^#/, "");

    const parametrosHash =
        new URLSearchParams(hash);

    const tokenHash =
        parametrosHash.get("token");

    if (tokenHash && tokenHash.trim()) {
        return tokenHash.trim();
    }

    // Compatibilidad con enlaces anteriores:
    // index.html?token=UUID
    const parametrosQuery =
        new URLSearchParams(
            window.location.search
        );

    const tokenQuery =
        parametrosQuery.get("token");

    if (tokenQuery && tokenQuery.trim()) {
        return tokenQuery.trim();
    }

    return "";
}

async function cargarInformacionEmergencia() {

    const loading =
        document.getElementById("loading");

    const patientData =
        document.getElementById("patient-data");

    const errorCard =
        document.getElementById("error");

    const errorMessage =
        document.getElementById("error-message");

    try {

        const token =
            obtenerTokenQR();

        if (!token) {
            throw new Error(
                "El código QR no contiene un token válido."
            );
        }

        const response =
            await window.VIKDemo.fetch(
                API_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        accion: "consultar_qr",
                        token: token
                    })
                }
            );

        let resultado =
            await response.json();

        // Compatible con integración Lambda proxy.
        if (
            resultado &&
            resultado.body !== undefined
        ) {
            resultado =
                typeof resultado.body === "string"
                    ? JSON.parse(resultado.body)
                    : resultado.body;
        }

        if (
            !response.ok ||
            resultado?.error
        ) {
            throw new Error(
                resultado?.error ||
                "No fue posible consultar la información."
            );
        }

        if (
            resultado.qr_activo === false
        ) {
            throw new Error(
                "Este código QR se encuentra inactivo."
            );
        }

        mostrarPaciente(
            resultado
        );

        loading.classList.add(
            "hidden"
        );

        errorCard.classList.add(
            "hidden"
        );

        patientData.classList.remove(
            "hidden"
        );

    }
    catch (error) {

        console.error(
            "Error QR:",
            error
        );

        loading.classList.add(
            "hidden"
        );

        patientData.classList.add(
            "hidden"
        );

        errorMessage.textContent =
            error.message;

        errorCard.classList.remove(
            "hidden"
        );
    }
}

function mostrarPaciente(datos) {

    document.getElementById(
        "patient-name"
    ).textContent =
        datos.paciente?.nombre || "--";

    document.getElementById(
        "patient-age"
    ).textContent =
        datos.paciente?.edad ?? "--";

    document.getElementById(
        "blood-type"
    ).textContent =
        datos.paciente?.tipo_sangre || "--";

    mostrarLista(
        "allergies",
        datos.informacion_medica
            ?.alergias_medicamentos
    );

    mostrarLista(
        "conditions",
        datos.informacion_medica
            ?.enfermedades_cronicas
    );

    document.getElementById(
        "contact-name"
    ).textContent =
        datos.contacto_emergencia?.nombre || "--";

    document.getElementById(
        "contact-phone"
    ).textContent =
        datos.contacto_emergencia?.telefono || "--";
}

function mostrarLista(
    elementId,
    lista
) {

    const elemento =
        document.getElementById(
            elementId
        );

    elemento.innerHTML = "";

    if (
        !lista ||
        lista.length === 0
    ) {
        elemento.textContent =
            "--";

        return;
    }

    lista.forEach(
        item => {

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "item";

            div.textContent =
                item;

            elemento.appendChild(
                div
            );
        }
    );
}
