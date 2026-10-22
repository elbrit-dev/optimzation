/* Which model reads the documents: MODEL_PROVIDER = "openrouter" | "gemini".
 * Both return the same reading; scoring never knows which one ran. */

import { config } from "./config.mjs";
import { readDocuments as viaGemini } from "./gemini.mjs";
import { readDocuments as viaOpenRouter } from "./openrouter.mjs";

export const readDocuments = (args, deps) => (config.provider === "openrouter" ? viaOpenRouter : viaGemini)(args, deps);
export const modelName = () => (config.provider === "openrouter" ? config.openrouterModel : config.model);
