import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import app from "../src/app";

export default app;
