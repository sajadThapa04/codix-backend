import mongoose, { Schema } from "mongoose";


const portfolioSchema = new Schema({}, { timestamps: true })



const Portfolio = mongoose.model("Portfolio", portfolioSchema)


export default Portfolio;
