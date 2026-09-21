import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Global QueryCache.onError is the v5 replacement for the removed per-query
 * onError callback — pass a query-specific message via `meta.errorMessage`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message =
        (query.meta?.errorMessage as string | undefined) ?? "Request failed";
      toast.error(message, {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  }),
});
