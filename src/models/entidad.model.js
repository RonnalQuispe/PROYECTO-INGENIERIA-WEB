// ============================================================
// src/models/entidad.model.js
// ============================================================
const mongoose = require('mongoose');

const entidadSchema = new mongoose.Schema({
    nombre:    { type: String, required: true, trim: true, unique: true },
    zona:      { type: String, enum: ['Norte', 'Centro', 'Sur', ''], default: '' },
    tipo:      { type: String, trim: true, default: '' }, // hospital, edificio, etc.
    notas:     { type: String, trim: true, default: '' },
    activo:    { type: Boolean, default: true }
}, { timestamps: true });

entidadSchema.index({ nombre: 1 });

module.exports = mongoose.model('Entidad', entidadSchema);
