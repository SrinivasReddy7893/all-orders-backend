import { google } from "googleapis";
import { env } from "./env";

// Always create a new client per request/sync. A shared client holds one set of
// credentials, so concurrent users would overwrite each other's tokens.
export const createOAuthClient = () =>
  new google.auth.OAuth2(
    env().GOOGLE_CLIENT_ID,
    env().GOOGLE_CLIENT_SECRET,
    env().GOOGLE_REDIRECT_URI
  );
