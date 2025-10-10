import { Injectable } from '@nestjs/common';
import { getStorage } from 'firebase-admin/storage';
import { initFirebaseAdmin } from '../config/firebase.config';

@Injectable()
export class StorageService {
  constructor() {
    initFirebaseAdmin();
  }

  async upload(path: string, buffer: Buffer, contentType?: string) {
    const bucket = getStorage().bucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType });
    await file.makePublic();
    return { url: `https://storage.googleapis.com/${bucket.name}/${file.name}` };
  }
}
