type ReturnedResponse = {
  statusCode: number;
  body?: any;
  headers?: Record<string, string>;
};

const headers = {
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Origin": "*",
};

export const success = (
  payload: Record<string, unknown> | Array<Record<string, unknown>>
): ReturnedResponse => ({
  statusCode: 200,
  body: payload,
  headers,
});

export const internalError = (message: string): ReturnedResponse => ({
  headers,
  statusCode: 500,
  body: { error: message },
});

export const notFound = (message: string): ReturnedResponse => ({
  statusCode: 404,
  headers,
  body: { error: message },
});

export const unauthorized = (message: string): ReturnedResponse => ({
  headers,
  statusCode: 403,
  body: { error: message },
});

export const unauthenticated = (message: string): ReturnedResponse => ({
  headers,
  statusCode: 401,
  body: { error: message },
});
