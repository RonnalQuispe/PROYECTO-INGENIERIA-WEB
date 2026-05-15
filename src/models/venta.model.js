// ============================================================
// src/models/venta.model.js
// ============================================================
const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
    monto:      { type: Number, required: true, min: 0 },
    metodo:     { type: String, required: true, enum: ['efectivo', 'transferencia', 'deposito'] },
    referencia: { type: String, trim: true, default: '' },
    fecha:      { type: Date, default: Date.now },
    cobradoPor: { type: String, trim: true, default: '' }
}, { _id: true });

// ── Ítem de pedido multi-producto ────────────────────────────────────────────
const itemSchema = new mongoose.Schema({
    nombre:    { type: String, required: true, trim: true },
    cantidad:  { type: Number, required: true, min: 1 },
    precio:    { type: Number, required: true, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 },
    entregado: { type: Boolean, default: false }
}, { _id: true });

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
        entidad: { type: String, default: '' },
        piso:    { type: String, default: '' }
    },

    clienteRef: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     'Cliente',
        default: null
    },
    entidadRef: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     'Entidad',
        default: null
    },

    // ── Campos legacy (compatibilidad) ───────────────────────────────────────
    cliente:        { type: String, required: true, trim: true },
    producto:       { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    // ── Multi-producto ───────────────────────────────────────────────────────
    // Si viene vacío → venta legacy de un solo producto
    // Si viene con ítems → venta multi-producto (app móvil)
    items: { type: [itemSchema], default: [] },

    tipoTransaccion: {
        type:    String,
        enum:    ['venta', 'pedido'],
        default: 'venta'
    },

    estadoEntrega: {
        type:    String,
        enum:    ['Inmediata', 'Pendiente', 'Entregado', 'Cancelado'],
        default: 'Inmediata'
    },

    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },
    cobros:      { type: [cobroSchema], default: [] },

    fecha: { type: Date, default: Date.now },

    clientTempId:        { type: String, default: null, index: true },
    creadoPorDispositivo:{ type: String, default: null }

}, { timestamps: true });

ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0) {
        this.estadoPago = 'pendiente';
    } else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;
        this.estadoPago  = 'pagado';
    } else {
        this.estadoPago = 'parcial';
    }
    if (this.tipoTransaccion === 'venta') {
        this.estadoEntrega = 'Inmediata';
    }
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);