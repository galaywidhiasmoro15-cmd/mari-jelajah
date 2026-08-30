import { createServerFn } from "@tanstack/react-start";

export const syncLocationsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { syncLocationsFromSheet } = await import("./sheets-sync.server");
  return syncLocationsFromSheet();
});
