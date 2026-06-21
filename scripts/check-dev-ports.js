const http = require("http");

const check = (port, path = "/login") =>
  new Promise((resolve) => {
    const req = http.get({ hostname: "localhost", port, path, timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ port, ok: true, body }));
    });
    req.on("error", () => resolve({ port, ok: false, body: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ port, ok: false, body: "" });
    });
  });

(async () => {
  const web = await check(3010);
  if (web.ok && /vAutomate/i.test(web.body)) {
    console.error(
      "\n[dev:all] Port 3010 serwuje STARY projekt car_photos (vAutomate).\n" +
        "Zatrzymaj go: docker stop car_photos-web-1\n" +
        "Potem uruchom ponownie: npm run dev:all\n",
    );
    process.exit(1);
  }
})();
