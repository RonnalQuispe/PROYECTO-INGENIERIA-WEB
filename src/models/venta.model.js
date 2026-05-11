// ============================================================
// src/models/venta.model.js
// ============================================================
// CAMBIOS respecto al original:
//   + clientTempId        → ID generado en el móvil sin red.
//                           Permite deduplicar reintentos de sync.
//   + creadoPorDispositivo→ Identifica qué dispositivo creó el registro.
// Todo lo demás (schema, virtuals, pre-save) está sin cambios.
// ============================================================

const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
    monto:      { type: Number, required: true, min: 0 },
    metodo:     { type: String, required: true, enum: ['efectivo', 'transferencia', 'deposito'] },
    referencia: { type: String, trim: true, default: '' },
    fecha:      { type: Date,   default: Date.now },
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

    // ── Campos de cobro ──────────────────────────────────────────────────────
    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },
    cobros:      { type: [cobroSchema], default: [] },

    fecha: { type: Date, default: Date.now },

    // ── Campos NUEVOS para soporte offline ───────────────────────────────────
    // clientTempId: generado en el móvil con Date.now() + random.
    //   Si el móvil reintenta el POST porque la red falló a mitad,
    //   el servidor detecta el ID duplicado y devuelve el registro
    //   ya guardado en lugar de crear uno nuevo.
    clientTempId: {
        type:    String,
        default: null,
        index:   true   // índice para que la búsqueda de duplicados sea rápida
    },

    // creadoPorDispositivo: viene del header X-Device-Id de la app móvil.
    //   Útil para auditoría y debugging de conflictos de sync.
    creadoPorDispositivo: {
        type:    String,
        default: null
    }

}, { timestamps: true }); // createdAt y updatedAt automáticos (ya estaba)

// ── Virtual: saldo pendiente ─────────────────────────────────────────────────
ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

// ── Pre-save: recalcula estado automáticamente ───────────────────────────────
ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0) {
        this.estadoPago = 'pendiente';
    } else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total; // no permitir sobrepago
        this.estadoPago  = 'pagado';
    } else {
        this.estadoPago = 'parcial';
    }
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);
