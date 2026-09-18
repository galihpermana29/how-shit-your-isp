import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("turunkan insiden", { minutes: 1 }, internal.incidents.derive, {});
crons.interval("ringkas lima menit", { minutes: 5 }, internal.maintenance.buildRollups, {});
crons.interval("periksa kontak perangkat", { minutes: 1 }, internal.maintenance.checkContact, {});
crons.interval("segarkan baseline", { hours: 6 }, internal.incidents.refreshBaseline, {});
crons.daily(
  "buang sampel mentah lewat 90 hari",
  { hourUTC: 19, minuteUTC: 0 }, // 02.00 WIB
  internal.maintenance.pruneRawSamples,
  {},
);

export default crons;
