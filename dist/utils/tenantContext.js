"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTenant = exports.runWithTenant = exports.getCurrentTenantId = exports.tenantStorage = void 0;
// src/utils/tenantContext.ts
const async_hooks_1 = require("async_hooks");
exports.tenantStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * Get the current tenant ID from the async context.
 * Returns `undefined` if no tenant is set.
 */
const getCurrentTenantId = () => exports.tenantStorage.getStore();
exports.getCurrentTenantId = getCurrentTenantId;
/**
 * Run a callback (sync or async) within a tenant context.
 * The tenant ID will be available via `getCurrentTenantId()` inside the callback.
 */
const runWithTenant = async (tenantId, callback) => {
    return exports.tenantStorage.run(tenantId, callback);
};
exports.runWithTenant = runWithTenant;
/**
 * Helper to wrap an Express request handler with tenant context.
 * Usage: runWithTenant(schoolId, () => next())
 */
const withTenant = (tenantId, fn) => {
    return (0, exports.runWithTenant)(tenantId, fn);
};
exports.withTenant = withTenant;
