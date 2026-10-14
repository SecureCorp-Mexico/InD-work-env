**Para:** Sergio  
**CC:** Roberto  
**Asunto:** URGENTE — UCM Miguel Hidalgo :8088 HTTP/WebSocket sigue caído (VoIP mapa rojo) — reactivar

---

Estimado Sergio,

Re-verificación en vivo **2026-09-06** desde CT103 (mapa MH prod): el servicio **HTTP & WebSocket** del UCM6308A `172.16.30.203` **sigue sin escuchar** en el puerto **8088** (tampoco **8445**). Esto es el mismo fallo reportado el **2026-09-01** tras el firmware **1.0.33.30**; **Ops aún no lo ha corregido** (o regresó).

Impacto actual en https://mh.map.secure.vu/ :

- Pastilla **VoIP** en rojo — operadores no pueden registrar intercom (JsSIP).
- Proxy nginx del mapa `/ucm-ws/` → upstream `http://172.16.30.203:8088/ws` responde **502**.
- La API HTTPS del UCM en **8089** responde OK; extensión **9001** (SIP WebRTC, DTLS) existe y está operativa a nivel cuenta.
- Desde el usuario API SecureVu **no** se puede reactivar (`updateHTTPWebSocketSettings` → **-47 No permission**). El mapa **no puede arreglar un puerto cerrado en el PBX**.

**Acción solicitada en UCM WebUI (admin)**

1. Ingresar a **https://172.16.30.203:8089**
2. **PBX → Value-added Features → HTTP & WebSocket**
3. Habilitar **HTTP**, enlace **172.16.30.203**, puerto **8088**
4. **Save & Apply**

**Verificación inmediata**

- Desde red MH: `http://172.16.30.203:8088/httpstatus` → OK  
- Tras eso, `https://mh.map.secure.vu/ucm-ws/` deja de ser 502 y la pastilla VoIP puede pasar a verde al recargar (hard refresh / unregister service worker si hace falta).

**Extensiones operador (pendiente previo, no bloquea 9001)**

Favor de **precrear** extensiones **9002–9010** con perfil **SIP WebRTC**, **DTLS-SRTP** y códecs **opus / g722 / ulaw / alaw**. La alta vía API sigue fallando (**-25**); solo **9001** está en el pool productivo (flujo pool/claim).

Quedamos atentos a confirmación cuando **8088** escuche de nuevo.

Saludos cordiales,  
Gerardo
