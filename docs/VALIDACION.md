# Validación de la demo

Se ejecutaron pruebas del adaptador y un recorrido con Chromium sin interfaz. Las comprobaciones se realizaron bajo una subruta (`/portfolio-vik/`) para detectar rutas absolutas que fallarían en un repositorio de GitHub Pages.

## Pruebas automatizadas del adaptador

Ocho pruebas con `node --test tests/demo.test.cjs`:

- Credenciales ficticias válidas e inválidas, rol e identidad de paciente.
- Revocación, solicitud renovada y aprobación antes de abrir la ficha.
- Guardado y finalización de atención, vínculo de PDF y consulta desde paciente.
- Aceptación de seguimiento y rechazo de una segunda respuesta.
- Regeneración de QR, invalidez del token anterior y desactivación.
- Operaciones desconocidas con error explícito, sin cambios silenciosos.
- Restricción de mutaciones al portal correspondiente.
- Matriz QR contrastada con una referencia independiente y límite de capacidad.

## Recorrido probado en las pantallas

- Portada → acceso directo a doctora y paciente.
- Login por formulario bajo subruta de repositorio.
- Consulta por RUT → apertura de ficha → inicio de una atención.
- Evaluación, diagnóstico y plan → respuesta SafeMed identificada como simulada.
- Preparación de indicaciones → finalización → un único registro finalizado y un documento vinculado.
- Cambio a paciente → documento disponible.
- Aceptación de propuesta de seguimiento → cita ficticia persistida.
- Revocación de acceso y regeneración confirmada de QR.
- SafeMed Paciente → respuesta simulada.
- Apertura de página de emergencia con el token vigente.
- Dashboard con los datos locales actualizados.
- Pantallas de paciente y doctor a 390 px de ancho sin desbordamiento horizontal de página.
- Ausencia de errores JavaScript durante las pruebas y ausencia de peticiones a servicios externos en el recorrido.

Se revisaron las referencias estáticas de los HTML y no quedaron rutas a archivos inexistentes. También se comprobó la sintaxis de los scripts principales.

## Alcance de las comprobaciones

No se publicó un sitio en una cuenta GitHub durante la preparación. El entorno remoto de Pages, Safari, Firefox y navegadores móviles físicos requieren comprobarse después de la publicación. Las pruebas de esta demo no certifican el MVP original en AWS ni convierten los permisos locales en un mecanismo de seguridad productivo.

## Plantillas de documentos
Las cuatro plantillas PDF se adaptaron desde la Lambda Doctor proporcionada: receta, orden médica, derivación e indicaciones. Conservan geometría A4, cabecera VIK, Helvetica, paleta verde petróleo/lavanda y recuadros. Se añadió identificación de DEMO y se eliminaron referencias a firmas válidas. Se validaron los cuatro PDF por renderizado y los campos largos generan continuación sin perder el contenido estructurado. No requieren AWS, Python ni librerías externas en el navegador.

Los documentos iniciales del portal paciente (recursos 505 y 506) se entregan completos como PDF estáticos en documents/. El adaptador actualiza esos dos registros en datos locales de versiones anteriores y sus botones abren directamente los archivos incluidos.
