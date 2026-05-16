// src/models/venta.model.js
const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
    monto:      { type: Number, required: true, min: 0 },
    metodo:     { type: String, required: true, enum: ['efectivo', 'transferencia', 'deposito'] },
    referencia: { type: String, trim: true, default: '' },
    fecha:      { type: Date, default: Date.now },
    cobradoPor: { type: String, trim: true, default: '' }
}, { _id: true });

const itemSchema = new mongoose.Schema({
    nombre:    { type: String, required: true, trim: true },
    cantidad:  { type: Number, required: true, min: 1 },
    precio:    { type: Number, required: true, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 },
    entregado: { type: Boolean, default: false }
}, { _id: true });

const historialEdicionSchema = new mongoose.Schema({
    fecha:    { type: Date, default: Date.now },
    usuario:  { type: String, default: 'app', trim: true },
    motivo:   { type: String, default: '', trim: true },
    anterior: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
        entidad: { type: String, default: '' },
        piso:    { type: String, default: '' }
    },

    // ── Relación por ID — OBLIGATORIA ────────────────────────────────────────
    // clienteRef es la única fuente de verdad. Nunca null en ventas nuevas.
    clienteRef: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'Cliente',
        required: true               // ← REQUERIDO (antes era default:null)
    },

    entidadRef: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     'Entidad',
        default: null
    },

    // ── Campo display (solo lectura, se obtiene del populate) ─────────────────
    // Se mantiene para compatibilidad con vistas web y búsquedas legacy,
    // pero NUNCA se usa como fuente de verdad de identidad.
    cliente: { type: String, required: true, trim: true },

    producto:       { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    items:              { type: [itemSchema], default: [] },
    historialEdiciones: { type: [historialEdicionSchema], default: [] },

    tipoTransaccion: {
        type: String, enum: ['venta', 'pedido'], default: 'venta'
    },
    estadoEntrega: {
        type: String, enum: ['Inmediata', 'Pendiente', 'Entregado', 'Cancelado'], default: 'Inmediata'
    },

    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },
    cobros:      { type: [cobroSchema], default: [] },

    fecha: { type: Date, default: Date.now },

    clientTempId:         { type: String, default: null },
    creadoPorDispositivo: { type: String, default: null }

}, { timestamps: true });

// ── Índices para consultas frecuentes ────────────────────────────────────────
// clienteRef: el JOIN más frecuente (cartera, historial por cliente)
ventaSchema.index({ clienteRef: 1, fecha: -1 });
// Filtros de lista principal
ventaSchema.index({ zona: 1, fecha: -1 });
ventaSchema.index({ estadoPago: 1, fecha: -1 });
// Idempotencia offline
ventaSchema.index({ clientTempId: 1 }, { sparse: true });

ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0)            this.estadoPago = 'pendiente';
    else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;
        this.estadoPago  = 'pagado';
    } else                                this.estadoPago = 'parcial';

    if (this.tipoTransaccion === 'venta') this.estadoEntrega = 'Inmediata';
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);