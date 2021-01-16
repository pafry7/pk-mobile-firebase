import * as functions from "firebase-functions";

let config = functions.config().env;

export { config };
