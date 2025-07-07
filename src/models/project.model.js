import mongoose, { Schema } from "mongoose";

const projectSchema = new Schema({}, { timestamps: true });

const Project = mongoose.model("Project", projectSchema);



export default Project;
