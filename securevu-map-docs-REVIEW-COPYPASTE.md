# SecureVu Map — textos para revisión (copy-paste)

Selecciona todo (Cmd+A) y copia, o copia por sección A–F.

================================================================================
A) GUÍA IN-APP (`/guia.html`)
================================================================================

Guía — SecureVu Map ‹ Volver al mapa SecureVu Map · Guía Guías 1 · Primeros pasos 2 · Monitorear cámaras 3 · Videowall 4 · Disponibilidad 5 · Alarmas SOS / Tamper 6 · PTZ e Intercom 7 · Asistente operativo 8 · Administración

Guía de uso de SecureVu Map

SecureVu Map es el mapa de monitoreo de cámaras: muestra cada
        cámara, su estado en vivo, el video en tiempo real, la disponibilidad histórica
        y las alarmas de pánico (SOS) y sabotaje (Tamper) de cada sitio. Esta guía está
        organizada en pasos.

Nota: Lo marcado con Admin es
        solo para administradores.

1 Primeros pasos

1. Inicia sesión

- Abre la dirección de la app:

- https://mh.map.secure.vu/

- https://172.20.0.9/

- Escribe tu usuario y contraseña y pulsa Entrar.

- Si tu organización lo activó, también puedes Continuar con Microsoft o Continuar con Google con tu cuenta corporativa.

- La primera vez por SSO, tu acceso queda pendiente de aprobación: verás «solicitud enviada». Un administrador la aprueba y luego entras normalmente.

- ¿Olvidaste la contraseña? Un administrador tendrá que restablecerla en Administración → Usuarios. Con cuenta local puedes cambiarla desde el menú de perfil (icono de persona).

2. Conoce la pantalla

- Barra superior: título (SecureVu Map + interruptor 3D de edificios), contadores de estado (clic → estadísticas), filtros Servidor y Tipo, botón Buscar, 🔔 alarmas, ❓ ayuda, ⚙ administración Admin, menú de perfil y Salir.

- Mapa: un marcador por sitio/PMI.

- Popups flotantes: al elegir una cámara se abre una tarjeta anclada al marcador (puedes abrir varias a la vez).

- 💬 Asistente (abajo a la izquierda): reportes y consultas en español.

2 Monitorear cámaras

1. Lee los marcadores

- Verde: en línea (sesión SecureVu activa).

- Ámbar: en espera (el video suele abrir al elegir la cámara).

- Rojo: fuera de línea.

- Gris: sin transmisión.

- Un número indica cuántas cámaras agrupa ese sitio. El color del grupo resume el peor estado por mayoría en el sitio.

2. Abre popups (varias a la vez)

- Haz clic en un marcador: se abre un popup flotante con video en vivo. Puedes abrir varios; cada uno tiene su propia X. Popups ✕ en la barra superior cierra todos.

- El título del popup es un enlace a SecureVu de esa cámara.

- Listado de cámaras (derecha del video): iconos por tipo (PTZ, bullet, LPR…) con punto de estado; colapsado = solo iconos; expandido = nombres. Cambia de cámara del mismo PMI sin cerrar el popup.

- Grabación servidor · 24 h y, si la cámara lo soporta, Grabación en PMI · 24 h (menú colapsable). Clic sobre cada uno abre SecureVu o la web de la cámara.

- 🔇 Selector de audio (si la cámara está habilitada) en la esquina inferior izquierda del popup. En la transmisión: ⛶ pantalla completa (zoom digital con rueda), selector de stream HD|SD, ↻ reconectar.

- Casilla Videowall en el popup: agrega el PMI con todas sus cámaras al muro con vista en vivo al presionar el botón VW en la barra superior.

3 Videowall

1. Arma el muro

- Selecciona PMIs/cámaras en el mapa (casilla Videowall) o usa Agregar una vez en la pantalla de videowall.

- La cuadrícula se ajusta sola (1, 2×2, etc.). Cada baldosa tiene punto de estado (verde/ámbar/rojo), selector de stream HD|SD, silenciar, pantalla completa, PTZ (si aplica) y × para quitar.

- Si el PMI tiene alarma: el marco cambiará de color al igual que el marcador en el mapa:

- Rojo = SOS

- Morado = Tamper

- Combinado = SOS + Tamper

- ← Mapa regresa al mapa.

4 Disponibilidad

1. Revisa la disponibilidad

