// src/utils/tenantContext.ts
import { AsyncLocalStorage } from 'async_hooks';

export const tenantStorage = new AsyncLocalStorage<string>();

/**
 * Get the current tenant ID from the async context.
 * Returns `undefined` if no tenant is set.
 */
export const getCurrentTenantId = (): string | undefined => tenantStorage.getStore();

/**
 * Run a callback (sync or async) within a tenant context.
 * The tenant ID will be available via `getCurrentTenantId()` inside the callback.
 */
export const runWithTenant = async <T>(tenantId: string, callback: () => T | Promise<T>): Promise<T> => {
  return tenantStorage.run(tenantId, callback);
};

/**
 * Helper to wrap an Express request handler with tenant context.
 * Usage: runWithTenant(schoolId, () => next())
 */
export const withTenant = (tenantId: string, fn: () => void | Promise<void>): Promise<void> => {
  return runWithTenant(tenantId, fn);
};