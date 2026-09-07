// Patch clocks synchronously before hydration and animation libraries run.
if (process.env.NODE_ENV === "development") {
  require("@aiforui/lapse/install");
}
