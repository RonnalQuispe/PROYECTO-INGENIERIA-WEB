// ============================================================
// src/models/entidad.model.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original (versión ya optimizada en índices):
//
// [FIX-1] SEGURIDAD — Mismos problemas de longitud máxima que cliente.model.
//         nombre, tipo y notas sin maxlength → payloads arbitrarios persistidos.
//         Ahora: maxlength coherentes con el dominio del negocio.
//
// [FIX-2] SEGURIDAD / INTEGRIDAD — "tipo" era un campo String libre sin
//         ninguna restricción. Cualquier string de cualquier longitud pasaba.
//         Si en el negocio los tipos están predefinidos, debería ser un enum.
//         Si es libre, al menos debe tener maxlength para evitar abusos.
//         Se aplica maxlength: 100 sin cambiar el comportamiento actual.
//
// [FIX-3] NOTA ARQUITECTÓNICA — Al igual que en cliente.model.js, el enum
//         de zona incluye '' como valor válido. Se conserva por compatibilidad
//         pero se documenta para revisión futura del equipo.
//
// ÍNDICES: conservados sin cambios (ya estaban correctos).
// SIN CAMBIOS FUNCIONALES en lógica de negocio.
// ============================================================

const mongoose = require('mongoose');

const entidadSchema = new mongoose.Schema({
    nombre: {
        type:      String,
        required:  true,
        trim:      true,
        unique:    true,
        minlength: [2,   'El nombre de la entidad debe tener al menos 2 caracteres.'],
        maxlength: [150, 'El nombre de la entidad no puede superar 150 caracteres.']
    },

    // [FIX-3] '' conservado por compatibilidad (ver nota en cliente.model.js)
    zona: {
        type:    String,
        enum:    ['Norte', 'Centro', 'Sur', ''],
        default: ''
    },

    tipo: {
        type:      String,
        trim:      true,
        default:   '',
        // [FIX-2] Cap para evitar strings arbitrariamente largos en campo libre
        maxlength: [100, 'El tipo de entidad no puede superar 100 caracteres.']
    },

    notas: {
        type:      String,
        trim:      true,
        default:   '',
        // [FIX-1] Cap coherente con cliente.model.js
        maxlength: [500, 'Las notas no pueden superar 500 caracteres.']
    },

    activo: { type: Boolean, default: true }

}, { timestamps: true });

// ── Índices (conservados del original optimizado) ──────────────────────────────

// ① Compuesto activo + nombre
//    Cubre: Entidad.find({ activo: true }).sort({ nombre: 1 })  →  IXSCAN.
entidadSchema.index({ activo: 1, nombre: 1 });

// ② Índice de texto sobre nombre  →  FTS sin COLLSCAN
entidadSchema.index({ nombre: 'text' });

// NOTA: El índice único implícito de { nombre: 1 } sigue existiendo
// (creado por unique:true). No lo declaramos de nuevo para no duplicarlo.

module.exports = mongoose.model('Entidad', entidadSchema);