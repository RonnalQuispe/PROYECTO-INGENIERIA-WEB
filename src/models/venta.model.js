const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
    monto:      { type: Number, required: true, min: 0 },
    metodo:     { type: String, required: true, enum: ['efectivo', 'transferencia', 'deposito'] },
    referencia: { type: String, trim: true, default: '' },
    fecha:      { type: Date, default: Date.now },
    cobradoPor: { type: String, trim: true, default: '' }
}, { _id: true });

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },
    ubicacion: {
        entidad: { type: String, required: true },
        piso:    { type: String, required: true }
    },
    cliente:        { type: String, required: true, trim: true },
    producto:       { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    // ── Campos de cobro ──────────────────────────────────────
    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },
    cobros:      { type: [cobroSchema], default: [] },

    fecha: { type: Date, default: Date.now }
}, { timestamps: true });

// ── Virtual: saldo pendiente ─────────────────────────────────
ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

// ── Pre-save: recalcula estado automáticamente ───────────────
ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0) {
        this.estadoPago = 'pendiente';
    } else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;   // no permitir sobrepago
        this.estadoPago  = 'pagado';
    } else {
        this.estadoPago = 'parcial';
    }
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);