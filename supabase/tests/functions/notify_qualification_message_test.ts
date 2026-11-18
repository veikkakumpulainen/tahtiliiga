import assert from "node:assert/strict";
import { webhookContractTests } from "./contract.ts";
import { call, loadFunction, profile, pushes, resetFakes, token } from "./harness.ts";

const FUNCTION = "notify-qualification-message";
const MATCH = "match-1";

webhookContractTests(FUNCTION, "qualification_messages", { id: "m1", match_id: MATCH, user_id: "home-1", message: "Hei" });

function fakes() {
  resetFakes({
    tables: {
      matches: [{ id: MATCH, home_team_id: "home", away_team_id: "away" }],
      team_members: [
        { team_id: "home", user_id: "home-1", status: "active" },
        { team_id: "home", user_id: "home-2", status: "active" },
        { team_id: "away", user_id: "away-1", status: "active" },
        { team_id: "other", user_id: "other-1", status: "active" },
      ],
      profiles: [profile("home-1", "Heikki", "Koti")],
      push_tokens: ["home-1", "home-2", "away-1", "other-1"].map((id) => token(id)),
      notification_preferences: [],
      muted_conversations: [{ user_id: "home-2", thread_type: "qualification", thread_id: "some-other-match" }],
    },
  });
}

const insert = (match_id = MATCH) => ({ type: "INSERT", table: "qualification_messages", record: { id: "message-1", match_id, user_id: "home-1", message: "Sopiiko lauantai?" } });

Deno.test(`${FUNCTION}: notifies both teams of the match, not the sender`, async () => {
  fakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert());

  assert.deepEqual(result.body, { sent: 2 });
  assert.deepEqual(pushes.map((message) => message.to).sort(), ["ExponentPushToken[away-1]", "ExponentPushToken[home-2]"]);
  for (const message of pushes) assert.equal(message.title, "Heikki Koti · Karsintaottelu");
});

Deno.test(`${FUNCTION}: sends nothing for an unknown match`, async () => {
  fakes();
  const handler = await loadFunction(FUNCTION);

  const result = await call(handler, insert("missing-match"));

  assert.deepEqual(result.body, { sent: 0 });
  assert.equal(pushes.length, 0);
});
