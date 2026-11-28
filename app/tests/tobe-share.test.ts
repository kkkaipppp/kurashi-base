import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { checkAnswer, checkPoll, closeDateFor, expiresFor, publicPayload, randomToken, sha256Hex, tally, type LocalPoll } from "@/lib/share/poll";
import { answerUrl, isShareConfigured, shareConfig } from "@/lib/share/firebase";

// 期待値は決定（2026-11-28 S-2 締め切りの7日後に消す・S-3 直せる・S-4 名前を直す・外に置くのは最小限）から手で作った
const today = "2026-11-28";
const poll: LocalPoll = {
  id: "P",
  ownerKey: "SECRET-KEY",
  title: "  忘年会  ",
  options: [
    { id: "b", date: "2026-12-12", label: "夜" },
    { id: "a", date: "2026-12-05", label: "夜" },
  ],
  closesAt: "2026-12-01",
  status: "draft",
  createdAt: "2026-11-28T00:00:00.000Z",
};

describe("日程調整（段階4）：外に置く中身", () => {
  it("消す日は締め切りの7日後（S-2）。月またぎ・年またぎ", () => {
    expect(expiresFor("2026-12-01")).toBe("2026-12-08");
    expect(expiresFor("2026-12-28")).toBe("2027-01-04");
  });

  it("外に置くのは題名（前後の空白を除く）・候補日（日付順）・締め切り・消す日・鍵のハッシュだけ。鍵そのもの・計画の ID・ほかの記録は入れない", () => {
    const p = publicPayload(poll, "HASH");
    expect(p).toEqual({ title: "忘年会", options: [{ id: "a", date: "2026-12-05", label: "夜" }, { id: "b", date: "2026-12-12", label: "夜" }], optionIds: ["a", "b"], closesAt: "2026-12-01", expiresAt: "2026-12-08", ownerKeyHash: "HASH", createdAt: "2026-11-28T00:00:00.000Z" });
    expect(JSON.stringify(p)).not.toContain("SECRET-KEY");
  });

  it("出す前の確かめ：名前・候補日・締め切り", () => {
    expect(checkPoll(poll, today)).toBeNull();
    expect(checkPoll({ ...poll, title: "  " }, today)).toMatch(/名前/);
    expect(checkPoll({ ...poll, title: "あ".repeat(41) }, today)).toMatch(/40字/);
    expect(checkPoll({ ...poll, options: [] }, today)).toMatch(/1つ以上/);
    expect(checkPoll({ ...poll, options: [...poll.options, { id: "c", date: "2026-12-05", label: "夜" }] }, today)).toMatch(/同じ候補日/);
    expect(checkPoll({ ...poll, options: [{ id: "x", date: "2026-02-30", label: "" }] }, today)).toMatch(/日付/);
    expect(checkPoll({ ...poll, closesAt: "2026-11-27" }, today)).toMatch(/今日より前/);
  });

  it("回答の確かめ：名前20字・全部の候補に○△×・候補にない日は断る・一言50字・締め切りの日までは出せる", () => {
    const pp = publicPayload(poll, "H");
    const ok = { name: "たろう", marks: { a: "o", b: "x" } as const };
    expect(checkAnswer({ ...ok, marks: { ...ok.marks } }, pp, "2026-12-01")).toBeNull();
    expect(checkAnswer({ ...ok, marks: { ...ok.marks } }, pp, "2026-12-02")).toMatch(/締め切り/);
    expect(checkAnswer({ ...ok, name: " " , marks: { ...ok.marks } }, pp, today)).toMatch(/名前/);
    expect(checkAnswer({ ...ok, name: "あ".repeat(21), marks: { ...ok.marks } }, pp, today)).toMatch(/20字/);
    expect(checkAnswer({ name: "a", marks: { a: "o" } }, pp, today)).toMatch(/すべての候補日/);
    expect(checkAnswer({ name: "a", marks: { a: "o", b: "o", z: "o" } }, pp, today)).toMatch(/候補にない/);
    expect(checkAnswer({ name: "a", marks: { a: "o", b: "q" as never } }, pp, today)).toMatch(/○・△・×/);
    expect(checkAnswer({ ...ok, marks: { ...ok.marks }, comment: "あ".repeat(51) }, pp, today)).toMatch(/50字/);
  });

  it("締め切りは早めるだけ（締め切りのあとに決めても、外の締め切りは変えない。点検 高1）", () => {
    expect(closeDateFor("2026-12-01", "2026-11-28")).toBe("2026-11-28");
    expect(closeDateFor("2026-12-01", "2026-12-01")).toBeNull();
    expect(closeDateFor("2026-12-01", "2026-12-03")).toBeNull();
  });

  it("集計：○2点・△1点で並べ、同点は日付の早い順", () => {
    const r = tally(poll.options, [
      { name: "1", marks: { a: "m", b: "o" } },
      { name: "2", marks: { a: "o", b: "x" } },
    ]);
    expect(r.map((x) => [x.option.id, x.o, x.m, x.x, x.score])).toEqual([
      ["a", 1, 1, 0, 3],
      ["b", 1, 0, 1, 2],
    ]);
  });

  it("ID・鍵は推測されにくい英数字（長さどおり）。ハッシュは SHA-256 の16進64字", async () => {
    expect(randomToken(20)).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(randomToken(20)).not.toBe(randomToken(20));
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("日程調整：設定が無い間は送らない", () => {
  it("Firebase の設定が無い・壊れている・足りないときは使わない", () => {
    expect(shareConfig(undefined)).toBeNull();
    expect(shareConfig("{")).toBeNull();
    expect(shareConfig(JSON.stringify({ apiKey: "k", projectId: "p" }))).toBeNull();
    expect(shareConfig(JSON.stringify({ apiKey: "k", authDomain: "d", projectId: "p", appId: "a" }))).not.toBeNull();
    expect(isShareConfigured()).toBe(false);
  });
  it("回答の URL は https の公開のサイトがあるときだけ", () => {
    expect(answerUrl("P", undefined)).toBeNull();
    expect(answerUrl("P", "http://example.com")).toBeNull();
    expect(answerUrl("P x", "https://example.com/")).toBe("https://example.com/a?p=P%20x");
  });
});

describe("日程調整：保存の形・守りのルール", () => {
  it("計画に調整の控えがあっても読める。形の違うものは断る。古い計画（控えなし）はそのまま", () => {
    const d = emptyData("2026-11-28T00:00:00.000Z");
    d.plans = [{ id: "pl", type: "gathering", title: "忘年会", status: "considering", date: "", budget: null, note: "", poll: { ...poll }, createdAt: "x", updatedAt: "x" }];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(d));
    bad.plans[0].poll.status = "sent";
    expect(validateAppData(bad).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(d));
    bad2.plans[0].poll.options = [{ id: "a", date: "12/5", label: "" }];
    expect(validateAppData(bad2).ok).toBe(false);
    delete d.plans[0].poll;
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
  });
  it("ルール：書いてある決まり（文字の照合だけ。ルールの動きはエミュレータで試していない＝NOT_RUN）", () => {
    const r = readFileSync("firestore.rules", "utf8");
    expect(r).toContain("allow list: if false;");
    expect(r).toContain("request.auth.uid == uid && open(pid)");
    expect(r).toContain("allow delete: if signedIn() && resource.data.ownerUid == request.auth.uid;");
    expect(r).toContain("duration.value(15, 'h')");
    // 点検の直し：締め切りは早めるだけ・消す時刻は締め切りの7日後だけ・印は o/m/x で全部の候補・回答は本人と作った人だけが読める・鍵で持ち主を取り戻す
    expect(r).toContain("request.resource.data.closesAt < resource.data.closesAt");
    expect(r).toContain("request.resource.data.expireAt == expireFor(request.resource.data.closesAt)");
    expect(r).toContain("request.resource.data.expireAt == poll(pid).expireAt");
    expect(r).toContain("marks.values().hasOnly(['o', 'm', 'x'])");
    expect(r).toContain("marks.keys().hasAll(poll(pid).optionIds)");
    expect(r).toContain("allow read: if signedIn() && (request.auth.uid == uid || poll(pid).ownerUid == request.auth.uid);");
    expect(r).toContain("hashing.sha256(request.resource.data.ownerProof).toHexString().lower() == resource.data.ownerKeyHash");
    expect(r).not.toMatch(/answers[\s\S]*allow read: if true/);
  });
});
