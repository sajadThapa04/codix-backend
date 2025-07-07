import db_connection from "./db/index.js";
import app from "./app.js";
import dotenv from "dotenv"

dotenv.config({
    path: "./.env"
})




db_connection().then(() => {
    const port = process.env.PORT || 8000;
    app.on("err", err => {
        console.log(err);
    });

    app.listen(port, () => {
        console.log("server is listening on port:", port);
    });
}).catch(err => {
    console.log("something went wrong: \n", err);
});

