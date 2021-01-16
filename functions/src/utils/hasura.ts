import fetch from "node-fetch";
import { config } from "../../config";

const hasuraURL: string = config.hasura.url;
const hasuraAdminSecret: string = config.hasura.admin_secret;

async function query({
  query,
  variables,
}: {
  query: string;
  variables: Record<string, any>;
}): Promise<any> {
  const config = {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json",
      "X-Hasura-Admin-Secret": hasuraAdminSecret,
    },
  };
  return fetch(hasuraURL, config).then(async (response) => {
    const data = await response.json();
    if (response.ok) {
      return data;
    } else {
      return Promise.reject(data);
    }
  });
}

export { query };
