# Arquitectura de la demo

## Problema y alcance

VIK explora cómo organizar antecedentes, documentos y seguimiento cuando una persona recibe atención de distintos equipos. Este portafolio permite recorrer los flujos dentro del modelo propio del proyecto; no intercambia información con sistemas de prestadores.

## Diseño local

Las interfaces HTML, CSS y JavaScript se conservan. Las API de los portales utilizan un adaptador explícito (`VIKDemo.fetch`), con rutas `demo:doctor`, `demo:paciente`, `demo:login` y `demo:safemed-*`. No se intercepta globalmente `fetch`: los puntos de integración se adaptaron para que no invoquen los endpoints del entorno original.

`shared/demo.js` mantiene pacientes, atenciones, recursos, solicitudes y movimientos en `localStorage`. La clave incluye la ruta del proyecto, para separar instalaciones bajo distintos repositorios del mismo dominio. El contexto del usuario de demostración se guarda por pestaña en `sessionStorage`.

La demostración comprueba rol, paciente objetivo y autorización vigente antes de operaciones clínicas del doctor. Estas comprobaciones ilustran reglas de negocio; cualquier persona puede modificar el JavaScript o el almacenamiento local. No son un control de seguridad apto para datos reales.

## Documentos

Los documentos iniciales de indicaciones y derivación se incluyen completos como PDF en `documents/`. Los nuevos documentos se generan localmente con geometría, paleta y secciones adaptadas de la Lambda Doctor: receta, orden médica, derivación e indicaciones. Los campos largos pasan a páginas de continuación. Los datos estructurados se guardan para regenerar los PDF mediante URL Blob. No se suben archivos a S3 ni se emiten documentos válidos o firmados.

## QR

`shared/qr.js` implementa QR en modo byte, versión 8, corrección L y máscara 0. Su capacidad máxima es 192 bytes UTF-8. Se contrastó su matriz con una implementación independiente durante el desarrollo. Las rutas habituales de GitHub Pages quedan dentro de esa longitud; enlaces inusualmente largos requieren ampliar el codificador.

La URL contiene un token de ejemplo, no la ficha completa. La consulta encuentra el estado local de ese token. La regeneración y la revocación pertenecen al navegador donde se modificaron; no representan un servicio público de consulta de emergencia ni sincronización entre dispositivos.

## SafeMed

El adaptador devuelve ejemplos explícitamente simulados para doctor, revisión y chat. El resumen cuenta registros declarados. No hay modelo, razonamiento clínico, consulta farmacológica ni llamadas a Bedrock. La demostración no utiliza el texto ingresado para diagnosticar o proponer tratamientos.

## Recuperación

Reiniciar demo sustituye el estado ficticio local por los ejemplos iniciales y elimina sus registros locales de tomas y recordatorios asociados a esta ruta. No toca servicios AWS. Si el navegador bloquea el almacenamiento o agota la cuota, la aplicación muestra un error de guardado; no debe utilizarse con datos personales.

## Evolución hacia una aplicación real

Un despliegue clínico necesitaría identidad verificable en backend, autorización por recurso, almacenamiento centralizado, auditoría y recuperación probadas, además de una evaluación específica de privacidad y seguridad. Esa evolución es distinta de esta versión estática de portafolio.
