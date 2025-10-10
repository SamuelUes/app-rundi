import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Subir una sola imagen
   * POST /upload/image
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const result = await this.uploadService.uploadImage(
      file,
      folder || 'general',
    );

    return {
      success: true,
      message: 'Imagen subida exitosamente',
      data: result,
    };
  }

  /**
   * Subir múltiples imágenes
   * POST /upload/images
   */
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 10)) // Máximo 10 archivos
  async uploadMultipleImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folder') folder?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se proporcionaron archivos');
    }

    const results = await this.uploadService.uploadMultipleImages(
      files,
      folder || 'general',
    );

    return {
      success: true,
      message: `${results.length} imágenes subidas exitosamente`,
      data: results,
    };
  }

  /**
   * Subir foto de perfil
   * POST /upload/profile
   */
  @Post('profile')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const result = await this.uploadService.uploadImage(
      file,
      'profiles',
    );

    return {
      success: true,
      message: 'Foto de perfil subida exitosamente',
      data: result,
    };
  }

  /**
   * Subir foto de licencia
   * POST /upload/license
   */
  @Post('license')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLicense(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const result = await this.uploadService.uploadDocument(
      file,
      'licenses',
    );

    return {
      success: true,
      message: 'Licencia subida exitosamente',
      data: result,
    };
  }

  /**
   * Subir foto de vehículo
   * POST /upload/vehicle
   */
  @Post('vehicle')
  @UseInterceptors(FilesInterceptor('files', 5)) // Máximo 5 fotos del vehículo
  async uploadVehiclePhotos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se proporcionaron archivos');
    }

    const results = await this.uploadService.uploadMultipleImages(
      files,
      'vehicles',
    );

    return {
      success: true,
      message: `${results.length} fotos del vehículo subidas exitosamente`,
      data: results,
    };
  }

  /**
   * Subir documento (matrícula, seguro, etc.)
   * POST /upload/document
   */
  @Post('document')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const folder = type
      ? `documents/${type}`
      : 'documents';

    const result = await this.uploadService.uploadDocument(file, folder);

    return {
      success: true,
      message: 'Documento subido exitosamente',
      data: result,
    };
  }
}
