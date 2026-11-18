// The shared helpers in supabase/functions/_shared/notifications.ts.

import assert from "node:assert/strict";
import { pushRequests, pushes, resetFakes, token } from "./harness.ts";

const { filterMutedRecipients, sendExpoPush } = await import("../../functions/_shared/notifications.ts");

Deno.test("sendExpoPush: sends to every token of every recipient, once per token", async () => {
  resetFakes({ tables: { push_tokens: [token("u1", "T-phone"), token("u1", "T-tablet"), token("u2", "T-shared"), token("u3", "T-shared")] } });

  const sent = await sendExpoPush(["u1", "u2", "u3"], { title: "Otsikko", body: "Viesti" });

  assert.equal(sent, 3);
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["T-phone", "T-shared", "T-tablet"]);
  assert.deepEqual(pushes[0], { to: pushes[0].to, title: "Otsikko", body: "Viesti", data: {}, sound: "default" });
});

Deno.test("sendExpoPush: nothing to send without recipients or tokens", async () => {
  resetFakes({ tables: { push_tokens: [] } });
  assert.equal(await sendExpoPush([], { title: "x", body: "y" }), 0);
  assert.equal(await sendExpoPush(["u1"], { title: "x", body: "y" }), 0);
  assert.equal(pushRequests, 0);
});

Deno.test("sendExpoPush: sends in chunks of 100 and counts only accepted tickets", async () => {
  const users = Array.from({ length: 250 }, (_, index) => `u${index}`);
  resetFakes({ tables: { push_tokens: users.map((id) => token(id)) }, ticketStatus: (to) => to === "ExponentPushToken[u7]" ? "error" : "ok" });

  const sent = await sendExpoPush(users, { title: "x", body: "y" });

  assert.equal(pushRequests, 3);
  assert.equal(pushes.length, 250);
  assert.equal(sent, 249);
});

Deno.test("filterMutedRecipients: drops muted_all, the category turned off and the muted thread", async () => {
  resetFakes({
    tables: {
      notification_preferences: [
        { user_id: "all-off", muted_all: true, direct_messages: true },
        { user_id: "chat-off", muted_all: false, direct_messages: false },
        { user_id: "defaults", muted_all: false, direct_messages: true },
      ],
      muted_conversations: [{ user_id: "thread-muted", thread_type: "direct", thread_id: "d1" }, { user_id: "other-thread", thread_type: "direct", thread_id: "d2" }],
    },
  });

  const recipients = await filterMutedRecipients(["all-off", "chat-off", "defaults", "no-row", "thread-muted", "other-thread"], "direct_messages", { type: "direct", id: "d1" });

  assert.deepEqual(recipients, ["defaults", "no-row", "other-thread"]);
});

Deno.test("filterMutedRecipients: without a category only muted_all counts", async () => {
  resetFakes({ tables: { notification_preferences: [{ user_id: "all-off", muted_all: true, direct_messages: false }, { user_id: "chat-off", muted_all: false, direct_messages: false }] } });

  assert.deepEqual(await filterMutedRecipients(["all-off", "chat-off"]), ["chat-off"]);
});
