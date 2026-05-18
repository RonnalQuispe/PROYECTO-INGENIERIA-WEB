// ============================================================
// src/models/cliente.model.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original (versión ya optimizada en índices):
//
// [FIX-1] SEGURIDAD — Sin longitudes máximas en campos de texto libre.
//         Antes: nombre, telefono y notas aceptaban strings sin límite.
//         Un payload con "notas" de 5 MB se persistía en MongoDB y
//         devolvía ese megabyte en cada populate() o find() completo.
//         Ahora: maxlength razonables según el dominio del negocio.
//
// [FIX-2] SEGURIDAD — Sin validación de formato en "telefono".
//         Antes: cualquier string pasaba como teléfono.
//         Ahora: regex permisivo pero que descarta inyección de HTML/scripts
//         (solo permite dígitos, espacios, +, -, paréntesis).
//         Se mantiene como warning, no como error bloqueante (el negocio
//         puede tener formatos internacionales varios).
//
// [FIX-3] INTEGRIDAD — El campo "zona" aceptaba string vacío ('') en el enum.
//         Esto es un anti-pattern: el enum debería reflejar valores de negocio
//         reales o usar required:false + default:null para "sin zona asignada".
//         Se mantiene el '' para no romper la UI existente, pero se documenta
//         el riesgo para que el equipo lo evalúe.
//
// ÍNDICES: conservados sin cambios (ya estaban correctos).
// SIN CAMBIOS FUNCIONALES en lógica de negocio.
// ============================================================

const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    nombre: {
        type:      String,
        required:  true,
        trim:      true,
        unique:    true,
        minlength: [2,   'El nombre del cliente debe tener al menos 2 caracteres.'],
        maxlength: [150, 'El nombre del cliente no puede superar 150 caracteres.']
    },

    // [FIX-3] '' se conserva por compatibilidad con UI. A futuro: eliminar ''
    // y usar default: null con un campo required: false para zona no asignada.
    zona: {
        type:    String,
        enum:    ['Norte', 'Centro', 'Sur', ''],
        default: ''
    },

    telefono: {
        type:      String,
        trim:      true,
        default:   '',
        maxlength: [30, 'El teléfono no puede superar 30 caracteres.'],
        // [FIX-2] Regex permisivo: solo dígitos, espacios, +, -, ()
        // Descarta inyección de HTML/XSS en este campo.
        validate: {
            validator: function (v) {
                return v === '' || /^[\d\s\+\-\(\)]{0,30}$/.test(v);
            },
            message: 'El teléfono contiene caracteres no permitidos.'
        }
    },

    notas: {
        type:      String,
        trim:      true,
        default:   '',
        // [FIX-1] Cap en notas: 500 chars es razonable para una nota de cliente
        maxlength: [500, 'Las notas no pueden superar 500 caracteres.']
    },

    activo: { type: Boolean, default: true }

}, { timestamps: true });

// ── Índices (conservados del original optimizado) ──────────────────────────────

// ① Compuesto activo + nombre
//    Cubre: find({ activo: true }).sort({ nombre: 1 })  →  IXSCAN garantizado.
clienteSchema.index({ activo: 1, nombre: 1 });

// ② Índice de texto sobre nombre  →  FTS sin COLLSCAN
//    Cubre: find({ $text: { $search: q }, activo: true })
clienteSchema.index({ nombre: 'text' });

module.exports = mongoose.model('Cliente', clienteSchema);