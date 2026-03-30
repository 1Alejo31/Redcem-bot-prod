async function obtenerCasosPendientes() {
    try {
        const response = await fetch('http://3.16.114.54/api/notificaciones/casos_pendientes');
        const data = await response.json();

        if (data.error === 0 && data.response && data.response.data) {
            return data.response.data;
        }

        console.log('No se encontraron casos pendientes');
        return [];
    } catch (error) {
        console.error('Error al consultar casos pendientes:', error);
        return [];
    }
}

async function gestionarNotificacion(id) {
    try {
        const response = await fetch('http://3.16.114.54/api/hojas-vida/notificacion/gestionar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (response.ok) {
            console.log(`Notificacion gestionada para ID ${id}`);
            return { success: true };
        }

        console.log(`No se pudo gestionar la notificacion ${id}`);
        return { success: false, error: 'Endpoint no disponible' };
    } catch (error) {
        console.log(`Error al gestionar notificacion ${id}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function buscarHojasVidaConIPS() {
    try {
        const response = await fetch('http://3.16.114.54/api/hojas-vida/con-ips');
        const data = await response.json();

        if (data.error === 0 && data.response && data.response.hojas_vida) {
            return data.response.hojas_vida.map(hoja => ({
                ID: hoja._id,
                NOMBRE_EMPRESA: 'REDCEM',
                NOMBRE_PACIENTE: `${hoja.NOMBRE} ${hoja.PRIMER_APELLIDO} ${hoja.SEGUNDO_APELLIDO || ''}`.trim(),
                DOCUMENTO: hoja.DOCUMENTO,
                TELEFONO: hoja.CELULAR,
                TIPO: hoja.EXAMENES || 'examen médico',
                RECOMENDACIONES: hoja.RECOMENDACIONES || '',
                CORREO: hoja.CORREO,
                CORREO_COPIA: '',
                CORREO_COPIA_S: '',
                CORREO_COPIA_T: '',
                EXAMENES: hoja.EXAMENES || 'exámenes médicos',
                FECHA: hoja.FECHA_HORA ? new Date(hoja.FECHA_HORA).toLocaleDateString('es-ES') : 'fecha por confirmar',
                CIUDAD: hoja.IPS_ID ? hoja.IPS_ID.CIUDAD : '',
                LUGAR: hoja.IPS_ID ? hoja.IPS_ID.NOMBRE_IPS : 'Centro Médico',
                TELEFONO_IPS: hoja.IPS_ID ? hoja.IPS_ID.TELEFONO : '3112780473',
                DIRECCION_IPS: hoja.IPS_ID ? hoja.IPS_ID.DIRECCION : '',
                CORREO_IPS: hoja.IPS_ID ? hoja.IPS_ID.CORREO : 'Info@REDCEM.co'
            }));
        } else {
            console.log('No se encontraron hojas de vida con IPS asignada');
            return [];
        }
    } catch (error) {
        console.error('Error al consultar el servicio de hojas de vida:', error);
        return [];
    }
}

async function updateStatusHojaVida(hojaVidaId, estado, detalle) {
    try {
        const response = await fetch(`http://3.16.114.54/api/hojas-vida/${hojaVidaId}/estado`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                estado: estado,
                detalle: detalle
            })
        });

        if (response.ok) {
            console.log(`Estado actualizado para hoja de vida ${hojaVidaId}: ${estado}`);
            return { success: true };
        } else {
            console.log(`No se pudo actualizar el estado de la hoja de vida ${hojaVidaId}`);
            return { success: false, error: 'Endpoint no disponible' };
        }
    } catch (error) {
        console.log(`Error al actualizar estado de hoja de vida ${hojaVidaId}:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    obtenerCasosPendientes,
    gestionarNotificacion,
    buscarHojasVidaConIPS,
    updateStatusHojaVida
};
