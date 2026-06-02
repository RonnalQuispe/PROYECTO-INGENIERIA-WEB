
const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const cobroSchema = new mongoose.Schema({
    monto:  { type: Number, required: true, min: 0 },
    metodo: {
        type:     String,
        required: true,
        enum:     ['efectivo', 'transferencia', 'deposito']
    },
    
    referencia: { type: String, trim: true, default: '', maxlength: [100, 'Referencia máximo 100 caracteres.'] },
    fecha:      { type: Date, default: Date.now },
    cobradoPor: { type: String, trim: true, default: '', maxlength: [100, 'cobradoPor máximo 100 caracteres.'] }
}, { _id: true });

const itemSchema = new mongoose.Schema({
    
    nombre:    { type: String, required: true, trim: true, maxlength: [200, 'Nombre del ítem máximo 200 caracteres.'] },
    cantidad:  { type: Number, required: true, min: 1 },
    precio:    { type: Number, required: true, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 },
    entregado: { type: Boolean, default: false }
}, { _id: true });

const historialEdicionSchema = new mongoose.Schema({
    fecha:   { type: Date, default: Date.now },
    
    usuario: { type: String, default: 'app', trim: true, maxlength: [100, 'Usuario máximo 100 caracteres.'] },
    motivo:  { type: String, default: '',    trim: true, maxlength: [300, 'Motivo máximo 300 caracteres.'] },
    anterior: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

// ── Schema principal ──

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
      
        entidad: { type: String, default: '', maxlength: [150, 'Entidad máximo 150 caracteres.'] },
        piso:    { type: String, default: '', maxlength: [20,  'Piso máximo 20 caracteres.']    }
    },

    // ── Relación por ID — OBLIGATORIA ─────────────────────────────────────────
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

    // ── Campo display (solo lectura) ──────────────────────────────────────────
    // [FIX-2] maxlength en campo display de cliente
    cliente: { type: String, required: true, trim: true, maxlength: [150, 'Nombre de cliente máximo 150 caracteres.'] },

    // [FIX-2] maxlength en producto
    producto:       { type: String, required: true, trim: true, maxlength: [200, 'Producto máximo 200 caracteres.'] },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    // [FIX-1] Validadores de tamaño máximo en arrays para evitar documentos de 16 MB
    items: {
        type:     [itemSchema],
        default:  [],
        validate: {
            validator: (v) => v.length <= 100,
            message:   'Una venta no puede tener más de 100 ítems.'
        }
    },
    historialEdiciones: {
        type:     [historialEdicionSchema],
        default:  [],
        validate: {
            validator: (v) => v.length <= 200,
            message:   'El historial de ediciones no puede superar 200 entradas.'
        }
    },

    tipoTransaccion: {
        type: String, enum: ['venta', 'pedido'], default: 'venta'
    },
    estadoEntrega: {
        type: String, enum: ['Inmediata', 'Pendiente', 'Entregado', 'Cancelado'], default: 'Inmediata'
    },

    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },

    cobros: {
        type:     [cobroSchema],
        default:  [],
        validate: {
            validator: (v) => v.length <= 500,
            message:   'El registro de cobros no puede superar 500 entradas.'
        }
    },

    fecha: { type: Date, default: Date.now },

    // [FIX-3] maxlength en campos que vienen del cliente móvil
    clientTempId: {
        type:      String,
        default:   null,
        maxlength: [100, 'clientTempId máximo 100 caracteres.']
    },
    creadoPorDispositivo: {
        type:      String,
        default:   null,
        maxlength: [64, 'El identificador de dispositivo no puede superar 64 caracteres.']
    }

}, { timestamps: true });

// ══════════════════════════════════════════════════════════════════════════════
// ÍNDICES (conservados del original optimizado)
// ══════════════════════════════════════════════════════════════════════════════

// ① clienteRef + fecha  →  el JOIN más frecuente de toda la app
ventaSchema.index({ clienteRef: 1, fecha: -1 });

// ② zona + fecha  →  lista principal filtrada por zona
ventaSchema.index({ zona: 1, fecha: -1 });

// ③ estadoPago + fecha  →  cartera global de deudas
ventaSchema.index({ estadoPago: 1, fecha: -1 });

// ④ clientTempId  →  idempotencia offline
ventaSchema.index({ clientTempId: 1 }, { sparse: true });

// ⑤ zona + estadoPago + fecha  →  filtro combinado de listarAPI
ventaSchema.index({ zona: 1, estadoPago: 1, fecha: -1 });

// ⑥ estadoEntrega + fecha  →  pedidos pendientes / vista de entregas
ventaSchema.index({ estadoEntrega: 1, fecha: -1 });

// ⑦ clienteRef + estadoPago  →  cartera pendiente por cliente específico
ventaSchema.index({ clienteRef: 1, estadoPago: 1 });

// ── Virtual ───────────────────────────────────────────────────────────────────

ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});


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

//usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }