import * as functions from "firebase-functions";
import { query } from "./utils/hasura";
import { decodeAccessToken } from "./utils/jwt";

export const me = functions.https.onRequest(async (request, response) => {
  const authHeader = request.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  functions.logger.info("Token: ", token);

  if (!token) {
    response.status(403).send({ error: "There is no token" });
  } else {
    const { err, id } = decodeAccessToken(token);
    if (err) {
      response.status(401).send("User is not authorized");
    }
    functions.logger.info({ id });

    const variables = {
      id,
    };

    try {
      const result = await query({
        query: `query ($id: uuid) {
    students(where: {id: {_eq: $id}}) {
      id,
      email,
      name
    }
  }
      `,
        variables,
      });
      functions.logger.info({ result });

      if (result.data.students.length === 0) {
        response.status(404).send("User not found");
      }
      if (result.errors) {
        response.status(500).send(result.errors[0].message);
      }
      const data = result.data.students[0];

      response.status(200).send(data);
    } catch (error) {
      response.status(500).send(error);
    }
  }
});