- Haz clic en los contadores de la barra superior para el resumen global, con selector Hoy / 7 días / Mes / Periodo y la disponibilidad por servidor (nombres de proyecto).

- Hoy cubre desde la medianoche (hora CDMX) hasta el momento en que se da clic.

5 Alarmas SOS / Tamper

1. Atiende una alarma

- Al dispararse SOS o Tamper aparece un marcador pulsante (rojo = SOS, morado = Tamper; si hay ambas, el marcador se parte en mitades). La campana 🔔 muestra un contador.

- Sonido: SOS = secuencia urgente (varios beeps); Tamper = tono suave. El botón de altavoz en el panel silencia ambos.

- Puedes abrir las alarmas en ventana aparte (↗). Cada alarma: ACTIVA → RECONOCIDA → RESUELTA.

- Reconocer · Resolver · Nota · Ver cámaras · Grabación (abre clips del momento de todas las cámaras del PMI).

- Cada acción queda en la bitácora y en Auditoría con tu usuario y la hora.

2. Ticket para el equipo de monitoreo

- Cada alarma abre automáticamente un ticket en FreshService (SOS = Urgente, Tamper = Alta).

- En la tarjeta verás el enlace 🎫 Ticket #…. Al Resolver, el ticket se cierra; Reconocer/Nota se anotan.

- Si un ticket no se pudo crear, la tarjeta muestra ⚠️ Ticket no creado; el sistema reintenta solo.

6 PTZ e Intercom

1. Control PTZ

- En cámaras PTZ, el pie del popup muestra Control disponible → clic → Controlando (verde). Flechas / + − mueven y hacen zoom óptico; en pantalla completa hay control d-pad y zoom óptico.

- Solo una cámara en control a la vez. Admin siempre puede; en rol Usuario se requiere autorización del Admin.

- El mapa usa el control de SecureVu para este tipo de cámaras; sin embargo, cualquier cámara puede ser controlada.

2. Hablar (Intercom)

- Botón Hablar junto al control PTZ: llama al intercomunicador del PMI.

- Requiere que tengas una extensión de operador en el conmutador; el botón se ve deshabilitado hasta que te sea asignada una por el Admin.

7 Asistente operativo

1. Pregunta en cualquier idioma

- El botón 💬 abre el asistente. Responde con texto y, cuando aplica, tarjetas (KPI, barras, tablas) de estado, alarmas o actividad.

- Ejemplos: «¿cuántas cámaras hay en línea?», «ubicación del PMI 469», «¿hubo SOS hoy?», «reporte de alarmas».

8 Administración Admin

1. Navegación y servidores

- Regresar a Mapa (flecha en la barra) vuelve al mapa.

- Servidores: IPs SecureVu, sufijos de stream, descubrir cámaras, Asistente IA, plantilla CSV.

- Coordenadas: CSV/Excel con mapeo (preferir llave = IP), Probar y Publicar.

- Inventario PMI: estado de routers/Hipervisores y cámaras por PMI.

2. Usuarios, ACL e impersonación

- Roles UI: Usuario y Admin.

- Por PMI y/o cámaras concretas puedes restringir qué ve un Usuario. Sin ACL = ve todo; lista vacía guardada = sin acceso.

- Control PTZ en Usuario (checkbox). Icono Entrar como abre el mapa como ese Usuario; banner Volver restaura al Admin.

- SSO: solicitudes pendientes Aprueba/Rechaza.

3. Auditoría y SecureTrax

- Pestaña Auditoría: log append-only (login, PTZ, alarmas, chat, floats, videowall…) con usuario actor real (también bajo impersonación). Filtros + CSV.

- Integración SecureTrax / FreshService: estado del enlace MQTT y tickets.

- Asistente → Ver conversaciones: bitácora de chat (aparte del log de auditoría).

SecureVu Map · Guía de usuario. Para soporte, contacta a tu administrador.

================================================================================
B) CURSO ODOO — artículos
================================================================================

## [Introducción] ¿Qué es SecureVu Map?

¿Qué es SecureVu Map?
¿Qué es SecureVu Map?
SecureVu Map es el mapa de monitoreo de las cámaras de videovigilancia. Muestra cada cámara, su estado en vivo (en línea / en espera / fuera), el video en tiempo real, la disponibilidad histórica y las alarmas SOS y Tamper de cada sitio. Opción 3D de edificios en la barra.
- Usuario: monitorea (mapa, popups, videowall, alarmas, asistente; PTZ si se autoriza).
- Admin: además configura servidores, coordenadas, usuarios/ACL, auditoría e integraciones. Lo marcado con Admin es solo para administradores.Guía in-app: /guia.html (icono ❓).

