const mysql = require('mysql2/promise');

const dbConfig = {
    host: '127.0.0.1',
    user: 'GestorRpaPro',
    password: 'RpaGestor2025.*',
    database: 'db_general'
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexión a MySQL establecida correctamente');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Error al conectar a MySQL:', error);
        return false;
    }
}

async function query(sql, params) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Error en la consulta SQL:', error);
        throw error;
    }
}

module.exports = {
    query,
    testConnection,
    pool
};