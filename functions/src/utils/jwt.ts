import * as jwt from "jsonwebtoken";
import { config } from "../../config";

const tokenSecret: string = config.token_secret;

export function generateAccessToken(data: any): string {
  return jwt.sign(data, tokenSecret, { expiresIn: "365d" });
}
export function decodeAccessToken(token: string): any {
  return jwt.verify(token, tokenSecret, (err: any, token: any) => ({
    err,
    id: token.id,
  }));
}