## [Introducción] Acceso y roles

Acceso y roles
Acceso y roles
Abre la dirección de la app:
- https://mh.map.secure.vu/
- https://172.20.0.9/Usuario/contraseña → Entrar. Si está activado: Continuar con Microsoft o Google (primera vez SSO = pendiente de aprobación).RolPuedeUsuarioMapa, video, disponibilidad, alarmas, videowall y asistente; puede estar restringido por PMI/cámara.AdminTodo lo anterior + Administración (incluye «Regresar a Mapa» e impersonar Usuarios).¿Olvidaste la contraseña? Un Admin tendrá que restablecerla en Administración → Usuarios. Cuenta local: menú de perfil.

## [Uso (Usuario)] El mapa y los marcadores

El mapa y los marcadores
El mapa y los marcadores
Cada marcador es un sitio/PMI. El color resume el estado:
- 🟢 Verde: en línea (sesión SecureVu activa).
- 🟠 Ámbar: en espera (el video suele abrir al elegir la cámara).
- 🔴 Rojo: fuera de línea.
- ⚪ Gris: sin transmisión.Varias cámaras → número en el marcador. Color del grupo = peor estado por mayoría. Interruptor 3D = edificios.

## [Uso (Usuario)] Popups flotantes y listado de cámaras

Popups flotantes y listado de cámaras
Popups flotantes y listado de cámaras
Al hacer clic se abre un popup flotante (puedes abrir varios; Popups ✕ cierra todos). El título es el enlace SecureVu.
- Listado de cámaras (derecha): iconos por tipo con punto de estado; colapsado/expandido; cambia cámara del mismo PMI.
- Grabación servidor · 24 h y Grabación en PMI · 24 h (menú colapsable); clic abre SecureVu o la web de la cámara.
- 🔇 audio (esquina inferior izquierda); ⛶ HD|SD ↻ en la transmisión.
- Casilla Videowall → PMI completo; botón VW en la barra.

## [Uso (Usuario)] Videowall

Videowall
Videowall
Casilla Videowall o Agregar una vez en la pantalla de videowall. Baldosas: punto de estado, HD|SD, silenciar, pantalla completa, PTZ y ×. Marcos: Rojo SOS / Morado Tamper / Combinado. ← Mapa regresa.

## [Uso (Usuario)] Estadísticas de disponibilidad

Estadísticas de disponibilidad
Estadísticas de disponibilidad
Clic en los contadores de la barra. Periodos: Hoy / 7 días / Mes / Periodo. Tabla por servidor con nombres de proyecto. Hoy cubre desde la medianoche (hora CDMX) hasta el momento del clic.

## [Uso (Usuario)] Alarmas SOS / Tamper

Alarmas SOS / Tamper
Alarmas SOS / Tamper
Marcador pulsante (rojo SOS / morado Tamper). Sonido: SOS = secuencia urgente; Tamper = tono suave; el altavoz del panel silencia ambos.Estados ACTIVA → RECONOCIDA → RESUELTA. Acciones: Reconocer, Resolver, Nota, Ver cámaras, Grabación. Ventana aparte. Ticket FreshService automático (SOS = Urgente, Tamper = Alta). Cada acción queda en bitácora y Auditoría.

## [Uso (Usuario)] PTZ e Intercom Hablar

PTZ e Intercom Hablar
PTZ e Intercom Hablar
PTZ: Control disponible → Controlando → flechas / + − (d-pad en pantalla completa). Solo una cámara a la vez. Admin siempre; Usuario requiere autorización del Admin. El mapa usa el control de SecureVu; cualquier cámara puede ser controlada.Hablar: botón junto al PTZ; llama al intercomunicador del PMI. Requiere extensión de operador; deshabilitado hasta que el Admin la asigne.

## [Uso (Usuario)] Asistente operativo

Asistente operativo
Asistente operativo
El botón 💬 abre el asistente. Pregunta en cualquier idioma. Además del texto puede mostrar tarjetas (KPI, barras, tablas) de estado, alarmas o actividad.Ejemplos: «¿cuántas cámaras hay en línea?», «ubicación del PMI 469», «¿hubo SOS hoy?», «reporte de alarmas».

