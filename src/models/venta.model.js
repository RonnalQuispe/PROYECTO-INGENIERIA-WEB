// ============================================================
// src/models/venta.model.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original (solo la sección de índices):
//   ① Conservados los 4 índices originales (estaban bien).
//   ② AGREGADOS 3 índices nuevos:
//      — { zona, estadoPago, fecha }  →  filtro combinado en listarAPI
//      — { estadoEntrega, fecha }     →  pedidos pendientes / entregados
//      — { clienteRef, estadoPago }   →  cartera pendiente por cliente
// ============================================================

const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

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

// ── Schema principal ──────────────────────────────────────────────────────────

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
        entidad: { type: String, default: '' },
        piso:    { type: String, default: '' }
    },

    // ── Relación por ID — OBLIGATORIA ─────────────────────────────────────────
    // clienteRef es la única fuente de verdad. Nunca null en ventas nuevas.
    clienteRef: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'Cliente',
        required: true
    },

    entidadRef: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     'Entidad',
        default: null
    },

    // ── Campo display (solo lectura, se obtiene del populate) ─────────────────
    // Se mantiene para compatibilidad con vistas web y búsquedas legacy,
    // NUNCA se usa como fuente de verdad de identidad.
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

// ══════════════════════════════════════════════════════════════════════════════
// ÍNDICES
// ══════════════════════════════════════════════════════════════════════════════

// ── Índices originales (conservados) ──────────────────────────────────────────

// ① clienteRef + fecha  →  el JOIN más frecuente de toda la app
//    Cubre: Venta.find({ clienteRef: id }).sort({ fecha: -1 })
//    Usado en: getDetalleCliente(), getResumenCartera(), historial por cliente.
ventaSchema.index({ clienteRef: 1, fecha: -1 });

// ② zona + fecha  →  lista principal filtrada por zona
//    Cubre: Venta.find({ zona }).sort({ fecha: -1 })
ventaSchema.index({ zona: 1, fecha: -1 });

// ③ estadoPago + fecha  →  cartera global de deudas
//    Cubre: Venta.find({ estadoPago: 'pendiente' }).sort({ fecha: -1 })
ventaSchema.index({ estadoPago: 1, fecha: -1 });

// ④ clientTempId  →  idempotencia offline
//    sparse: true evita que los documentos con clientTempId: null
//    consuman espacio en el índice.
ventaSchema.index({ clientTempId: 1 }, { sparse: true });

// ── Índices nuevos ─────────────────────────────────────────────────────────────

// ⑤ zona + estadoPago + fecha  →  filtro combinado de listarAPI
//    Cubre: Venta.find({ zona, estadoPago }).sort({ fecha: -1 })
//    Sin este índice, MongoDB hacía index intersection de ② y ③,
//    que es menos eficiente que un IXSCAN directo sobre este compuesto.
ventaSchema.index({ zona: 1, estadoPago: 1, fecha: -1 });

// ⑥ estadoEntrega + fecha  →  pedidos pendientes / vista de entregas
//    Cubre: Venta.find({ estadoEntrega: 'Pendiente' }).sort({ fecha: -1 })
//    Sin este índice → COLLSCAN en cada carga de pedidos pendientes.
ventaSchema.index({ estadoEntrega: 1, fecha: -1 });

// ⑦ clienteRef + estadoPago  →  cartera pendiente por cliente específico
//    Cubre: Venta.find({ clienteRef: id, estadoPago: { $ne: 'pagado' } })
//    Usado en getResumenCartera() con filtro de cliente individual.
//    El índice ① no es suficiente aquí porque su segundo campo es fecha,
//    no estadoPago — MongoDB no puede usar ① para filtrar por estadoPago.
ventaSchema.index({ clienteRef: 1, estadoPago: 1 });

// ── Virtual ───────────────────────────────────────────────────────────────────

ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

// ── Hook pre-save ─────────────────────────────────────────────────────────────

ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0)               this.estadoPago = 'pendiente';
    else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;
        this.estadoPago  = 'pagado';
    } else                                   this.estadoPago = 'parcial';

    if (this.tipoTransaccion === 'venta') this.estadoEntrega = 'Inmediata';
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);