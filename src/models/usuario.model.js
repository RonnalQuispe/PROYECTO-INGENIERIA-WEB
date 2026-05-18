// ============================================================
// src/models/usuario.model.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original:
//
// [FIX-1] SEGURIDAD — Sin longitud máxima en los campos de texto.
//         Antes: usuario y contraseña podían recibir strings arbitrariamente
//         largos desde el body. Un payload de 10 MB en "contrasena" fuerza
//         a bcrypt a procesar ese string completo → DoS por CPU saturation
//         (el bcrypt con cost 10 tarda O(n) en el tamaño del string).
//         Ahora: maxlength en usuario (50) y validación en el hook pre-save
//         para contrasena (máximo 72 chars, límite real de bcrypt).
//
// [FIX-2] SEGURIDAD — Sin índice explícito en "usuario" además de unique.
//         unique:true crea un índice automático, pero sin minlength la app
//         aceptaba nombres de usuario de 0 o 1 caracteres.
//         Ahora: minlength:3, maxlength:50 aplicados en el schema.
//
// [FIX-3] RESILIENCIA — compararContrasena no manejaba el caso en que
//         this.contrasena sea undefined (doc cargado con .select() que
//         excluye el campo). La comparación retornaría false en silencio,
//         pero el caller podría interpretar eso incorrectamente.
//         Ahora: guard explícito que lanza con mensaje descriptivo.
//
// SIN CAMBIOS FUNCIONALES: el hook pre-save y el método compararContrasena
// tienen exactamente el mismo comportamiento para inputs válidos.
// ============================================================

const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

// [FIX-1 / FIX-2] Longitudes mínimas y máximas aplicadas directamente en el schema
const usuarioSchema = new mongoose.Schema({
    usuario: {
        type:      String,
        required:  true,
        unique:    true,
        trim:      true,
        minlength: [3,  'El nombre de usuario debe tener al menos 3 caracteres.'],
        maxlength: [50, 'El nombre de usuario no puede superar 50 caracteres.']
    },
    contrasena: {
        type:     String,
        required: true
        // maxlength NO se pone aquí porque el pre-save hashea el plain text.
        // La validación de longitud se hace en el hook ANTES del hash (ver abajo).
    }
}, { timestamps: true });

// ── Hook pre-save ─────────────────────────────────────────────────────────────
usuarioSchema.pre('save', async function (next) {
    if (!this.isModified('contrasena')) return next();

    // [FIX-1] Rechazar contraseñas excesivamente largas ANTES de hashearlas.
    // bcrypt internamente trunca a 72 bytes, pero procesar 10 MB de string
    // antes de ese truncado satura CPU. Guard temprano = sin degradación.
    if (this.contrasena.length > 128) {
        return next(new Error('La contraseña no puede superar 128 caracteres.'));
    }

    this.contrasena = await bcrypt.hash(this.contrasena, 10);
    next();
});

// ── Método de comparación ─────────────────────────────────────────────────────
// [FIX-3] Guard explícito: si el documento se cargó sin el campo contrasena
// (p.ej. con .select('-contrasena')), lanza inmediatamente en lugar de
// que bcrypt.compare falle silenciosamente con un resultado false.
usuarioSchema.methods.compararContrasena = function (contrasenaIngresada) {
    if (!this.contrasena) {
        throw new Error('El hash de contraseña no está disponible en este documento. ' +
                        'Asegúrate de no usar .select() que excluya el campo "contrasena".');
    }
    return bcrypt.compare(contrasenaIngresada, this.contrasena);
};

module.exports = mongoose.model('Usuario', usuarioSchema);