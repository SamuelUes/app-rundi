import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as sharp from 'sharp';

@Injectable()
export class UploadService {
  private readonly uploadPath = join(process.cwd(), 'uploads');
  private readonly baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

  constructor() {
    // Crear carpeta de uploads si no existe
    this.ensureUploadDirectories();
  }

  /**
   * Crear directorios necesarios
   */
  private async ensureUploadDirectories() {
    const directories = [
      this.uploadPath,
      join(this.uploadPath, 'profiles'),
      join(this.uploadPath, 'licenses'),
      join(this.uploadPath, 'vehicles'),
      join(this.uploadPath, 'documents'),
    ];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📁 Directorio creado: ${dir}`);
      }
    }
  }

  /**
   * Subir imagen al servidor local
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<{ url: string; publicId: string }> {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Validar tipo de archivo
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WEBP)',
      );
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('El archivo es demasiado grande. Máximo 5MB');
    }

    try {
      // Generar nombre único
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${uuidv4()}.${fileExtension}`;
      const folderPath = join(this.uploadPath, folder);
      const filePath = join(folderPath, fileName);

      // Asegurar que la carpeta existe
      await fs.mkdir(folderPath, { recursive: true });

      // Optimizar imagen con sharp (redimensionar y comprimir)
      await sharp(file.buffer)
        .resize(1000, 1000, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toFile(filePath);

      const url = `${this.baseUrl}/uploads/${folder}/${fileName}`;
      const publicId = `${folder}/${fileName}`;

      console.log(`✅ Imagen guardada: ${url}`);

      return { url, publicId };
    } catch (error) {
      console.error('❌ Error guardando imagen:', error);
      throw new BadRequestException('Error al subir la imagen');
    }
  }

  /**
   * Subir múltiples imágenes
   */
  async uploadMultipleImages(
    files: Express.Multer.File[],
    folder: string = 'general',
  ): Promise<Array<{ url: string; publicId: string }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se proporcionaron archivos');
    }

    const uploadPromises = files.map((file) => this.uploadImage(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Eliminar imagen del servidor
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      const filePath = join(this.uploadPath, publicId);
      await fs.unlink(filePath);
      console.log(`🗑️ Imagen eliminada: ${publicId}`);
    } catch (error) {
      console.error('❌ Error eliminando imagen:', error);
      throw new BadRequestException('Error al eliminar la imagen');
    }
  }

  /**
   * Subir documento (PDF, etc.)
   */
  async uploadDocument(
    file: Express.Multer.File,
    folder: string = 'documents',
  ): Promise<{ url: string; publicId: string }> {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Validar tipo de archivo
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no permitido. Solo se permiten PDF e imágenes',
      );
    }

    // Validar tamaño (máximo 10MB para documentos)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('El archivo es demasiado grande. Máximo 10MB');
    }

    try {
      // Generar nombre único
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${uuidv4()}.${fileExtension}`;
      const folderPath = join(this.uploadPath, folder);
      const filePath = join(folderPath, fileName);

      // Asegurar que la carpeta existe
      await fs.mkdir(folderPath, { recursive: true });

      // Guardar archivo
      await fs.writeFile(filePath, file.buffer);

      const url = `${this.baseUrl}/uploads/${folder}/${fileName}`;
      const publicId = `${folder}/${fileName}`;

      console.log(`✅ Documento guardado: ${url}`);

      return { url, publicId };
    } catch (error) {
      console.error('❌ Error guardando documento:', error);
      throw new BadRequestException('Error al subir el documento');
    }
  }
}
