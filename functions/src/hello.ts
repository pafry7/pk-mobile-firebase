import * as functions from "firebase-functions";

export const hello = functions.https.onRequest(async (request, response) => {
  response.send("He2121llo");
});
