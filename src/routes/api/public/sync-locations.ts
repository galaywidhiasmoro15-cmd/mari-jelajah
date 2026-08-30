import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sync-locations")({
  server: {
    handlers: {
      POST: async () => {
        const { syncLocationsFromSheet } = await import("@/lib/sheets-sync.server");
        try {
          const result = await syncLocationsFromSheet();
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
      GET: async () => {
        const { syncLocationsFromSheet } = await import("@/lib/sheets-sync.server");
        try {
          const result = await syncLocationsFromSheet();
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
