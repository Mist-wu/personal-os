import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerMemoryTools } from "./tools.js";

export default function (pi: ExtensionAPI): void {
  registerMemoryTools(pi);
}
