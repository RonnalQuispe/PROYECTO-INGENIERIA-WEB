// ============================================================
// src/models/entidad.model.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original:
//   ① ELIMINADO entidadSchema.index({ nombre: 1 }) — era REDUNDANTE.
//     unique: true en el campo ya crea un índice único automáticamente.
//     Tener dos índices sobre el mismo campo ocupa RAM extra en el
//     WiredTiger cache y penaliza los writes sin beneficio alguno.
//   ② AGREGADO índice compuesto { activo: 1, nombre: 1 } (igual que
//     Cliente) para cubrir find({ activo: true }).sort({ nombre: 1 }).
//   ③ AGREGADO índice de texto { nombre: 'text' } para búsqueda
//     full-text sin COLLSCAN.
// ============================================================

const mongoose = require('mongoose');

const entidadSchema = new mongoose.Schema({
    nombre:    { type: String, required: true, trim: true, unique: true },
    zona:      { type: String, enum: ['Norte', 'Centro', 'Sur', ''], default: '' },
    tipo:      { type: String, trim: true, default: '' },
    notas:     { type: String, trim: true, default: '' },
    activo:    { type: Boolean, default: true }
}, { timestamps: true });

// ── Índices ────────────────────────────────────────────────────────────────────

// ① Compuesto activo + nombre
//    Cubre: Entidad.find({ activo: true }).sort({ nombre: 1 })  →  IXSCAN.
//    El índice único de `nombre` NO cubre este filtro compuesto con activo.
entidadSchema.index({ activo: 1, nombre: 1 });

// ② Índice de texto sobre nombre  →  FTS sin COLLSCAN
entidadSchema.index({ nombre: 'text' });

// NOTA: El índice único implícito de { nombre: 1 } sigue existiendo
// (creado por unique:true). No lo declaramos de nuevo para no duplicarlo.

module.exports = mongoose.model('Entidad', entidadSchema);