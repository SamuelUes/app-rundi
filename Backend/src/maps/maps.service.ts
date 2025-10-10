import { Injectable, OnModuleInit } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

type MapProvider = 'google' | 'mapbox' | 'tomtom';

@Injectable()
export class MapsService implements OnModuleInit {
  private availableProvider: MapProvider = 'tomtom';
  private readonly GOOGLE_API_KEY = 'AIzaSyBQx3SVauc0jsLQU9eT11px5kqbtAVPUoI';
  private readonly MAPBOX_TOKEN = 'pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg';
  private readonly TOMTOM_API_KEY = '3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA';

  /**
   * Validar APIs al iniciar el módulo
   */
  async onModuleInit() {
    console.log('🗺️ Validando proveedores de mapas...');
    await this.validateProviders();
  }

  /**
   * Validar todos los proveedores en orden de prioridad
   * Orden: MapBox → Google Maps → TomTom
   */
  private async validateProviders() {
    // 1. Intentar MapBox (mejor cobertura en Nicaragua)
    if (await this.validateMapBox()) {
      this.availableProvider = 'mapbox';
      console.log('✅ MapBox disponible (recomendado para Nicaragua)');
      return;
    }

    // 2. Intentar Google Maps
    if (await this.validateGoogleMaps()) {
      this.availableProvider = 'google';
      console.log('✅ Google Maps disponible');
      return;
    }

    // 3. Usar TomTom como fallback
    if (await this.validateTomTom()) {
      this.availableProvider = 'tomtom';
      console.log('✅ TomTom disponible (fallback)');
      return;
    }

    console.error('❌ Ningún proveedor de mapas disponible');
  }

  /**
   * Validar Google Maps API
   */
  private async validateGoogleMaps(): Promise<boolean> {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address: 'Managua, Nicaragua',
            key: this.GOOGLE_API_KEY,
          },
          timeout: 5000,
        }
      );

      return response.data.status === 'OK';
    } catch (error: any) {
      console.warn('⚠️ Google Maps no disponible:', error.response?.data?.error_message || error.message);
      return false;
    }
  }

  /**
   * Validar MapBox API
   */
  private async validateMapBox(): Promise<boolean> {
    try {
      const response = await axios.get(
        'https://api.mapbox.com/geocoding/v5/mapbox.places/Managua.json',
        {
          params: {
            access_token: this.MAPBOX_TOKEN,
            limit: 1,
          },
          timeout: 5000,
        }
      );

      return response.data.features && response.data.features.length > 0;
    } catch (error: any) {
      console.warn('⚠️ MapBox no disponible:', error.message);
      return false;
    }
  }

  /**
   * Validar TomTom API
   */
  private async validateTomTom(): Promise<boolean> {
    try {
      const response = await axios.get(
        `https://api.tomtom.com/search/2/geocode/Managua.json`,
        {
          params: {
            key: this.TOMTOM_API_KEY,
            limit: 1,
          },
          timeout: 5000,
        }
      );

      return response.data.results && response.data.results.length > 0;
    } catch (error: any) {
      console.warn('⚠️ TomTom no disponible:', error.message);
      return false;
    }
  }

  /**
   * Obtener el proveedor disponible (para datos Y mapa visual)
   */
  getAvailableProvider() {
    return {
      provider: this.availableProvider,
      mapProvider: this.availableProvider, // Mismo proveedor para mapa visual
      timestamp: new Date().toISOString(),
    };
  }
}
