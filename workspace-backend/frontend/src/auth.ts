import { type BzApiClient, createBzApiClient } from '@boltzbit/bz-api-client';
import type { DynasClient } from '@boltzbit/dynas-client';
import { createDynasClient } from '@boltzbit/dynas-client';
import { getAccessToken } from './auth-store';

const apiClient: BzApiClient = createBzApiClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

const dynasClient: DynasClient = createDynasClient({
  apiBaseUrl: `${import.meta.env.VITE_API_BASE_URL}/v1/bz-dynas/api`,
  getAuthToken: () => getAccessToken() ?? 'PUBLIC',
});

export { apiClient, dynasClient };
