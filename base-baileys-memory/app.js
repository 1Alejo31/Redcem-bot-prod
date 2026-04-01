const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const { obtenerCasosPendientes, gestionarNotificacion, buscarHojasVidaConIPS, updateStatusHojaVida } = require('./consultas');
const P = require("pino");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { enviarCorreoConAdjuntos } = require('./mailer');
const express = require('express');

let isRunning = false;
let isProcessing = true;

// Variables para el perfil de usuario y estado de conexión
let userProfileData = {
  name: 'Esperando conexión...',
  phone: 'Pendiente de escanear QR',
  profilePicture: null,
  status: 'Desconectado',
  connected: false
};

// 📂 Carpeta donde se guardan las credenciales
const authDir = path.resolve(__dirname, "auth_info");

// Función para resetear la carpeta de sesión
function resetAuthFolder() {
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true }); // 🔥 borra todo
    console.log("🗑️ Carpeta auth_info eliminada.");
  }
  fs.mkdirSync(authDir);
  console.log("📂 Carpeta auth_info creada nuevamente.");
}

function extraerTelefonos(cadena) {
  if (!cadena) return [];
  return cadena.split(',').map(num => {
    const numeroLimpio = num.trim().replace(/\D/g, '');
    if (numeroLimpio.length >= 10) {
      return numeroLimpio.startsWith('57') ? numeroLimpio : `57${numeroLimpio}`;
    }
    return null;
  }).filter(num => num !== null);
}

// Función para validar correos electrónicos
function esCorreoValido(correo) {
  if (!correo || typeof correo !== 'string') return false;

  // Eliminar espacios en blanco
  correo = correo.trim();

  // Verificar que no sea un valor placeholder
  const valoresInvalidos = ['na', 'n/a', 'no aplica', 'sin correo', 'ninguno', ''];
  if (valoresInvalidos.includes(correo.toLowerCase())) return false;

  // Validación básica de formato de correo
  const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regexCorreo.test(correo);
}

function verificarConexion(sock) {
  return sock && sock.user;
}

// Función para enviar WhatsApp con reintentos
async function enviarWhatsAppConReintentos(sock, jid, contenido, maxReintentos = 20) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      // Verificar conexión antes de enviar
      if (!verificarConexion(sock)) {
        console.log(`⚠️ Conexión no disponible, esperando... (intento ${intento}/${maxReintentos})`);
        await new Promise(r => setTimeout(r, 3000)); // Esperar 3 segundos
        continue;
      }

      await sock.sendMessage(jid, contenido);
      return { success: true, intento };
    } catch (error) {
      console.log(`⚠️ Error en intento ${intento}/${maxReintentos}:`, error.message);

      if (intento < maxReintentos) {
        // Esperar más tiempo entre reintentos (backoff exponencial)
        const tiempoEspera = Math.min(5000 * Math.pow(2, intento - 1), 30000);
        console.log(`⏳ Esperando ${tiempoEspera / 1000}s antes del siguiente intento...`);
        await new Promise(r => setTimeout(r, tiempoEspera));
      } else {
        return { success: false, error };
      }
    }
  }
  return { success: false, error: 'Máximo de reintentos alcanzado' };
}

