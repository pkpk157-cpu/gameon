/* ==========================================================================
   Provisional bonus from BPS, by the Premier League's own tie rules.

   While a match is in play FPL publishes bps but not bonus — bonus lands only
   once the fixture is finalised. Its own site fills the gap by ranking bps
   within each fixture, and a tracker that does not do the same reads up to
   three points light per bonus-earning player for the length of the match.

   The rules, from the official game:
     - the top bps score takes 3; everyone tied at the top takes 3
     - a two-way tie at the top pushes the next player to 1, skipping 2
     - a three-way tie at the top leaves nothing for anyone else
     - a tie for second takes 2 each and leaves nothing for third
     - a tie for third takes 1 each
   ========================================================================== */

/* bpsByPlayer: { elementId: bps } for ONE fixture.
   Returns { elementId: bonus } holding only the players who earn something. */
function provisionalBonus(bpsByPlayer) {
  const ids = Object.keys(bpsByPlayer || {});
  if (!ids.length) return {};

  // distinct scores, best first, and who holds each
  const byScore = new Map();
  ids.forEach((id) => {
    const v = bpsByPlayer[id];
    if (typeof v !== "number") return;
    if (!byScore.has(v)) byScore.set(v, []);
    byScore.get(v).push(id);
  });
  const scores = [...byScore.keys()].sort((a, b) => b - a);
  if (!scores.length) return {};

  const out = {};
  const award = (score, pts) => (byScore.get(score) || []).forEach((id) => { out[id] = pts; });

  const first = byScore.get(scores[0]).length;
  award(scores[0], 3);
  if (first >= 3) return out;                    // the top three places are taken

  if (first === 2) {                             // 3, 3, then 1 — second is skipped
    if (scores[1] != null) award(scores[1], 1);
    return out;
  }

  // a single leader: the next score takes 2
  if (scores[1] == null) return out;
  const second = byScore.get(scores[1]).length;
  award(scores[1], 2);
  if (second >= 2) return out;                   // 3, 2, 2 — nothing left for third

  if (scores[2] != null) award(scores[2], 1);    // 3, 2, 1 (all tied on third take 1)
  return out;
}

module.exports = { provisionalBonus };
