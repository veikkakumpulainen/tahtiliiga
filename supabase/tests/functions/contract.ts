// Checks every notify-* webhook function must pass: it only answers the
// database trigger (POST with the shared secret, an INSERT on its own table)
// and never sends anything otherwise.

import assert from "node:assert/strict";
import { call, loadFunction, pushes, resetFakes } from "./harness.ts";

export function webhookContractTests(functionName: string, table: string, record: Record<string, unknown>) {
  const insert = { type: "INSERT", table, record };

  Deno.test(`${functionName}: rejects a request without the internal secret`, async () => {
    resetFakes();
    const handler = await loadFunction(functionName);
    assert.equal((await call(handler, insert, { secret: null })).status, 403);
    assert.equal((await call(handler, insert, { secret: "wrong" })).status, 403);
    assert.equal(pushes.length, 0);
  });

  Deno.test(`${functionName}: accepts only POST`, async () => {
    resetFakes();
    const handler = await loadFunction(functionName);
    assert.equal((await call(handler, null, { method: "GET" })).status, 405);
  });

  Deno.test(`${functionName}: rejects a body that isn't JSON`, async () => {
    resetFakes();
    const handler = await loadFunction(functionName);
    assert.equal((await call(handler, "not json")).status, 400);
  });

  Deno.test(`${functionName}: ignores other events and tables`, async () => {
    resetFakes();
    const handler = await loadFunction(functionName);
    for (const body of [{ ...insert, type: "UPDATE" }, { ...insert, type: "DELETE" }, { ...insert, table: "some_other_table" }]) {
      const result = await call(handler, body);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { sent: 0 });
    }
    assert.equal(pushes.length, 0);
  });
}