## [Administración] Servidores y descubrimiento

Servidores y descubrimiento
Servidores y descubrimiento
En ⚙ Administración → Servidores agregas IPs SecureVu, guardas y usas «Descubrir cámaras y reconstruir mapa». Configura el Asistente IA y descarga la plantilla CSV. Desde la barra: Regresar a Mapa.

## [Administración] Coordenadas (ubicar cámaras)

Coordenadas (ubicar cámaras)
Coordenadas (ubicar cámaras)
Sube CSV/Excel; llave preferida = IP; lat/lng; grupo = PMI. Probar antes de Publicar. Si quedan 0 con coordenadas, revisa la columna llave.

## [Administración] Usuarios, ACL e impersonación

Usuarios, ACL e impersonación
Usuarios, ACL e impersonación
Roles UI Usuario / Admin. ACL por PMI y/o cámaras. Sin ACL = ve todo; lista vacía = sin acceso. Checkbox Control PTZ en Usuarios. Icono Entrar como impersona; banner Volver restaura al Admin. SSO: aprueba solicitudes pendientes.

## [Administración] Auditoría, alarmas y despliegue

Auditoría, alarmas y despliegue
Auditoría, alarmas y despliegue
Pestaña Auditoría: log append-only con actor real + CSV. SecureTrax/FreshService desde Administración. Inventario PMI: routers/Hipervisores/cámaras. Asistente → Ver conversaciones.Despliegue MH: LXC 103, Docker Compose, ./deploy.sh. TLS preferido mh.map.secure.vu.


================================================================================
C) CURSO ODOO — quiz (✓ = correcta)
================================================================================

### ¿Qué significa un marcador ámbar en el mapa?
- [ ] Todas las cámaras del sitio están en línea
- [✓] En espera: el video suele abrir al elegir la cámara
- [ ] El sitio no tiene cámaras
- [ ] Hay una alarma SOS
### ¿Cómo se colorea el marcador de un sitio con varias cámaras?
- [ ] Siempre verde
- [✓] Peor estado por mayoría en el sitio
- [ ] Solo por la primera cámara
- [ ] Aleatorio
### ¿Dónde está el listado de cámaras en el popup?
- [ ] Arriba del título
- [✓] A la derecha del video (iconos colapsables)
- [ ] Solo en Administración
- [ ] En el basemap 3D
### ¿Qué diferencia el sonido de SOS y Tamper?
- [ ] Es el mismo tono
- [✓] SOS = secuencia urgente; Tamper = tono suave (ambos se pueden silenciar)
- [ ] Solo SOS suena
- [ ] Solo Tamper suena
### ¿Qué estados puede tener una alarma?
- [ ] Nueva / Vieja
- [✓] Activa / Reconocida / Resuelta
- [ ] Abierta / Cerrada / Pendiente de pago
- [ ] Verde / Rojo / Gris
### Al atender una alarma, ¿qué queda registrado?
- [ ] Nada
- [ ] Solo la hora
- [✓] El usuario que actuó, la acción y la hora (Auditoría)
- [ ] Solo si se resolvió
### ¿Qué hace la casilla Videowall del popup?
- [ ] Apaga la cámara
- [✓] Selecciona el PMI completo para el muro multi-cámara
- [ ] Exporta un PDF
- [ ] Reinicia el servidor
### En el selector de disponibilidad, ¿qué periodos hay?
- [ ] Solo 24 horas
- [✓] Hoy, 7 días, Mes y Periodo personalizado
- [ ] Solo el mes actual
- [ ] Año completo
### ¿Cómo descubre la app las cámaras de un servidor? (admin)
- [ ] Hay que capturarlas a mano
- [✓] Consulta el servidor y las encuentra solas al «Descubrir»
- [ ] Las lee de un PDF
- [ ] No puede, requiere reinstalar
### Si al publicar coordenadas quedan «0 con coordenadas», ¿qué revisar primero? (admin)
- [ ] Reiniciar el navegador
- [✓] La columna llave del mapeo (probar con la IP)
- [ ] Cambiar de servidor de IA
- [ ] Borrar todos los usuarios
### ¿Qué puede hacer un rol Usuario?
- [ ] Configurar servidores y usuarios
- [✓] Monitorear: mapa, video, alarmas, videowall y asistente (PTZ si se habilita)
- [ ] Subir coordenadas
- [ ] Eliminar cámaras
### ¿Para qué sirve «Entrar como» en Usuarios? (admin)
- [ ] Borrar la cuenta
- [✓] Abrir el mapa impersonando a ese Usuario (con Volver al Admin)
- [ ] Cambiar el basemap a 3D
- [ ] Silenciar alarmas
### ¿Qué usa el mapa para controlar cámaras PTZ?
- [ ] Solo ISAPI en todas
- [✓] Control SecureVu; cualquier cámara puede ser controlada
- [ ] Solo el intercom Hablar
- [ ] Publica el curso Odoo
### Sobre Hablar / Intercom, ¿cuál es correcto?
- [ ] Siempre funciona para todos
- [✓] Deshabilitado hasta que Admin asigne extensión de operador
- [ ] Reemplaza al videowall
- [ ] Solo funciona en 3D
### ¿En qué idiomas se puede preguntar al asistente?
- [ ] Solo español
- [✓] Cualquier idioma
- [ ] Solo inglés
- [ ] Solo con tarjetas KPI


