
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
        maxlength: [500, 'Las notas no pueden superar 500 caracteres.']
    },

    activo: { type: Boolean, default: true }

}, { timestamps: true });


clienteSchema.index({ activo: 1, nombre: 1 });


clienteSchema.index({ nombre: 'text' });

module.exports = mongoose.model('Cliente', clienteSchema);