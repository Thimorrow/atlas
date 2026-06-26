import { config } from "dotenv";

// Tests laufen ausserhalb von Next -> .env.local selbst laden, BEVOR ein
// Modul DATABASE_URL liest (lib/db liest die Env beim Import).
config({ path: ".env.local" });
