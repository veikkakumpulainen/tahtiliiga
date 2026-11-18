import assert from "node:assert/strict";
import { webhookContractTests } from "./contract.ts";
import { call, loadFunction, profile, pushes, resetFakes, token } from "./harness.ts";

const FUNCTION = "notify-community-message";
const LEAGUE = "league-1";

webhookContractTests(FUNCTION, "community_messages", { id: "m1", league_id: LEAGUE, user_id: "admin", message: "Hei" });

function fakes(extra: { notification_preferences?: Record<string, unknown>[] } = {}) {
  resetFakes({
    tables: {
      leagues: [{ id: LEAGUE, name: "Syysliiga" }],
      teams: [{ id: "team-a", league_id: LEAGUE }, { id: "team-b", league_id: LEAGUE }, { id: "team-x", league_id: "league-2" }],
      team_members: [
        { team_id: "team-a", user_id: "a1", status: "active", is_captain: true },
        { team_id: "team-b", user_id: "b1", status: "active", is_captain: true },
        { team_id: "team-b", user_id: "b2", status: "active", is_captain: false },
        { team_id: "team-x", user_id: "x1", status: "active", is_captain: true },
      ],
      profiles: [profile("admin", "Anna", "Admin", "admin")],
      push_tokens: ["a1", "b1", "b2", "x1"].map((id) => token(id)),
      notification_preferences: extra.notification_preferences ?? [],
      muted_conversations: [],
    },
  });
}

const insert = { type: "INSERT", table: "community_messages", record: { id: "message-1", league_id: LEAGUE, user_id: "admin", message: "Kierros 2 alkaa maanantaina." } };

Deno.test(`${FUNCTION}: notifies every player in the league, no one outside it`, async () => {
  fakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert);

  assert.deepEqual(result.body, { sent: 3 });
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[a1]", "ExponentPushToken[b1]", "ExponentPushToken[b2]"]);
  for (const message of pushes) {
    assert.equal(message.title, "Anna Admin · Syysliiga");
    assert.equal(message.body, "Kierros 2 alkaa maanantaina.");
    assert.deepEqual(message.data, { path: "/chat", messageId: "message-1" });
  }
});

Deno.test(`${FUNCTION}: skips players who turned Tiedotteet off`, async () => {
  fakes({ notification_preferences: [{ user_id: "b2", muted_all: false, community_messages: false }] });
  const handler = await loadFunction(FUNCTION);

  await call(handler, insert);

  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[a1]", "ExponentPushToken[b1]"]);
});
