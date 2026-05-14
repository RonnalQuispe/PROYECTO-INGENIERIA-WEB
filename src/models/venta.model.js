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

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
        entidad: { type: String, default: '' },
        piso:    { type: String, default: '' }
    },

    // ── Referencias a colecciones nuevas (ObjectId) ──────────────────────────
    // clienteRef y entidadRef son opcionales para mantener compatibilidad
    // con ventas antiguas que solo tienen texto en cliente/ubicacion.entidad
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

    // ── Campos de texto (compatibilidad con datos existentes) ────────────────
    cliente:        { type: String, required: true, trim: true },
    producto:       { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    // ── Tipo de transacción ──────────────────────────────────────────────────
    // 'venta'  → entrega inmediata, no requiere seguimiento
    // 'pedido' → puede tener entrega pendiente o futura
    tipoTransaccion: {
        type:    String,
        enum:    ['venta', 'pedido'],
        default: 'venta'
    },

    // ── Estado de entrega (nuevo) ────────────────────────────────────────────
    estadoEntrega: {
        type:    String,
        enum:    ['Inmediata', 'Pendiente', 'Entregado', 'Cancelado'],
        default: 'Inmediata'
    },

    // ── Estado de pago ───────────────────────────────────────────────────────
    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },
    cobros:      { type: [cobroSchema], default: [] },

    fecha: { type: Date, default: Date.now },

    // ── Campos para soporte offline ──────────────────────────────────────────
    clientTempId: {
        type:    String,
        default: null,
        index:   true
    },
    creadoPorDispositivo: {
        type:    String,
        default: null
    }

}, { timestamps: true });

// ── Virtual: saldo pendiente ─────────────────────────────────────────────────
ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

// ── Pre-save: recalcula estadoPago automáticamente ───────────────────────────
ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0) {
        this.estadoPago = 'pendiente';
    } else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;
        this.estadoPago  = 'pagado';
    } else {
        this.estadoPago = 'parcial';
    }
    // Si es venta inmediata, forzar estadoEntrega = Inmediata
    if (this.tipoTransaccion === 'venta') {
        this.estadoEntrega = 'Inmediata';
    }
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);