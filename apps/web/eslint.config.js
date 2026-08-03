import designSystem from "@taverns/eslint-config/design-system";
import react from "@taverns/eslint-config/react";

export default [...react, ...designSystem, { ignores: ["vite.config.ts", "vitest.setup.ts"] }];