================================================================================
D) GH docs — Guía del usuario
================================================================================

# Guía del usuario

[← Volver al inicio](../README.md)

Como **Usuario** puedes monitorear las cámaras (todas o las que te asignaron),
ver el video en vivo, armar un videowall, consultar disponibilidad, atender
alarmas y usar el asistente operativo.

---

## 1. El mapa y los marcadores

Cada **marcador** representa un sitio/PMI (varias cámaras: PTZ, bullet, LPR…).
El **color** resume el estado:

| Color | Significado |
|---|---|
| 🟢 Verde | En línea (sesión SecureVu activa) |
| 🟠 Ámbar | En espera (el video suele abrir al elegir la cámara) |
| 🔴 Rojo | Fuera de línea |
| ⚪ Gris | Sin transmisión |

Cuando un sitio tiene **más de una cámara**, el marcador muestra un **número**.
El color del grupo resume el peor estado **por mayoría** en el sitio. El
interruptor **3D** muestra edificios (inclina con la brújula).

## 2. Filtrar y buscar

En la barra superior:

- **Servidor** / **Tipo**: filtran el mapa.
- **Buscar**: abre un panel; elige una cámara y el mapa vuela hasta ella.
- 🔔 alarmas, ❓ ayuda, ⚙ administración (Admin), menú de perfil y **Salir**.

## 3. Popups flotantes (varias a la vez)

Haz clic en un marcador. Se abre un **popup flotante** anclado al sitio.
Puedes abrir **varios**; cada uno se cierra con su X. **Popups ✕** en la barra
superior cierra todos.

Cada popup incluye:

1. **Título** = enlace a SecureVu de esa cámara.
2. **Video en vivo** — 🔇 selector de audio (si la cámara lo tiene) en la
   esquina inferior izquierda; en la transmisión: ⛶ pantalla completa (zoom
   digital con rueda), HD|SD, ↻ reconectar.
3. **Listado de cámaras** (derecha del video): iconos por tipo (PTZ / bullet /
   LPR…) con punto de estado; colapsado = solo iconos; expandido = nombres.
   Cambia de cámara del mismo PMI sin cerrar el popup.
4. Menús colapsables **Grabación servidor · 24 h** y, si aplica,
   **Grabación en PMI · 24 h**. Clic abre SecureVu o la web de la cámara.
5. Casilla **Videowall** (agrega el PMI completo; botón **VW** en la barra
   superior).
6. Controles **PTZ** / **Hablar** cuando aplican (ver más abajo).

## 4. Videowall

Selecciona PMIs/cámaras en el mapa (casilla **Videowall**) o usa **Agregar**
una vez en la pantalla de videowall:

- Baldosas con **punto de estado**, selector HD|SD, silenciar, pantalla
  completa, PTZ (si aplica) y ×.
- Marcos de alarma: **Rojo** = SOS, **Morado** = Tamper, **Combinado** = ambas.
- **← Mapa** regresa al mapa.

## 5. Estadísticas de disponibilidad

Haz clic en los **contadores** de la barra superior:

- Totales y **disponibilidad** del periodo (**Hoy / 7 días / Mes / Periodo**).
- Tabla **por servidor** (nombres de proyecto).
- **Hoy** cubre desde la medianoche (hora CDMX) hasta el momento del clic.

