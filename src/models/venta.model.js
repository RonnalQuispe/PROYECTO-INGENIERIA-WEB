const mongoose = require('mongoose');

const ventaSchema = new mongoose.Schema({
    zona:     { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },
    ubicacion: {
        entidad: { type: String, required: true },
        piso:    { type: String, required: true }
    },
    cliente:        { type: String, required: true, trim: true },
    producto:       { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true },         // calculado
    fecha:          { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Venta', ventaSchema);
