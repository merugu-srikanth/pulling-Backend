import dns from "dns";
// Force IPv4 DNS resolution — fixes ENOTFOUND/ECONNREFUSED on Windows for .gov.in domains
dns.setDefaultResultOrder("ipv4first");

import app from "./app";
import { startScheduler } from "./services/scheduler.service";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startScheduler();
});
