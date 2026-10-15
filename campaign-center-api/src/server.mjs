import { appFromEnvironment } from "./app.mjs";
const app=appFromEnvironment();
const port=Number(process.env.PORT||3001);
if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error("Invalid PORT");
app.listen(port,()=>console.log("Campaign Center staging API listening on port "+port));
