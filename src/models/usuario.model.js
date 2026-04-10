const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const usuarioSchema = new mongoose.Schema({
    usuario:    { type: String, required: true, unique: true, trim: true },
    contrasena: { type: String, required: true }
}, { timestamps: true });

// Encriptar contraseña ANTES de guardar
usuarioSchema.pre('save', async function (next) {
    // Solo hashear si la contraseña fue modificada
    if (!this.isModified('contrasena')) return next();
    this.contrasena = await bcrypt.hash(this.contrasena, 10);
    next();
});

// Método para comparar contraseñas
usuarioSchema.methods.compararContrasena = function (contrasenaIngresada) {
    return bcrypt.compare(contrasenaIngresada, this.contrasena);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
