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

module.exports = { obtenerCasosPendientes, gestionarNotificacion };
