import type { SessionPayload } from "../auth/jwt.js";

export interface AppEnv {
  Variables: {
    session: SessionPayload;
  };
}
