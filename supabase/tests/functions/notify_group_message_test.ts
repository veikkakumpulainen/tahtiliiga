import assert from "node:assert/strict";
import { webhookContractTests } from "./contract.ts";
import { call, loadFunction, profile, pushes, resetFakes, token } from "./harness.ts";

const FUNCTION = "notify-group-message";
const GROUP = "group-1";

webhookContractTests(FUNCTION, "group_messages", { id: "m1", group_id: GROUP, user_id: "a1", message: "Hei" });

// Teams A and B are in the lohko, team C in another one.
function fakes(extra: { notification_preferences?: Record<string, unknown>[]; muted_conversations?: Record<string, unknown>[] } = {}) {
  resetFakes({
    tables: {
      groups: [{ id: GROUP, name: "Lohko A" }],
      group_teams: [{ group_id: GROUP, team_id: "team-a" }, { group_id: GROUP, team_id: "team-b" }, { group_id: "group-2", team_id: "team-c" }],
      team_members: [
        { team_id: "team-a", user_id: "a1", status: "active" },
        { team_id: "team-a", user_id: "a2", status: "active" },
        { team_id: "team-b", user_id: "b1", status: "active" },
        { team_id: "team-c", user_id: "c1", status: "active" },
      ],
      profiles: [profile("a1", "Aino", "A")],
      push_tokens: ["a1", "a2", "b1", "c1"].map((id) => token(id)),
      notification_preferences: extra.notification_preferences ?? [],
      muted_conversations: extra.muted_conversations ?? [],
    },
  });
}

const insert = { type: "INSERT", table: "group_messages", record: { id: "message-1", group_id: GROUP, user_id: "a1", message: "Kuka pääsee torstaina?" } };

Deno.test(`${FUNCTION}: notifies every other player in the lohko's teams`, async () => {
  fakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert);

  assert.deepEqual(result.body, { sent: 2 });
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[a2]", "ExponentPushToken[b1]"]);
  for (const message of pushes) {
    assert.equal(message.title, "Aino A · Lohko A");
    assert.deepEqual(message.data, { path: `/chat?groupId=${GROUP}`, messageId: "message-1" });
  }
});

Deno.test(`${FUNCTION}: respects the lohko chat setting and a muted thread`, async () => {
  fakes({
    notification_preferences: [{ user_id: "a2", muted_all: false, group_messages: false }],
    muted_conversations: [{ user_id: "b1", thread_type: "group", thread_id: GROUP }],
  });
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert);

  assert.deepEqual(result.body, { sent: 0 });
  assert.equal(pushes.length, 0);
});
