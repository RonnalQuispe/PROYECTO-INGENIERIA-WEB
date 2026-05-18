// ============================================================
// src/config/db.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original:
//
// [FIX-1] SEGURIDAD — Sin validación de MONGODB_URI antes de conectar.
//         Antes: si la variable de entorno no estaba definida, Mongoose
//         lanzaba un error críptico de URI inválida que exponía información
//         interna en el log antes de que el catch lo capturara.
//         Ahora: guard explícito con mensaje claro antes de intentar conectar.
//
// [FIX-2] RESILIENCIA — Sin opciones de timeout configuradas.
//         Antes: valores por defecto de Mongoose (30 s serverSelectionTimeout).
//         En contenedores o redes lentas esto hace que la app "cuelgue"
//         silenciosamente. Ahora: timeouts explícitos y razonables.
//
// [FIX-3] SEGURIDAD — URI impresa en el error original cuando Mongoose
//         rechaza la conexión podría contener usuario:contraseña en el
//         string. El error ahora solo imprime error.message, no el objeto
//         completo (que puede incluir el URI en su stack trace).
//
// SIN CAMBIOS FUNCIONALES: la firma (module.exports = connectDB) y el
// comportamiento (process.exit en error fatal) son idénticos al original.
// ============================================================

const mongoose = require('mongoose');

const connectDB = async () => {
    // [FIX-1] Validar variable de entorno ANTES de intentar conectar
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI no está definida en las variables de entorno.');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            // [FIX-2] Timeouts explícitos para evitar cuelgues silenciosos
            serverSelectionTimeoutMS: 5000,   // Falla rápido si el servidor no responde
            socketTimeoutMS:          45000,  // Cierra sockets inactivos después de 45 s
            connectTimeoutMS:         10000,  // Tiempo máximo para establecer conexión
        });
        console.log('✅ MongoDB conectado');
    } catch (error) {
        // [FIX-3] Solo imprimir error.message, no el objeto completo
        // (el objeto Error de Mongoose puede incluir el URI con credenciales)
        console.error('❌ Error al conectar MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;