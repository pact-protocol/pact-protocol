import * as policy from "../../sdk/src/policy/index.js";
console.log("Exports:", Object.keys(policy).filter(k => k.includes("Guard")));
