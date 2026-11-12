import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';
import type { PendingRating } from '../api/ratings';

export async function getProjectedPendingRating(uid: string): Promise<PendingRating | null> {
  const db = await getFirebaseFirestore();
  const snapshot = await getDocFromServer(doc(db, FS_COL.users, uid, 'pendingActions', 'rating'));
  return snapshot.exists() ? snapshot.data() as PendingRating : null;
}
