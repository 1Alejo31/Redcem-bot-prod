const { createBot, createProvider } = require('@bot-whatsapp/bot')
const { buscarTelefonos, updateStatus } = require('./consultas');
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const express = require('express')
const path = require('path')
const fs = require('fs')
const qrcode = require('qrcode')
const { enviarCorreoConAdjuntos } = require('./mailer');

let adapterProviderInstance = null
let status = false

let userProfileData = {
    name: 'Esperando conexión...',
    phone: 'Pendiente de escanear QR',
    profilePicture: null,
    status: 'Desconectado',
    connected: false
}

let isProcessing = false

//-------------------------------------------------------------
// Función central para verificar conexión
//-------------------------------------------------------------
function estaConectado() {
    return !!adapterProviderInstance?.vendor && userProfileData.connected === true;
}

//-------------------------------------------------------------
// Normaliza números de teléfono
//-------------------------------------------------------------
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

//-------------------------------------------------------------
// Envío automático de mensajes
//-------------------------------------------------------------
const sendAutomaticMessages = async () => {
    if (isProcessing) {
        console.log('⚠️ Proceso anterior aún en ejecución, esperando que termine...');
        return;
    }

    if (!estaConectado()) {
        status = false;
        console.log('⛔ No hay conexión activa, cancelando envío automático');
        return;
    }

    isProcessing = true;

    try {
        const contactos = await buscarTelefonos();

        if (contactos.length === 0) {
            console.log('No se encontraron contactos para enviar mensajes');
            return;
        }

        console.log(`Se encontraron ${contactos.length} contactos para enviar mensajes`);

        const sock = adapterProviderInstance.vendor;

        for (const contacto of contactos) {
            if (!estaConectado()) {
                console.log('⚠️ Conexión perdida durante el proceso, deteniendo envío');
                break;
            }

            const telefonosArray1 = extraerTelefonos(contacto.TELEFONO);
            const telefonosArray2 = extraerTelefonos(contacto.TELEFONO2);
            const todosLosTelefonos = [...new Set([...telefonosArray1, ...telefonosArray2])];

            if (todosLosTelefonos.length === 0 && !contacto.CORREO && !contacto.CORREO2) {
                console.log(`Contacto ID ${contacto.ID} no tiene teléfonos ni correos válidos, saltando...`);
                continue;
            }

            // Contadores
            let whatsappEnviados = 0;
            let whatsappTotal = todosLosTelefonos.length;
            let emailEnviados = 0;
            let emailTotal = (contacto.CORREO ? 1 : 0) + (contacto.CORREO2 ? 1 : 0);

            const message = "¿Te interesa una alianza estratégica en salud ocupacional en Villavicencio? \n\nCordial saludo, \n\nEn ASESORÍAS INTEGRALES Y FELAIFEL IPS – Servicios de Salud y Prevención, con sede en Villavicencio (Meta), creemos firmemente en el poder de las alianzas para brindar soluciones integrales a las empresas. \n\nSabemos que muchas IPS en distintas regiones del país cuentan con clientes que requieren atención en Villavicencio y municipios cercanos. Por esta razón, ponemos a su disposición nuestra infraestructura, licencias habilitadas y un equipo de profesionales altamente calificados para atenderlos con la misma calidad y compromiso que usted ofrece en su ciudad. \n\nNuestros servicios incluyen: \n\n* Exámenes médicos ocupacionales \n\n* Prevención de riesgos laborales y vigilancia epidemiológica \n\n* Laboratorio clínico y de manipulación de alimentos \n\n* Capacitaciones y formación en SG-SST \n\nQueremos proponerle una alianza estratégica que le permita ampliar su cobertura y garantizar a sus clientes una atención confiable y oportuna en Villavicencio, mientras usted fortalece la relación con ellos. \n\nSerá un gusto conversar sobre cómo podemos colaborar para beneficio mutuo y de las empresas que depositan su confianza en nuestros servicios. \n\nAtentamente, \nMartha Isabel Felaifel López \nGerente";

            // Enviar WhatsApp
            for (const numero of todosLosTelefonos) {
                const telefono = numero.startsWith('57') ? numero : `57${numero}`;
                const jid = `${telefono}@s.whatsapp.net`;

                try {
                    await sock.sendMessage(jid, {
                        image: fs.readFileSync('assets/imagen.jpg'),
                        caption: 'Felaifel IPS'
                    });

                    await sock.sendMessage(jid, {
                        document: { url: 'pdf/PORTAFOLIO_DE_SERVICIOS_FELAIFEL_IPS.pdf' },
                        mimetype: 'application/pdf',
                        fileName: 'PORTAFOLIO_DE_SERVICIOS_FELAIFEL_IPS.pdf'
                    });

                    await sock.sendMessage(jid, { text: message });

                    console.log(`✅ WhatsApp enviado a ${numero}`);
                    whatsappEnviados++;
                } catch (error) {
                    console.error(`❌ Error al enviar WhatsApp a ${numero}:`, error);
                }

                await new Promise(r => setTimeout(r, 2000));
            }

            // Enviar correos
            const asunto = 'Alianza estratégica en salud ocupacional - Felaifel IPS';
            const adjuntos = [
                { filename: 'PORTAFOLIO_DE_SERVICIOS_FELAIFEL_IPS.pdf', path: path.join(__dirname, 'pdf', 'PORTAFOLIO_DE_SERVICIOS_FELAIFEL_IPS.pdf') },
                { filename: 'logo_felaifel.jpg', path: path.join(__dirname, 'assets', 'imagen.jpg') }
            ];

            const correos = [contacto.CORREO, contacto.CORREO2].filter(c => !!c);

            for (const correo of correos) {
                try {
                    const resultado = await enviarCorreoConAdjuntos(correo, asunto, message, adjuntos);
                    if (resultado.success) {
                        console.log(`✅ Correo enviado a ${correo}`);
                        emailEnviados++;
                    } else {
                        console.error(`❌ Error al enviar correo a ${correo}: ${resultado.error}`);
                    }
                } catch (error) {
                    console.error(`❌ Error inesperado al enviar correo a ${correo}:`, error);
                }
            }

            // Guardar estado
            const ahora = new Date();
            const fechaHora = ahora.toISOString().replace('T', ' ').substring(0, 19);
            const estadoDetalle = `PROCESADO_${fechaHora} - WhatsApp:${whatsappEnviados}/${whatsappTotal} Email:${emailEnviados}/${emailTotal}`;
            await updateStatus(contacto.ID, 'GESTIONADO', estadoDetalle);

            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (error) {
        console.error('❌ Error en el envío automático:', error);
    } finally {
        isProcessing = false;
        console.log('✅ Proceso completado, listo para la siguiente ejecución');
    }
};

//-------------------------------------------------------------
// Ciclo automático
//-------------------------------------------------------------
const startAutomaticConversations = async () => {
    if (!estaConectado()) {
        status = false;
        console.log('⚠️ Bot no conectado, no se pueden iniciar conversaciones automáticas');
        return;
    }

    console.log('🚀 Iniciando conversaciones automáticas...');

    const ejecutarCiclo = async () => {
        if (status && estaConectado()) {
            console.log('✅ Bot conectado, enviando mensajes automáticos...');
            await sendAutomaticMessages();
            await new Promise(resolve => setTimeout(resolve, 5000));
            ejecutarCiclo();
        }
    };

    ejecutarCiclo();
};

//-------------------------------------------------------------
// Main
//-------------------------------------------------------------
const main = async () => {
    const adapterProvider = createProvider(BaileysProvider)
    adapterProviderInstance = adapterProvider

    const sessionPath = path.join(__dirname, 'bot_sessions', 'creds.json')
    if (fs.existsSync(sessionPath)) {
        status = true
        console.log('✅ Sesión existente detectada, verificando estado...');
        userProfileData = { name: 'Cargando...', phone: 'Obteniendo número...', profilePicture: null, connected: true, connectedAt: new Date().toISOString() }
    } else {
        status = false
        console.log('📱 No hay sesión previa, esperando QR...');
    }

    adapterProvider.on('qr', (qr) => {
        console.log("📲 Nuevo QR generado, escanéalo con WhatsApp");
        userProfileData = { ...userProfileData, status: 'Esperando QR', connected: false, qrGenerated: true };
        try {
            const qrPath = path.join(__dirname, 'bot.qr.png')
            qrcode.toFile(qrPath, qr, { color: { dark: '#000000', light: '#ffffff' } }, (err) => {
                if (err) console.error('Error al generar QR:', err)
                else console.log('QR guardado en:', qrPath)
            })
        } catch (error) {
            console.error('Error al generar QR:', error)
        }
    });

    adapterProvider.on('disconnect', () => {
        console.log("❌ Conexión perdida con WhatsApp");
        userProfileData = { ...userProfileData, status: 'Desconectado', connected: false, qrGenerated: false }
        isProcessing = false;
        status = false;
    });

    adapterProvider.on('auth_failure', () => {
        console.log("❌ Error de autenticación con WhatsApp");
        userProfileData = { ...userProfileData, status: 'Error de autenticación', connected: false, qrGenerated: false }
        isProcessing = false;
        status = false;
    });

    adapterProvider.on('ready', async () => {
        status = true;
        console.log("✅ Sesión iniciada, el bot ya está conectado a WhatsApp");

        userProfileData = { ...userProfileData, status: 'Conectado', connected: true, connectedAt: new Date().toISOString() }

        await new Promise(r => setTimeout(r, 5000));
        console.log("Proveedor conectado y listo");
        startAutomaticConversations();
    });

    createBot({ provider: adapterProvider });

    const app = express()
    app.use(express.static(path.join(__dirname, '..')))
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'index.html')))
    app.get('/qr', (req, res) => res.sendFile(path.join(__dirname, 'bot.qr.png')))
    app.get('/user-profile', (req, res) => res.json(userProfileData))
    app.get('/status', (req, res) => res.json({ status: userProfileData.connected ? 'connected' : 'disconnected', user: userProfileData }))
    app.get('/profile-picture', (req, res) => res.sendFile(path.join(__dirname, '..', 'assets', 'photo.webp')))
    app.listen(3000, () => console.log('🌐 Frontend personalizado en http://localhost:3000'))
}

main()
