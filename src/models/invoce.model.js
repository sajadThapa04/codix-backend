import mongoose, { Schema } from "mongoose";

const invoiceSchema = new Schema({}, { timestamps: true });

const Invoice = mongoose.model("Invoice", invoiceSchema);


export default Invoice;
