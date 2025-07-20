import express from "express"
import cors from "cors";
import cookie_parser from "cookie-parser";

const app = express();

// we have changed the Cors origin from * to https://codix-studio.vercel.app this on .env file thanks 
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(cookie_parser());
app.use(express.json({ limit: "104kb" }));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true, limit: "104kb" }));




//importing  router
import adminRouter from "./routes/admin.routes.js"
import adminDashboardRouter from "./routes/adminDashboard.routes.js"
import serviceRouter from "./routes/services.routes.js";
import pricingRouter from "./routes/pricing.routes.js";
import clientRouter from "./routes/client.routes.js";
import clientServiceRouter from "./routes/clientService.routes.js";
import blogRouter from "./routes/blog.routes.js";
import contactRouter from "./routes/contact.routes.js";

//initialising router
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/adminDashboard", adminDashboardRouter);
app.use("/api/v1/services", serviceRouter);
app.use("/api/v1/pricing", pricingRouter)
app.use("/api/v1/client", clientRouter);
app.use("/api/v1/clientService", clientServiceRouter);
app.use("/api/v1/blog", blogRouter);
app.use("/api/v1/contact", contactRouter);

export default app;