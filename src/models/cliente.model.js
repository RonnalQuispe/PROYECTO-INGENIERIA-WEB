// src/models/cliente.model.js
const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    nombre:   { type: String, required: true, trim: true, unique: true },
    zona:     { type: String, enum: ['Norte', 'Centro', 'Sur', ''], default: '' },
    telefono: { type: String, trim: true, default: '' },
    notas:    { type: String, trim: true, default: '' },
    activo:   { type: Boolean, default: true }
}, { timestamps: true });

// _id ya tiene índice automático — no declararlo de nuevo.
// Índice compuesto para búsquedas frecuentes en la lista de clientes activos:
clienteSchema.index({ activo: 1, nombre: 1 });

module.exports = mongoose.model('Cliente', clienteSchema);