**Para:** Sergio  
**CC:** Roberto  
**Asunto:** UCM Miguel Hidalgo — reactivar HTTP/WebSocket :8088 + extensiones operador 9002+

---

Estimado Sergio,

Tras la actualización de firmware del UCM6308A de Miguel Hidalgo a la versión **1.0.33.30**, el servicio **HTTP & WebSocket** en el puerto **8088** dejó de escuchar en `172.16.30.203`. Esto impacta directamente el mapa SecureVu MH:

- La pastilla **VoIP** en https://mh.map.secure.vu/ permanece en rojo.
- El proxy nginx `/ucm-ws/` responde **502** (upstream caído).
- Los operadores no pueden registrar el intercom vía WebRTC (JsSIP desconectado).

La API HTTPS del UCM en **8089** responde con normalidad y la extensión **9001** aparece Idle; el fallo es exclusivamente el canal WebSocket en **8088**. Desde la API de usuario SecureVu no es posible reactivarlo (`updateHTTPWebSocketSettings` devuelve **-47**).

**Acción solicitada en UCM WebUI**

1. Ingresar a **https://172.16.30.203:8089**
2. **PBX → Value-added Features → HTTP & WebSocket**
3. Habilitar **HTTP**, enlace **172.16.30.203**, puerto **8088**
4. **Save & Apply**

**Verificación:** abrir `http://172.16.30.203:8088/httpstatus` y confirmar respuesta OK. Con 8088 activo, el upstream del mapa no requiere cambios adicionales.

**Extensiones operador (9002–9010)**

Para ampliar el pool de operadores WebRTC, favor de **precrear** extensiones **9002 a 9010** con perfil **SIP WebRTC**, **DTLS-SRTP** y códecs **opus / g722 / ulaw / alaw**. La creación vía API (`addSIPAccountAndUser`) devuelve **-25** y no persiste; solo **9001** está operativa en el rango 90xx — el flujo productivo sigue siendo **pool/claim** en el mapa una vez existan slots en PBX.

Quedamos atentos a confirmación cuando quede aplicado.

Saludos cordiales,  
Gerardo
