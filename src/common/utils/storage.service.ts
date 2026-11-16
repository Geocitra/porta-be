import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadedFilePayload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Storage abstraction (local disk for Phase 1 MVP, swappable to S3/MinIO in Phase 2).
 */
@Injectable()
export class StorageService {
  private readonly baseDir = path.resolve(process.cwd(), 'uploads');

  async saveFile(subFolder: string, file: UploadedFilePayload): Promise<string> {
    const targetDir = path.join(this.baseDir, subFolder);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}-${safeName}`;
    const fullPath = path.join(targetDir, uniqueName);

    await fs.promises.writeFile(fullPath, file.buffer);
    return path.posix.join('uploads', subFolder, uniqueName);
  }
}

