import test from "node:test";
import assert from "node:assert/strict";

function isReciprocalMatch(user, candidate) {
  return user.gender !== user.preference &&
    candidate.gender === user.preference &&
    candidate.preference === user.gender;
}

test("only reciprocal opposite-gender preferences match", () => {
  assert.equal(isReciprocalMatch(
    { gender: "man", preference: "woman" },
    { gender: "woman", preference: "man" }
  ), true);
  assert.equal(isReciprocalMatch(
    { gender: "man", preference: "woman" },
    { gender: "woman", preference: "woman" }
  ), false);
  assert.equal(isReciprocalMatch(
    { gender: "man", preference: "woman" },
    { gender: "man", preference: "woman" }
  ), false);
});

test("same-gender selection cannot be matched", () => {
  assert.equal(isReciprocalMatch(
    { gender: "woman", preference: "woman" },
    { gender: "woman", preference: "woman" }
  ), false);
});

