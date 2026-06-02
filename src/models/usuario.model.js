
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');


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

    }
}, { timestamps: true });

// ── Hook pre-save ─────────────────────────────────────────────────────────────
usuarioSchema.pre('save', async function (next) {
    if (!this.isModified('contrasena')) return next();

  
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