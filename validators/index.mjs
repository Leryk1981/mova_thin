import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cjs = require("./index.cjs");
export default cjs;