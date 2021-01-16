import * as functions from "firebase-functions";
import { query } from "./utils/hasura";
import { generateAccessToken } from "./utils/jwt";

export const login = functions.https.onRequest(async (request, response) => {
  const { email, password } = request.body;
  functions.logger.info("Request body", email, password);

  const variables = {
    email,
    password,
  };
  try {
    const result = await query({
      query: `query ($email: String, $password: String) {
  students(where: {email: {_eq: $email}, _and: {password: {_eq: $password}}}) {
    id
    name
    email
  }
}
    `,
      variables,
    });

    if (result.data.students.length === 0) {
      response.status(404).send("User not found");
    }
    if (result.errors) {
      response.status(500).send(result.errors[0].message);
    }
    const data = result.data.students[0];
    console.log(JSON.stringify(data, null, 2));

    const token = generateAccessToken({ id: data.id });

    response.status(200).send({ user: { ...data, token } });
  } catch (error) {
    response.status(500).send(error);
  }
});
