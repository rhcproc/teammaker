'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
} from 'next/navigation';

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

const NAVIGATION_STATE_PREFIX = 'navigation-state:';

export function useNavigate() {
  const router = useRouter();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === 'number') {
        window.history.go(to);
        return;
      }

      if (options?.state) {
        sessionStorage.setItem(
          `${NAVIGATION_STATE_PREFIX}${to}`,
          JSON.stringify(options.state)
        );
      }

      if (options?.replace) {
        router.replace(to);
      } else {
        router.push(to);
      }
    },
    [router]
  );
}

export function useLocation() {
  const pathname = usePathname();
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);

  return useMemo(() => {
    const key = `${NAVIGATION_STATE_PREFIX}${pathname}`;
    let state: unknown = null;

    if (typeof window !== 'undefined') {
      const storedState = sessionStorage.getItem(key);
      if (storedState) {
        try {
          state = JSON.parse(storedState);
        } catch {
          state = null;
        }
        sessionStorage.removeItem(key);
      }
    }

    return {
      pathname,
      search,
      state,
    };
  }, [pathname, search]);
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  const params = useNextParams();
  return params as T;
}
