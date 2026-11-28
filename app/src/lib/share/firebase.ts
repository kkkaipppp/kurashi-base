import type { Answer, PublicPoll } from "./poll";

/**
 * Firebase（Firestore・匿名ログイン）への出し入れ（To-Be 段階4。決定 2026-11-28 ①Firebase）。
 * 設定（NEXT_PUBLIC_FIREBASE_CONFIG に Firebase の Web 設定の JSON）が無い間は、何も送らない（isShareConfigured が false）。
 * プロジェクトとアカウントは平尾さんが作る。作るまでは、この部品は使われない。
 *
 * 置き場所：polls/{pollId}（PublicPoll ＋ ownerUid ＋ expireAt）、polls/{pollId}/answers/{回答した人の匿名の uid}（Answer ＋ expireAt）。
 * 守り：firestore.rules（一覧は取れない・回答は自分の uid の文書だけ・締め切りの後は書けない・形と字数を決める）。
 * 消す：expireAt（締め切りの7日後）を Firestore の TTL で消す（TTL の設定は Firebase の画面で平尾さんが行う）。持ち主はいつでも消せる。
 */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };

export function shareConfig(raw: string | undefined = process.env.NEXT_PUBLIC_FIREBASE_CONFIG): FirebaseWebConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<FirebaseWebConfig>;
    return c.apiKey && c.authDomain && c.projectId && c.appId ? (c as FirebaseWebConfig) : null;
  } catch {
    return null;
  }
}

export const isShareConfigured = () => shareConfig() !== null;

/** 回答のページの URL（公開版のサイトに置く。NEXT_PUBLIC_SHARE_BASE_URL が無ければ作らない） */
export function answerUrl(pollId: string, base: string | undefined = process.env.NEXT_PUBLIC_SHARE_BASE_URL): string | null {
  if (!base || !/^https:\/\//.test(base)) return null;
  return `${base.replace(/\/+$/, "")}/a?p=${encodeURIComponent(pollId)}`;
}

async function fb() {
  const cfg = shareConfig();
  if (!cfg) throw new Error("共有の設定がまだです");
  const [{ initializeApp, getApps }, fs, auth] = await Promise.all([import("firebase/app"), import("firebase/firestore"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(cfg);
  const a = auth.getAuth(app);
  if (!a.currentUser) await auth.signInAnonymously(a);
  return { db: fs.getFirestore(app), fs, uid: a.currentUser!.uid };
}

/** 消す時刻：消す日（締め切りの7日後）の 00:00 UTC（ルールで同じ値だけを通す。点検 高3）。TTL で消えるまで1日ほど遅れることがある */
const toTs = (fs: typeof import("firebase/firestore"), ymd: string) => fs.Timestamp.fromDate(new Date(`${ymd}T00:00:00Z`));

export async function createPoll(id: string, p: PublicPoll): Promise<void> {
  const { db, fs, uid } = await fb();
  await fs.setDoc(fs.doc(db, "polls", id), { ...p, ownerUid: uid, expireAt: toTs(fs, p.expiresAt) });
}

export async function getPoll(id: string): Promise<PublicPoll | null> {
  const { db, fs } = await fb();
  const s = await fs.getDoc(fs.doc(db, "polls", id));
  return s.exists() ? (s.data() as PublicPoll) : null;
}

export async function listAnswers(id: string): Promise<(Answer & { uid: string })[]> {
  const { db, fs } = await fb();
  const q = await fs.getDocs(fs.collection(db, "polls", id, "answers"));
  return q.docs.map((d) => ({ ...(d.data() as Answer), uid: d.id }));
}

/** 回答を出す・直す（S-3：同じ端末の匿名の uid の文書を上書き） */
export async function putAnswer(id: string, a: Answer, expiresAt: string): Promise<void> {
  const { db, fs, uid } = await fb();
  await fs.setDoc(fs.doc(db, "polls", id, "answers", uid), { name: a.name.trim(), marks: a.marks, ...(a.comment ? { comment: a.comment } : {}), expireAt: toTs(fs, expiresAt) });
}

export async function myAnswer(id: string): Promise<Answer | null> {
  const { db, fs, uid } = await fb();
  const s = await fs.getDoc(fs.doc(db, "polls", id, "answers", uid));
  return s.exists() ? (s.data() as Answer) : null;
}

/** 持ち主が締め切りを早める（遅くはしない。ルールも早めるだけを通す） */
export async function closePoll(id: string, newClosesAt: string): Promise<void> {
  const { db, fs } = await fb();
  await fs.updateDoc(fs.doc(db, "polls", id), { closesAt: newClosesAt });
}

/**
 * 持ち主が消す（回答も消す）。匿名ログインが変わって持ち主と分からないときは、端末に持つ鍵（ownerKey）で持ち主を取り戻してから消す（点検 高2）。
 * 取り戻しでは、鍵を一時的に文書に書く（ルールでハッシュと照らす）。そのすぐあとに文書ごと消す
 */
export async function deletePoll(id: string, ownerKey: string): Promise<void> {
  const { db, fs, uid } = await fb();
  const ref = fs.doc(db, "polls", id);
  const s = await fs.getDoc(ref);
  if (!s.exists()) return;
  if ((s.data() as { ownerUid?: string }).ownerUid !== uid) await fs.updateDoc(ref, { ownerUid: uid, ownerProof: ownerKey });
  const q = await fs.getDocs(fs.collection(db, "polls", id, "answers"));
  await Promise.all(q.docs.map((d) => fs.deleteDoc(d.ref)));
  await fs.deleteDoc(ref);
}
