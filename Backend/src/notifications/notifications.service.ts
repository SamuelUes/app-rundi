import { Injectable } from '@nestjs/common';
import { getMessaging } from 'firebase-admin/messaging';
import { initFirebaseAdmin } from '../config/firebase.config';

@Injectable()
export class NotificationsService {
  constructor() {
    initFirebaseAdmin();
  }

  async sendPush(token: string, title: string, body: string) {
    const msg = { token, notification: { title, body } };
    const res = await getMessaging().send(msg);
    return { id: res };
  }
}
