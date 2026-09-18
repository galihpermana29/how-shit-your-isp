/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as ingest from "../ingest.js";
import type * as lib_buckets from "../lib/buckets.js";
import type * as lib_cost from "../lib/cost.js";
import type * as lib_incidents from "../lib/incidents.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_time from "../lib/time.js";
import type * as maintenance from "../maintenance.js";
import type * as settings from "../settings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  incidents: typeof incidents;
  ingest: typeof ingest;
  "lib/buckets": typeof lib_buckets;
  "lib/cost": typeof lib_cost;
  "lib/incidents": typeof lib_incidents;
  "lib/status": typeof lib_status;
  "lib/time": typeof lib_time;
  maintenance: typeof maintenance;
  settings: typeof settings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
