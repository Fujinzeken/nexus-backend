import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import WS from "ws";

// Node < 22 has no global WebSocket. @supabase/realtime-js (pulled in by
// supabase-js) throws at client construction without one — even though this
// service never uses Realtime. Polyfill it before createClient() runs below.
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = WS;
}

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
