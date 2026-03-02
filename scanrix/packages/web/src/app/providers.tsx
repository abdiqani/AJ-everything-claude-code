'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

/**
 * PostHog client-side analytics provider.
 * Initializes once on mount; no-ops when API key is absent.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.debug();
      },
    });
  }, []);

  const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  if (!key) return <>{children}</>;

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
