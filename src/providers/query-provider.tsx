"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { useAuthStore } from "@/store/auth-store";

type Props = {
  children: ReactNode;
};

const QueryProvider = (props: Props) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 5,
          },
        },
      }),
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      // ANIFLIX is public and guest-only; clear legacy account sessions without
      // touching locally saved watch progress or the visitor's My List.
      pb.authStore.clear();
      localStorage.removeItem("pocketbase_auth");
      localStorage.removeItem("auth");
      localStorage.removeItem("serverPreference");
      useAuthStore.getState().clearAuth();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  );
};

export default QueryProvider;

