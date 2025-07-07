import asyncHandler from "../utils/asyncHandler.utils.js";
import { ApiError } from "../utils/ApiError.utils.js";
import ApiResponse from "../utils/ApiResponse.utils.js";
import mongoose from "mongoose";
import logger from "../utils/logger.utils.js";
import Admin from "../models/admin.model.js";
import jwt from "jsonwebtoken";
import { isPasswordStrong, isEmailValid, areRequiredFieldsProvided } from "../utils/validator.utils.js";
import Client from "../models/client.model.js";