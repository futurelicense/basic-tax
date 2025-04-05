import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader } from '@googlemaps/js-api-loader';
import { LoaderPinwheel, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from "sonner";
import { Button } from '@/components/ui/button';

interface MapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocation: (address: string, coordinates: [number, number]) => void;
    initialAddress?: string;
    initialCoordinates?: [number, number];
}

// API key defined as a constant
const GOOGLE_MAPS_API_KEY = "AIzaSyBnsGVYbKYK9Ao6LmKdbtCkYDPW9wIjHsI";

// Maximum loading time before showing an error (in milliseconds)
const MAX_LOADING_TIME = 15000;

const MapDialog: React.FC<MapDialogProps> = ({
    isOpen,
    onClose,
    onSelectLocation,
    initialAddress,
    initialCoordinates,
}) => {
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [marker, setMarker] = useState<google.maps.Marker | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [key, setKey] = useState(0); // Key for forced re-render
    const [lastRender, setLastRender] = useState(Date.now());
    const [geocodingInitialAddress, setGeocodingInitialAddress] = useState(false);

    const mapRef = useRef<HTMLDivElement>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const loaderRef = useRef<Loader | null>(null);
    const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const mapCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize the loader only once
    useEffect(() => {
        if (!loaderRef.current) {
            loaderRef.current = new Loader({
                apiKey: GOOGLE_MAPS_API_KEY,
                version: 'weekly',
                libraries: ['places', 'geometry']
            });
        }
    }, []);

    // Force re-render every 5 seconds when the dialog is open
    useEffect(() => {
        if (isOpen) {
            // Set up an interval to check if map needs re-rendering
            if (mapCheckIntervalRef.current) {
                clearInterval(mapCheckIntervalRef.current);
            }

            mapCheckIntervalRef.current = setInterval(() => {
                // Check if it's been more than 5 seconds since last render
                if (Date.now() - lastRender > 5000) {
                    // Force re-render by incrementing key
                    setKey(prevKey => prevKey + 1);
                    setLastRender(Date.now());
                    console.log("Forced map re-render");
                }

                // Also check if map element exists and is visible
                if (mapRef.current) {
                    const mapElement = mapRef.current;
                    const rect = mapElement.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;

                    if (!isVisible && map) {
                        // If map element isn't visible but we have a map instance,
                        // trigger resize event when it becomes visible again
                        google.maps.event.trigger(map, 'resize');
                        console.log("Triggered map resize");
                    }
                }
            }, 1000); // Check every second
        } else {
            // Clear interval when dialog closes
            if (mapCheckIntervalRef.current) {
                clearInterval(mapCheckIntervalRef.current);
                mapCheckIntervalRef.current = null;
            }
        }

        // Cleanup function
        return () => {
            if (mapCheckIntervalRef.current) {
                clearInterval(mapCheckIntervalRef.current);
                mapCheckIntervalRef.current = null;
            }
        };
    }, [isOpen, map, lastRender]);

    // Reset states and start loading progress when dialog opens/closes
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setIsLoading(true);
            setLoadingProgress(0);
            setLastRender(Date.now());
            setGeocodingInitialAddress(!!initialAddress && !initialCoordinates);

            // Start a periodic progress interval
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }

            progressIntervalRef.current = setInterval(() => {
                setLoadingProgress(prev => {
                    // Max out at 95% while waiting for actual completion
                    return Math.min(prev + 5, 95);
                });
            }, 500);

            // Set a timeout for maximum loading time
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current);
            }

            loadingTimerRef.current = setTimeout(() => {
                // If still loading after MAX_LOADING_TIME, show an error
                setIsLoading(prevLoading => {
                    if (prevLoading) {
                        setError('Loading took too long. Please try again.');
                        return false;
                    }
                    return prevLoading;
                });

                // Clear interval
                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                }
            }, MAX_LOADING_TIME);
        } else {
            // Reset states when dialog closes
            setIsLoading(false);
            setError(null);
            setLoadingProgress(0);

            // Clear timers
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current);
                loadingTimerRef.current = null;
            }
        }

        // Cleanup function
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current);
                loadingTimerRef.current = null;
            }
        };
    }, [isOpen, initialAddress, initialCoordinates]);

    // Geocode the initial address if provided without coordinates
    const geocodeInitialAddress = useCallback(async () => {
        if (!initialAddress || initialCoordinates || !geocoderRef.current || !map || !marker) {
            return;
        }

        try {
            const response = await geocoderRef.current.geocode({ address: initialAddress });

            if (response.results && response.results.length > 0) {
                const result = response.results[0];
                const location = result.geometry.location;

                // Check if the address is in Nigeria
                const isInNigeria = result.address_components.some(component =>
                    component.types.includes('country') &&
                    component.short_name === 'NG'
                );

                if (isInNigeria) {
                    // Update map and marker
                    map.setCenter(location);
                    map.setZoom(15);
                    marker.setPosition(location);

                    // Log for debugging
                    console.log("Geocoded initial address to:", location.toString());
                } else {
                    // If not in Nigeria, just log it but continue with the default center
                    console.log("Initial address not in Nigeria:", initialAddress);
                }
            } else {
                console.log("Could not geocode initial address:", initialAddress);
            }
        } catch (error) {
            console.error("Error geocoding initial address:", error);
        } finally {
            setGeocodingInitialAddress(false);
        }
    }, [initialAddress, initialCoordinates, map, marker]);

    // Trigger geocoding when map and marker are ready
    useEffect(() => {
        if (geocodingInitialAddress && map && marker && geocoderRef.current) {
            geocodeInitialAddress();
        }
    }, [geocodingInitialAddress, map, marker, geocodeInitialAddress]);

    // Manual refresh function
    const handleRefresh = useCallback(() => {
        setKey(prevKey => prevKey + 1);
        setLastRender(Date.now());

        // If map exists, trigger resize event
        if (map) {
            google.maps.event.trigger(map, 'resize');
            toast.success("Map refreshed");
        }
    }, [map]);

    // Load map when dialog opens or key changes (for forced re-renders)
    useEffect(() => {
        if (!isOpen || !mapRef.current) {
            return;
        }

        let isMounted = true;

        const initializeMap = async () => {
            try {
                if (!loaderRef.current) {
                    loaderRef.current = new Loader({
                        apiKey: GOOGLE_MAPS_API_KEY,
                        version: 'weekly',
                        libraries: ['places', 'geometry']
                    });
                }

                // Import required libraries
                const mapsLibrary = await loaderRef.current.importLibrary('maps') as google.maps.MapsLibrary;
                const markerLibrary = await loaderRef.current.importLibrary('marker') as google.maps.MarkerLibrary;
                const geocodingLibrary = await loaderRef.current.importLibrary('geocoding') as google.maps.GeocodingLibrary;

                // Check if component is still mounted
                if (!isMounted || !mapRef.current) {
                    return;
                }

                // Create geocoder instance
                geocoderRef.current = new geocodingLibrary.Geocoder();

                // Determine initial location
                let initialLocation;
                let zoomLevel;

                if (initialCoordinates) {
                    // If coordinates are provided, use them
                    initialLocation = { lat: initialCoordinates[1], lng: initialCoordinates[0] };
                    zoomLevel = 15;
                } else {
                    // Default to Nigeria center
                    initialLocation = { lat: 9.0820, lng: 8.6753 };
                    zoomLevel = 6;
                }

                // If we already have a map instance, clean it up first
                if (map) {
                    google.maps.event.clearInstanceListeners(map);
                }

                if (marker) {
                    google.maps.event.clearInstanceListeners(marker);
                    marker.setMap(null);
                }

                // Create new map instance
                const mapInstance = new mapsLibrary.Map(mapRef.current, {
                    center: initialLocation,
                    zoom: zoomLevel,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                    zoomControl: true,
                });

                // Create new marker
                const markerInstance = new markerLibrary.Marker({
                    position: initialLocation,
                    map: mapInstance,
                    draggable: true,
                    animation: google.maps.Animation.DROP,
                });

                if (isMounted) {
                    setMap(mapInstance);
                    setMarker(markerInstance);

                    // Setup marker drag event
                    markerInstance.addListener('dragend', handleMarkerPositionChange);

                    // Setup map click event
                    mapInstance.addListener('click', (event) => {
                        if (event.latLng && markerInstance) {
                            markerInstance.setPosition(event.latLng);
                            handleMarkerPositionChange();
                        }
                    });

                    // Add idle listener to update lastRender time
                    mapInstance.addListener('idle', () => {
                        setLastRender(Date.now());
                    });

                    // Add a tilesloaded listener for additional render detection
                    mapInstance.addListener('tilesloaded', () => {
                        setLastRender(Date.now());
                    });

                    // Set loading progress to 100% and disable loading
                    setLoadingProgress(100);
                    setIsLoading(false);

                    // Clear interval and timeout
                    if (progressIntervalRef.current) {
                        clearInterval(progressIntervalRef.current);
                        progressIntervalRef.current = null;
                    }

                    if (loadingTimerRef.current) {
                        clearTimeout(loadingTimerRef.current);
                        loadingTimerRef.current = null;
                    }
                }
            } catch (err) {
                console.error('Map initialization error:', err);
                if (isMounted) {
                    setError('Failed to initialize the map. Please try again.');
                    setIsLoading(false);

                    // Clear interval
                    if (progressIntervalRef.current) {
                        clearInterval(progressIntervalRef.current);
                        progressIntervalRef.current = null;
                    }

                    if (loadingTimerRef.current) {
                        clearTimeout(loadingTimerRef.current);
                        loadingTimerRef.current = null;
                    }
                }
            }
        };

        initializeMap();

        // Cleanup function
        return () => {
            isMounted = false;
            if (marker && map) {
                google.maps.event.clearInstanceListeners(marker);
                google.maps.event.clearInstanceListeners(map);
            }
        };
    }, [isOpen, initialCoordinates, key]);

    // Handler for marker position changes
    const handleMarkerPositionChange = useCallback(() => {
        if (!marker || !geocoderRef.current) return;

        const position = marker.getPosition();
        if (!position) return;

        const latlng = { lat: position.lat(), lng: position.lng() };

        // Provide visual feedback that geocoding is happening
        toast.info("Fetching address...");

        geocoderRef.current.geocode({ location: latlng })
            .then(response => {
                if (response.results && response.results[0]) {
                    const address = response.results[0].formatted_address;
                    const coords: [number, number] = [position.lng(), position.lat()];

                    // Check if the address is in Nigeria
                    const isInNigeria = response.results[0].address_components.some(component =>
                        component.types.includes('country') &&
                        component.short_name === 'NG'
                    );

                    if (isInNigeria) {
                        onSelectLocation(address, coords);
                        toast.success("Location selected");
                    } else {
                        toast.error("Please select a location in Nigeria");
                    }
                } else {
                    toast.error("Could not determine the address of this location");
                }
            })
            .catch(error => {
                console.error("Geocoding error:", error);
                toast.error("Failed to get address information");
            });
    }, [marker, onSelectLocation]);

    // Detect when map container resizes
    useEffect(() => {
        if (!map || !isOpen) return;

        const resizeObserver = new ResizeObserver(() => {
            // Trigger map resize when container size changes
            google.maps.event.trigger(map, 'resize');
            setLastRender(Date.now());
        });

        if (mapRef.current) {
            resizeObserver.observe(mapRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [map, isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()} modal>
            <DialogContent className="sm:max-w-[800px] h-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>Select Location in Nigeria</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            className="flex items-center gap-1"
                        >
                            <RefreshCw size={14} />
                            Refresh Map
                        </Button>
                    </DialogTitle>
                </DialogHeader>
                <div className="w-full h-[500px] rounded-md relative">
                    {/* Key forces re-render when changed */}
                    <div
                        key={`map-container-${key}`}
                        ref={mapRef}
                        className="w-full h-full rounded-md"
                        id={`map-container-${key}`}
                    ></div>

                    {isLoading && (
                        <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center">
                            <LoaderPinwheel className="animate-spin text-primary mb-2" size={30} />
                            <span className="text-sm mb-2">
                                {geocodingInitialAddress ? 'Finding address location...' : 'Loading map...'} {loadingProgress}%
                            </span>
                            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300 ease-in-out"
                                    style={{ width: `${loadingProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-red-500">
                            <AlertCircle size={30} />
                            <p className="mt-2">{error}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                className="mt-4"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}

                    {/* Small debug indicator at bottom right */}
                    <div className="absolute bottom-2 right-2 text-xs text-gray-500 opacity-50">
                        Render key: {key}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapDialog;