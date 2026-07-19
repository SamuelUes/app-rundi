import { useCallback, useMemo, useRef, useState } from 'react';
import type { Coords } from '../../../utils/rideCoords';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type PaymentMethod = 'cash' | 'card';
type MapSelectionState =
  | 'origin'
  | 'destination'
  | 'extra-new'
  | { type: 'extra-edit'; index: number }
  | null;

interface SavedLocation {
  label: string;
  coords: Coords;
}

export interface SearchRideState {
  // Route fields
  origin: string;
  setOrigin: React.Dispatch<React.SetStateAction<string>>;
  destination: string;
  setDestination: React.Dispatch<React.SetStateAction<string>>;
  originCoords: Coords | null;
  setOriginCoords: React.Dispatch<React.SetStateAction<Coords | null>>;
  destinationCoords: Coords | null;
  setDestinationCoords: React.Dispatch<React.SetStateAction<Coords | null>>;
  extraDestinations: Array<{ address: string; coords: Coords | null }>;
  setExtraDestinations: React.Dispatch<React.SetStateAction<Array<{ address: string; coords: Coords | null }>>>;
  originServiceAreaId: string | null;
  setOriginServiceAreaId: React.Dispatch<React.SetStateAction<string | null>>;
  destinationServiceAreaId: string | null;
  setDestinationServiceAreaId: React.Dispatch<React.SetStateAction<string | null>>;

  // Manual origin drafts
  manualOriginDraft: Coords | null;
  setManualOriginDraft: React.Dispatch<React.SetStateAction<Coords | null>>;
  manualOriginAddress: string;
  setManualOriginAddress: React.Dispatch<React.SetStateAction<string>>;
  manualOriginLoading: boolean;
  setManualOriginLoading: React.Dispatch<React.SetStateAction<boolean>>;
  manualOriginDragging: boolean;
  setManualOriginDragging: React.Dispatch<React.SetStateAction<boolean>>;

  // Manual destination drafts
  manualDestinationDraft: Coords | null;
  setManualDestinationDraft: React.Dispatch<React.SetStateAction<Coords | null>>;
  manualDestinationLoading: boolean;
  setManualDestinationLoading: React.Dispatch<React.SetStateAction<boolean>>;
  manualDestinationDragging: boolean;
  setManualDestinationDragging: React.Dispatch<React.SetStateAction<boolean>>;

  // Extra stop loading
  extraStopSelectionLoading: boolean;
  setExtraStopSelectionLoading: React.Dispatch<React.SetStateAction<boolean>>;

  // Override/pinned flags
  hasManualOriginOverride: boolean;
  setHasManualOriginOverride: React.Dispatch<React.SetStateAction<boolean>>;
  hasPinnedOrigin: boolean;
  setHasPinnedOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  cameraTarget: Coords | null;
  setCameraTarget: React.Dispatch<React.SetStateAction<Coords | null>>;

  // Vehicle / payment / passengers
  vehicleType: VehicleType;
  setVehicleType: React.Dispatch<React.SetStateAction<VehicleType>>;
  designatedDriverMode: DesignatedDriverMode;
  setDesignatedDriverMode: React.Dispatch<React.SetStateAction<DesignatedDriverMode>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  passengersByVehicle: Record<VehicleType, number>;
  setPassengersByVehicle: React.Dispatch<React.SetStateAction<Record<VehicleType, number>>>;
  priceSuggestion: string;
  setPriceSuggestion: React.Dispatch<React.SetStateAction<string>>;
  rideComment: string;
  setRideComment: React.Dispatch<React.SetStateAction<string>>;

  // Search overlay
  showSearchOverlay: boolean;
  setShowSearchOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  activeSelection: 'origin' | 'destination' | number | 'new-stop' | null;
  setActiveSelection: React.Dispatch<React.SetStateAction<'origin' | 'destination' | number | 'new-stop' | null>>;
  recentLocations: SavedLocation[];
  setRecentLocations: React.Dispatch<React.SetStateAction<SavedLocation[]>>;
  favoriteLocations: SavedLocation[];
  setFavoriteLocations: React.Dispatch<React.SetStateAction<SavedLocation[]>>;

