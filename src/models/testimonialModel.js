import mongoose, { Schema } from "mongoose";

const testimonialSchema = new Schema({}, { timestamps: true });

const Testimonial = mongoose.model("Testimonial", testimonialSchema);


export default Testimonial;
