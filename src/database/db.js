
const mongoose = require('mongoose');

const connectDB = async () => {
    // [FIX-1] Validar variable de entorno ANTES de intentar conectar
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI no está definida en las variables de entorno.');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
          
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS:          45000,
            connectTimeoutMS:         10000,
        });
        console.log('✅ MongoDB conectado');
    } catch (error) {
        console.error('❌ Error al conectar MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;