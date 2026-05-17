// ============================================================
// src/models/cliente.model.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original:
//   ① Añadido índice de texto { nombre: 'text' } para búsqueda
//     full-text sin COLLSCAN (reemplaza RegExp /q/i sin anclar).
//   ② El índice compuesto { activo, nombre } se conserva: cubre
//     la query más frecuente Cliente.find({ activo:true }).sort({ nombre:1 }).
// ============================================================

const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    nombre:   { type: String, required: true, trim: true, unique: true },
    zona:     { type: String, enum: ['Norte', 'Centro', 'Sur', ''], default: '' },
    telefono: { type: String, trim: true, default: '' },
    notas:    { type: String, trim: true, default: '' },
    activo:   { type: Boolean, default: true }
}, { timestamps: true });

// ── Índices ────────────────────────────────────────────────────────────────────

// ① Compuesto activo + nombre
//    Cubre: find({ activo: true }).sort({ nombre: 1 })  →  IXSCAN garantizado.
//    El prefijo { activo } permite a MongoDB descartar documentos inactivos
//    antes de llegar a la etapa de sort, sin tocar el heap.
clienteSchema.index({ activo: 1, nombre: 1 });

// ② Índice de texto sobre nombre
//    Cubre: find({ $text: { $search: q }, activo: true })  →  FTS IXSCAN.
//    Elimina el RegExp /q/i que provocaba COLLSCAN.
//    Para búsqueda de prefijos ("jua" → "Juan") usa regex anclado:
//      /^jua/i  →  SÍ usa el índice B-tree (anclar con ^ es clave).
//      /jua/i   →  NO usa índice (escaneo completo).
clienteSchema.index({ nombre: 'text' });

module.exports = mongoose.model('Cliente', clienteSchema);