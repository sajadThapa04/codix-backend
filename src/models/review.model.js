import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema({}, { timestamps: true });

const Review = mongoose.model("Review", reviewSchema);



export default Review;