## 6. Alarmas SOS / Tamper

- Marcador pulsante (rojo SOS / morado Tamper / partido si ambas).
- **Sonido**: SOS = secuencia urgente; Tamper = tono suave. El altavoz del
  panel silencia ambos.
- Panel 🔔 o ventana **↗** (`/notifications.html`).
- Estados **ACTIVA → RECONOCIDA → RESUELTA**. Acciones: Reconocer, Resolver,
  Nota, Ver cámaras, **Grabación** (clips del momento de todas las cámaras del
  PMI).
- Cada acción queda en bitácora y Auditoría. Suele abrirse ticket FreshService
  (SOS = Urgente, Tamper = Alta).

## 7. PTZ e Intercom

- **PTZ**: «Control disponible» → «Controlando» → flechas / + − (también
  d-pad en pantalla completa). Solo una cámara a la vez. Admin siempre; Usuario
  requiere autorización del Admin. El mapa usa el control de SecureVu; **cualquier
  cámara puede ser controlada**.
- **Hablar**: botón junto al PTZ; llama al intercomunicador del PMI. Requiere
  extensión de operador; deshabilitado hasta que el Admin la asigne.

## 8. Asistente operativo 💬

Pregunta en **cualquier idioma**. Además del texto puede mostrar **tarjetas**
(KPI, barras, tablas) de estado, alarmas o actividad.

Ejemplos: «¿cuántas cámaras hay en línea?», «ubicación del PMI 469»,
«¿hubo SOS hoy?», «reporte de alarmas».

## 9. Cerrar sesión

Menú de perfil (icono de persona) → **Salir**, o el flujo de logout de tu
despliegue. La sesión caduca sola tras varias horas.

---

[← Inicio](../README.md) · [Administrador →](administrador.md) · [FAQ](faq.md)


================================================================================
E) GH docs — Guía del administrador
================================================================================

# Guía del administrador

[← Volver al inicio](../README.md)

El **Admin** ve todo lo de la [guía del usuario](usuario.md) y además
**Administración** (⚙). Desde la barra superior: **Regresar a Mapa**.

> La app **descubre las cámaras** consultando cada servidor SecureVu; tú indicas
> los servidores y subes las **coordenadas** para ubicarlas.

---

## Entrar a Administración

Pestañas típicas: **Servidores**, **Coordenadas**, **Usuarios**, **Inventario PMI**
(routers/**Hipervisores**/cámaras), **Auditoría**, integraciones (SecureTrax /
FreshService / SSO / Asistente).

---

## 1. Servidores

- **Título** de la app y **sufijos** de stream (MH: `_2`/`_1`).
- **Asistente IA**: proveedor `ollama` o `anthropic`; URL/modelo; Probar chat.
- Lista de IPs SecureVu → **Guardar** → **Descubrir cámaras y reconstruir mapa**.
- **Plantilla CSV** con las cámaras descubiertas.

## 2. Coordenadas

1. Sube CSV/Excel (o usa la plantilla).
2. Mapea columnas: llave preferida = **IP**; lat/lng; opcionales nombre/grupo/tipo.
   El **Grupo** (torre, p. ej. `I150200700-558`) agrupa el marcador.
3. **Probar emparejamiento** → **Publicar al mapa**.
4. Revisa «sin coordenadas» y corrige el archivo.

> Si quedan **0 con coordenadas**, casi siempre la columna llave no corresponde.

## 3. Usuarios, ACL e impersonación

| Rol UI | Permisos |
|---|---|
| **Admin** | Configura todo; PTZ siempre; ve detalle completo de cámaras. |
| **Usuario** | Monitoreo; PTZ solo con checkbox; puede restringirse por PMI/cámara. |

- Legacy `visor` se migra a `usuario`.
- **ACL**: asigna PMIs y/o cámaras (`server:stream`). Sin ACL = ve todo; lista
  vacía guardada = sin acceso. Migración lazy: solo `allowedPmis` se expande a
  todas las cams actuales hasta que re-guardes (entonces se escribe
  `allowedCameras`).
- Icono **Entrar como** (solo filas Usuario): abre el mapa como ese usuario;
  banner **Volver** restaura tu sesión Admin. Queda en Auditoría.