// Función para actualizar estado de hoja de vida con reintentos infinitos
async function actualizarEstadoHojaVidaConReintentos(hojaVidaId, estado, detalle) {
  let intento = 0;
  while (true) {
    intento++;
    try {
      const resultado = await updateStatusHojaVida(hojaVidaId, estado, detalle);
      if (resultado.success) {
        console.log(`✅ Estado actualizado correctamente para hoja de vida ${hojaVidaId} en intento ${intento}`);
        return true;
      } else {
        console.log(`⚠️ Intento ${intento} - No se pudo actualizar estado de hoja de vida ${hojaVidaId}, reintentando en 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (error) {
      console.log(`⚠️ Intento ${intento} - Error al actualizar estado de hoja de vida ${hojaVidaId}: ${error.message}, reintentando en 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Función para gestionar notificación con reintentos infinitos
async function gestionarNotificacionConReintentos(casoId) {
  let intento = 0;
  while (true) {
    intento++;
    try {
      const resultado = await gestionarNotificacion(casoId);
      if (resultado.success) {
        console.log(`✅ Notificación gestionada correctamente para caso ${casoId} en intento ${intento}`);
        return true;
      } else {
        console.log(`⚠️ Intento ${intento} - No se pudo gestionar notificación de caso ${casoId}, reintentando en 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (error) {
      console.log(`⚠️ Intento ${intento} - Error al gestionar notificación de caso ${casoId}: ${error.message}, reintentando en 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function procesarContactos(sock) {
  while (true) {
    // Reset de tracking cada 30 segundos (permite reenvíos)
    const casosEnviadosEnEsteCiclo = new Set();
    const hojasVidaEnviadasEnEsteCiclo = new Set();

    try {
      // 1. Obtener casos pendientes (notificaciones con PDF)
      const casos = await obtenerCasosPendientes();

      // 2. Obtener hojas de vida con IPS (recordatorios de citas)
      const hojasVida = await buscarHojasVidaConIPS();

      if (casos.length === 0 && hojasVida.length === 0) {
        console.log("No hay casos ni hojas de vida pendientes, esperando 10 segundos...");
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      console.log(`Se encontraron ${casos.length} casos y ${hojasVida.length} hojas de vida para procesar`);

      // PROCESAR CASOS PENDIENTES (Notificaciones con PDF)
      for (const caso of casos) {
        if (!isProcessing) break;

        const casoId = String(caso._id);
        if (casosEnviadosEnEsteCiclo.has(casoId)) {
          console.log(`Caso ${casoId} ya procesado en este ciclo, saltando...`);
          continue;
        }

        const telefonosArray = extraerTelefonos(caso.CELULAR);
        const todosLosTelefonos = [...new Set(telefonosArray)];

        if (todosLosTelefonos.length === 0 && !caso.CORREO) {
          console.log(`Caso ID ${casoId} no tiene telefono ni correo valido, saltando...`);
          continue;
        }

        const { asunto, mensaje, ruta_documento_adjunto } = caso.notificacion;
        const pdfUrl = `https://redcemed.com/api/pdf/recibida/${path.basename(ruta_documento_adjunto)}`;
        const pdfFileName = path.basename(ruta_documento_adjunto);
        const tempPdfPath = path.resolve(__dirname, `temp_${casoId}_${Date.now()}.pdf`);

        // Descargar PDF
        let pdfDescargado = false;
        try {
          const pdfResponse = await fetch(pdfUrl);
          if (pdfResponse.ok) {
            const buffer = Buffer.from(await pdfResponse.arrayBuffer());
            fs.writeFileSync(tempPdfPath, buffer);
            pdfDescargado = true;
            console.log(`PDF descargado: ${pdfFileName}`);
          } else {
            console.error(`Error al descargar PDF: HTTP ${pdfResponse.status}`);
          }
        } catch (error) {
          console.error(`Error al descargar PDF:`, error.message);
        }

        const mensajeWhatsApp = `*${asunto}*\n\n${mensaje}`;

        // Enviar WhatsApp
        for (const numero of todosLosTelefonos) {
          if (!isProcessing) break;
          const telefono = numero.startsWith('57') ? numero : `57${numero}`;
          const jid = `${telefono}@s.whatsapp.net`;

          try {
            // 1. Imagen
            const resultadoImagen = await enviarWhatsAppConReintentos(sock, jid, {
              image: fs.readFileSync('assets/imagen.png'),
              caption: 'REDCEM'
            });
            if (!resultadoImagen.success) {
              console.error(`Error al enviar imagen a ${numero}:`, resultadoImagen.error);
              continue;
            }

            if (!isProcessing) break;

            // 2. Texto (asunto + mensaje)
            const resultadoTexto = await enviarWhatsAppConReintentos(sock, jid, { text: mensajeWhatsApp });
            if (!resultadoTexto.success) {
              console.error(`Error al enviar texto a ${numero}:`, resultadoTexto.error);
              continue;
            }

            if (!isProcessing) break;

            // 3. PDF
            if (pdfDescargado) {
              const resultadoPDF = await enviarWhatsAppConReintentos(sock, jid, {
                document: fs.readFileSync(tempPdfPath),
                mimetype: 'application/pdf',
                fileName: pdfFileName
              });
              if (!resultadoPDF.success) {
                console.error(`Error al enviar PDF a ${numero}:`, resultadoPDF.error);
              } else {
                console.log(`WhatsApp enviado a ${numero} (imagen + texto + PDF)`);
              }
            } else {
              console.log(`WhatsApp enviado a ${numero} (imagen + texto, sin PDF)`);
            }
          } catch (error) {
            console.error(`Error general al enviar WhatsApp a ${numero}:`, error);
          }

          await new Promise(r => setTimeout(r, 5000));
        }

        // Enviar email
        if (caso.CORREO && esCorreoValido(caso.CORREO)) {
          const adjuntos = pdfDescargado ? [{ filename: pdfFileName, path: tempPdfPath }] : [];
          try {
            const resultado = await enviarCorreoConAdjuntos(caso.CORREO, asunto, mensaje, adjuntos);
            if (resultado.success) {
              console.log(`Correo enviado a ${caso.CORREO}`);
            } else {
              console.error(`Error al enviar correo a ${caso.CORREO}: ${resultado.error}`);
            }
          } catch (error) {
            console.error(`Error inesperado al enviar correo:`, error.message);
          }
        }

        // Eliminar PDF temporal
        if (pdfDescargado && fs.existsSync(tempPdfPath)) {
          fs.unlinkSync(tempPdfPath);
          console.log(`PDF temporal eliminado: ${pdfFileName}`);
        }

        // Marcar notificacion como gestionada (esperar confirmación)
        console.log(`⏳ Esperando confirmación de actualización de estado para caso ${casoId}...`);
        await gestionarNotificacionConReintentos(casoId);
        casosEnviadosEnEsteCiclo.add(casoId);

        await new Promise(r => setTimeout(r, 2000));
      }

      // PROCESAR HOJAS DE VIDA CON IPS (Recordatorios de citas médicas)
      for (const contacto of hojasVida) {
        if (!isProcessing) break;

        const hojaVidaId = String(contacto.ID);
        if (hojasVidaEnviadasEnEsteCiclo.has(hojaVidaId)) {
          console.log(`Hoja de vida ${hojaVidaId} ya procesada en este ciclo, saltando...`);
          continue;
        }

        const telefonosArray = extraerTelefonos(contacto.TELEFONO);
        const todosLosTelefonos = [...new Set(telefonosArray)];

        if (todosLosTelefonos.length === 0 && !contacto.CORREO) {
          console.log(`Hoja de vida ${hojaVidaId} no tiene teléfonos ni correos válidos, saltando...`);
          continue;
        }

        // Contadores
        let whatsappEnviados = 0;
        let whatsappTotal = todosLosTelefonos.length;
        let emailEnviados = 0;
        let emailTotal = contacto.CORREO ? 1 : 0;

        // Variables para el mensaje
        const nombre = contacto.NOMBRE_PACIENTE || 'Estimado(a) paciente';
        const tipo = contacto.TIPO || 'examen médico';
        const examen = contacto.EXAMENES || 'exámenes médicos';
        const empresa = contacto.NOMBRE_EMPRESA || 'su empresa';
        const fechaAtencion_formateada = contacto.FECHA || 'fecha por confirmar';
        const lugar = contacto.LUGAR || 'Centro Médico FELAIFEL';
        const ciudad = contacto.CIUDAD || '';
        const seccion_recomendaciones = contacto.RECOMENDACIONES ?
          `📋 *Recomendaciones importantes:*\n${contacto.RECOMENDACIONES}\n` : '';

        const message = `
👋 Hola ${nombre}, somos REDCEM IA, su asistente virtual.

🔬 *Recordatorio de cita médica*
• Examen: ${examen}
• Empresa: ${empresa}
• Fecha: ${fechaAtencion_formateada}
• Lugar: ${lugar} - ${ciudad}

${seccion_recomendaciones}⏰ Agradecemos su puntualidad.`;

        // Enviar WhatsApp
        for (const numero of todosLosTelefonos) {
          if (!isProcessing) break;
          const telefono = numero.startsWith('57') ? numero : `57${numero}`;
          const jid = `${telefono}@s.whatsapp.net`;

          try {
            // Enviar imagen con reintentos
            const resultadoImagen = await enviarWhatsAppConReintentos(sock, jid, {
              image: fs.readFileSync('assets/imagen.png'),
              caption: 'REDCEM'
            });

            if (!resultadoImagen.success) {
              console.error(`Error al enviar imagen a ${numero} después de reintentos:`, resultadoImagen.error);
              continue;
            }

            if (!isProcessing) break;

            // Enviar mensaje de texto con reintentos
            const resultadoTexto = await enviarWhatsAppConReintentos(sock, jid, { text: message });

            if (!resultadoTexto.success) {
              console.error(`Error al enviar texto a ${numero} después de reintentos:`, resultadoTexto.error);
              continue;
            }

            if (!isProcessing) break;

            console.log(`WhatsApp enviado a ${numero} (intentos: txt=${resultadoTexto.intento})`);
            whatsappEnviados++;
          } catch (error) {
            console.error(`Error general al enviar WhatsApp a ${numero}:`, error);
          }

          await new Promise(r => setTimeout(r, 5000));
        }

        // Enviar correos
        const asunto = `REDCEM - Examen de ${contacto.TIPO} - ${contacto.NOMBRE_EMPRESA}`;
        const adjuntos = [];

        // Preparar correos de copia (CC)
        const correosCC = [
          contacto.CORREO_COPIA,
          contacto.CORREO_COPIA_S,
          contacto.CORREO_COPIA_T
        ].filter(correo => correo && esCorreoValido(correo));

        // Filtrar correo principal válido
        const correosPrincipales = [contacto.CORREO].filter(correo => correo && esCorreoValido(correo));

        if (correosPrincipales.length === 0) {
          console.log(`Hoja de vida ${hojaVidaId}: No tiene correo principal válido`);
        } else {
          console.log(`Hoja de vida ${hojaVidaId}: Correo principal: ${correosPrincipales[0]}`);
          if (correosCC.length > 0) {
            console.log(`Hoja de vida ${hojaVidaId}: CC: ${correosCC.join(', ')}`);
          }

          for (const correo of correosPrincipales) {
            try {
              const resultado = await enviarCorreoConAdjuntos(
                correo,
                asunto,
                message,
                adjuntos,
                correosCC.length > 0 ? correosCC : null
              );

              if (resultado.success) {
                console.log(`Correo enviado a ${correo}`);
                if (correosCC.length > 0) {
                  console.log(`Con copia a: ${correosCC.join(', ')}`);
                }
                emailEnviados++;
              } else {
                console.error(`Error al enviar correo a ${correo}: ${resultado.error}`);
              }
            } catch (error) {
              console.error(`Error inesperado al enviar correo a ${correo}:`, error.message);
            }
          }
        }

        // Guardar estado
        const ahora = new Date();
        const fechaHora = ahora.toISOString().replace('T', ' ').substring(0, 19);
        const estadoDetalle = `PROCESADO_${fechaHora} - WhatsApp:${whatsappEnviados}/${whatsappTotal} Email:${emailEnviados}/${emailTotal}`;

        // Actualizar estado usando el API (esperar confirmación)
        console.log(`⏳ Esperando confirmación de actualización de estado para hoja de vida ${hojaVidaId}...`);
        await actualizarEstadoHojaVidaConReintentos(hojaVidaId, 'EN GESTION', estadoDetalle);
        hojasVidaEnviadasEnEsteCiclo.add(hojaVidaId);

        await new Promise(r => setTimeout(r, 2000));
      }

      console.log("Proceso completado, listo para la siguiente ejecucion");

    } catch (error) {
      console.error("Error en el proceso:", error);
    }

    // Esperar 30 segundos antes del siguiente ciclo (permite reenvíos)
    await new Promise(r => setTimeout(r, 30000));
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    browser: ["REDCEM IA Bot", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined
  });

  sock.ev.on("creds.update", saveCreds);

  // Escuchar actualizaciones de conexión
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPath = path.resolve(__dirname, "bot.qr.png");
      await QRCode.toFile(qrPath, qr, {
        type: "png",
        width: 300,
        margin: 2
      });
      console.log("⚡ Nuevo QR generado y guardado en:", qrPath);

      // Actualizar estado del usuario
      userProfileData.status = 'Esperando escaneo de QR';
      userProfileData.connected = false;
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Sesión cerrada. Reintentando...");
      isProcessing = false;
      isRunning = false;

      // Actualizar estado del usuario
      userProfileData.status = 'Desconectado';
      userProfileData.connected = false;
      userProfileData.name = 'Esperando conexión...';
      userProfileData.phone = 'Pendiente de escanear QR';

      // ✅ Si fue logout, borramos credenciales
      if (!shouldReconnect) {
        resetAuthFolder();
      }
      // 🔄 Reconectar
      connectToWhatsApp();
    }

    if (connection === "open") {
      if (!isRunning) {
        isRunning = true;
        isProcessing = true;
        console.log("✅ Bot conectado a WhatsApp");

        // Actualizar información del usuario conectado
        try {
          const userInfo = sock.user;
          userProfileData.name = userInfo.name || 'Usuario WhatsApp';
          userProfileData.phone = userInfo.id.split(':')[0] || 'No disponible';
          userProfileData.status = 'Conectado';
          userProfileData.connected = true;

          console.log(`👤 Usuario conectado: ${userProfileData.name} (${userProfileData.phone})`);
        } catch (error) {
          console.log("⚠️ No se pudo obtener información del usuario");
        }

        procesarContactos(sock);
      }
    }
  });

  // Guardar credenciales en cambios
  sock.ev.on("creds.update", saveCreds);
}

// Configuración de Express y rutas de la interfaz web
const app = express();
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'index.html')));
app.get('/qr', (req, res) => res.sendFile(path.join(__dirname, 'bot.qr.png')));
app.get('/user-profile', (req, res) => res.json(userProfileData));
app.get('/status', (req, res) => res.json({ status: userProfileData.connected ? 'connected' : 'disconnected', user: userProfileData }));
app.get('/profile-picture', (req, res) => res.sendFile(path.join(__dirname, '..', 'assets', 'photo.webp')));
app.listen(3011, () => console.log('🌐 Bot WhatsApp REDCEM corriendo en http://localhost:3011'));

// Iniciar
connectToWhatsApp();