  // Map selection
  mapSelectionMode: MapSelectionState;
  setMapSelectionMode: React.Dispatch<React.SetStateAction<MapSelectionState>>;

  // Submitting
  submittingRequest: boolean;
  setSubmittingRequest: React.Dispatch<React.SetStateAction<boolean>>;

  // Bottom panel
  bottomPanelExpanded: boolean;
  setBottomPanelExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSearchRideState(): SearchRideState {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<Coords | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(null);
  const [extraDestinations, setExtraDestinations] = useState<Array<{ address: string; coords: Coords | null }>>([]);
  const [originServiceAreaId, setOriginServiceAreaId] = useState<string | null>(null);
  const [destinationServiceAreaId, setDestinationServiceAreaId] = useState<string | null>(null);

  const [manualOriginDraft, setManualOriginDraft] = useState<Coords | null>(null);
  const [manualOriginAddress, setManualOriginAddress] = useState('');
  const [manualOriginLoading, setManualOriginLoading] = useState(false);
  const [manualOriginDragging, setManualOriginDragging] = useState(false);
  const [manualDestinationDraft, setManualDestinationDraft] = useState<Coords | null>(null);
  const [manualDestinationLoading, setManualDestinationLoading] = useState(false);
  const [manualDestinationDragging, setManualDestinationDragging] = useState(false);
  const [extraStopSelectionLoading, setExtraStopSelectionLoading] = useState(false);
  const [hasManualOriginOverride, setHasManualOriginOverride] = useState(false);
  const [hasPinnedOrigin, setHasPinnedOrigin] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<Coords | null>(null);

  const [passengersByVehicle, setPassengersByVehicle] = useState<Record<VehicleType, number>>({
    moto: 1,
    auto: 1,
    designated_driver: 1,
  });
  const [vehicleType, setVehicleType] = useState<VehicleType>('auto');
  const [designatedDriverMode, setDesignatedDriverMode] = useState<DesignatedDriverMode>('auto');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [priceSuggestion, setPriceSuggestion] = useState('');
  const [rideComment, setRideComment] = useState('');

  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentLocations, setRecentLocations] = useState<SavedLocation[]>([]);
  const [favoriteLocations, setFavoriteLocations] = useState<SavedLocation[]>([]);
  const [activeSelection, setActiveSelection] = useState<'origin' | 'destination' | number | 'new-stop' | null>(null);

  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionState | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [bottomPanelExpanded, setBottomPanelExpanded] = useState(true);

  return {
    origin, setOrigin,
    destination, setDestination,
    originCoords, setOriginCoords,
    destinationCoords, setDestinationCoords,
    extraDestinations, setExtraDestinations,
    originServiceAreaId, setOriginServiceAreaId,
    destinationServiceAreaId, setDestinationServiceAreaId,
    manualOriginDraft, setManualOriginDraft,
    manualOriginAddress, setManualOriginAddress,
    manualOriginLoading, setManualOriginLoading,
    manualOriginDragging, setManualOriginDragging,
    manualDestinationDraft, setManualDestinationDraft,
    manualDestinationLoading, setManualDestinationLoading,
    manualDestinationDragging, setManualDestinationDragging,
    extraStopSelectionLoading, setExtraStopSelectionLoading,
    hasManualOriginOverride, setHasManualOriginOverride,
    hasPinnedOrigin, setHasPinnedOrigin,
    cameraTarget, setCameraTarget,
    vehicleType, setVehicleType,
    designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod,
    passengersByVehicle, setPassengersByVehicle,
    priceSuggestion, setPriceSuggestion,
    rideComment, setRideComment,
    showSearchOverlay, setShowSearchOverlay,
    searchQuery, setSearchQuery,
    activeSelection, setActiveSelection,
    recentLocations, setRecentLocations,
    favoriteLocations, setFavoriteLocations,
    mapSelectionMode, setMapSelectionMode,
    submittingRequest, setSubmittingRequest,
    bottomPanelExpanded, setBottomPanelExpanded,
  };
}