- SSO: **Solicitudes pendientes** → Aprueba (rol) / Rechaza.
- Confirmación al eliminar usuarios.

## 4. Auditoría

Pestaña **Auditoría**: log append-only (`audit.db`) de login, PTZ, alarmas, chat,
floats, videowall, cambios de admin, etc. El **actor** es el usuario de sesión
real (también bajo impersonación). Filtros por usuario/acción/fecha + export CSV.

Las transcripciones completas del chat siguen en **Asistente → Ver conversaciones**.

## 5. Alarmas SecureTrax / FreshService

Las alarmas llegan por MQTT (`securetrax/alarms`). En **Integración SecureTrax**
ves estado del broker y conteos. FreshService: dominio/solicitante en UI; API key
en el entorno del servidor. Prioridades SOS/Tamper y agrupación de repeticiones
configurables.

## 6. Inventario PMI

Estado online/offline de routers (prioriza ZeroTier) e **Hipervisores** (Proxmox)
por PMI, más cámaras desde el status edge/SecureVu. CSV corregible en la misma
pestaña.

## 7. Despliegue (referencia técnica)

- Producción MH: LXC **103**, Docker Compose (`web` + `api` + `mqtt`),
  `SSHPASS=… ./deploy.sh`.
- Imágenes CI: `ghcr.io/securecorp-mexico/securevu-map-{api,web}`.
- TLS: preferir `mh.map.secure.vu` + CA interna; confiar `ca.crt` en clientes.
- Edge probe: puerto tomado del URL RTSP del productor go2rtc (no asume 554).
- Intercom: botón Hablar deshabilitado hasta que Admin asigne extensión de
  operador (`intercom.enabled` + `sipExtension`).
- PTZ: control SecureVu; cualquier cámara puede ser controlada (Admin siempre;
  Usuario con autorización).

## 8. Cámaras que no aparecen

- «con coordenadas: 0» → mapeo de columnas (usa IP).
- Cámara sin ubicar → falta en el archivo; vuelve a subir.
- Servidor completo faltante → lista Servidores + Descubrir (alcanzabilidad :1984).

---

[← Inicio](../README.md) · [Usuario](usuario.md) · [FAQ →](faq.md)


================================================================================
F) GH docs — FAQ
================================================================================

# Preguntas frecuentes

[← Volver al inicio](../README.md)

### El video no se ve / sale negro
- Espera unos segundos: el video puede tardar en conectar.
- Las cámaras **LPR** se ven casi negras de noche (obturador rápido + IR). Es normal.
- Si **ninguna** cámara reproduce, avisa al administrador (red / proxy `/sv`).

### Un marcador está ámbar pero la cámara reproduce
Ámbar = **en espera**. Al abrir el popup / elegir la cámara el video suele verse
bien.

### ¿Por qué un marcador es rojo?
Fuera de línea según el sondeo edge + SecureVu.

### La barra de disponibilidad está gris
Aún no hay historial suficiente (sondeo ~1 min con debounce). Se llena con el tiempo.

### Solo veo algunas cámaras / PMIs
Un Admin te restringió por **ACL** (PMI y/o cámaras). Pídele ampliar el acceso.

### ¿Cómo atiendo una alarma SOS?
Campana 🔔 → Reconocer mientras atiendes → Resolver al cerrar. SOS suena más
urgente que Tamper (tono suave); silencia con el altavoz del panel si hace falta.

### Hablar / Intercom no funciona
El botón queda deshabilitado hasta que el Admin te asigne una extensión de
operador en el conmutador.

### PTZ no mueve
Arma **Controlando** primero. Solo una cámara a la vez. Como Usuario necesitas
autorización del Admin (checkbox Control PTZ). El mapa usa el control de
SecureVu; cualquier cámara puede ser controlada.

### Advertencia de certificado / no puedo instalar la PWA
Confía la CA interna o usa `https://mh.map.secure.vu/` / `https://172.20.0.9/`.
Sin confiar el cert, Chrome/iOS pueden bloquear el Service Worker.

### Olvidé mi contraseña
Un administrador **tendrá** que restablecerla en **Administración → Usuarios**.
Con cuenta local puedes cambiarla desde el menú de perfil.

### ¿El asistente solo entiende español?
No: puedes preguntar en **cualquier idioma**. Responde con texto y, cuando
aplica, tarjetas (KPI, barras, tablas).

---

[← Inicio](../README.md)
