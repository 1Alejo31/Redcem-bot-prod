const nodemailer = require('nodemailer');

// Función para detectar configuración SMTP basada en el dominio
function getSmtpConfig(email) {
    const domain = email.split('@')[1].toLowerCase();
    
    const smtpConfigs = {
        'gmail.com': { host: 'smtp.gmail.com', port: 587 },
        'outlook.com': { host: 'smtp-mail.outlook.com', port: 587 },
        'hotmail.com': { host: 'smtp-mail.outlook.com', port: 587 },
        'yahoo.com': { host: 'smtp.mail.yahoo.com', port: 587 },
        'icloud.com': { host: 'smtp.mail.me.com', port: 587 }
    };
    
    if (smtpConfigs[domain]) {
        console.log(`✅ Proveedor detectado: ${domain}`);
        return smtpConfigs[domain];
    } else {
        console.log(`⚠️ Dominio personalizado: ${domain}, usando mail.${domain}`);
        return { host: `mail.${domain}`, port: 587 };
    }
}

// Configuración del transporter con detección automática de SMTP
const emailUsuario = 'no-reply@cenlab.co';
const emailPassword = 'KofiMan5';
const smtpConfig = getSmtpConfig(emailUsuario);

const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: false,
    auth: {
        user: emailUsuario,
        pass: emailPassword
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Envía un correo electrónico simple
 * @param {string} destinatario - Correo del destinatario
 * @param {string} asunto - Asunto del correo
 * @param {string} mensaje - Contenido del correo (texto plano)
 * @param {Array} copias - Array de correos para CC (opcional)
 * @returns {Promise} - Promesa con el resultado del envío
 */
async function enviarCorreo(destinatario, asunto, mensaje, copias = []) {
    try {
        // Filtrar correos válidos para CC
        const copiasValidas = copias.filter(cc => cc && cc !== "nan" && cc.includes("@"));
        
        const mailOptions = {
            from: `"Cenlab IPS" <${emailUsuario}>`,
            to: destinatario,
            subject: asunto,
            text: mensaje
        };
        
        if (copiasValidas.length > 0) {
            mailOptions.cc = copiasValidas.join(', ');
            console.log(`📧 CC agregado: ${copiasValidas.join(', ')}`);
        }
        
        console.log(`🔗 Conectando a ${smtpConfig.host}:${smtpConfig.port}...`);
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`✅ Correo enviado correctamente a ${destinatario}:`, info.messageId);
        if (copiasValidas.length > 0) {
            console.log(`📧 Con copia a: ${copiasValidas.join(', ')}`);
        }
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Error al enviar correo a ${destinatario}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Envía un correo electrónico con contenido HTML
 * @param {string} destinatario - Correo del destinatario
 * @param {string} asunto - Asunto del correo
 * @param {string} mensajeTexto - Contenido del correo en texto plano (alternativa)
 * @param {string} mensajeHTML - Contenido del correo en formato HTML
 * @param {Array} copias - Array de correos para CC (opcional)
 * @returns {Promise} - Promesa con el resultado del envío
 */
async function enviarCorreoHTML(destinatario, asunto, mensajeTexto, mensajeHTML, copias = []) {
    try {
        // Filtrar correos válidos para CC
        const copiasValidas = copias.filter(cc => cc && cc !== "nan" && cc.includes("@"));
        
        const mailOptions = {
            from: `"Cenlab IPS" <${emailUsuario}>`,
            to: destinatario,
            subject: asunto,
            text: mensajeTexto,
            html: mensajeHTML
        };
        
        if (copiasValidas.length > 0) {
            mailOptions.cc = copiasValidas.join(', ');
        }
        
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Correo HTML enviado correctamente:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error al enviar correo HTML:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Envía un correo electrónico con archivos adjuntos
 * @param {string} destinatario - Correo del destinatario
 * @param {string} asunto - Asunto del correo
 * @param {string} mensaje - Contenido del correo (texto plano)
 * @param {Array} copias - Array de correos para CC (opcional)
 * @returns {Promise} - Promesa con el resultado del envío
 */
async function enviarCorreoConAdjuntos(destinatario, asunto, mensaje, adjuntos = [], copias = []) {
    try {
        const copiasValidas = copias.filter(cc => cc && cc !== "nan" && cc.includes("@"));

        const mailOptions = {
            from: `"Cenlab IPS" <${emailUsuario}>`,
            to: destinatario,
            subject: asunto,
            text: mensaje
        };

        if (adjuntos.length > 0) {
            mailOptions.attachments = adjuntos;
        }

        if (copiasValidas.length > 0) {
            mailOptions.cc = copiasValidas.join(', ');
        }

        const info = await transporter.sendMail(mailOptions);
        console.log('Correo con adjuntos enviado correctamente:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error al enviar correo con adjuntos:', error);
        return { success: false, error: error.message };
    }
}

// Exportar las funciones
module.exports = {
    enviarCorreo,
    enviarCorreoHTML,
    enviarCorreoConAdjuntos
};
