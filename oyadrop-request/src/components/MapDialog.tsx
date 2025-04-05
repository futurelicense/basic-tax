import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader } from '@googlemaps/js-api-loader';
import { LoaderPinwheel } from 'lucide-react';

interface MapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocation: (address: string, coordinates: [number, number]) => void;
    initialAddress?: string;
    initialCoordinates?: [number, number];
}

const MapDialog: React.FC<MapDialogProps> = ({
    isOpen,
    onClose,
    onSelectLocation,
    initialAddress,
    initialCoordinates,
}) => {
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [marker, setMarker] = useState<google.maps.Marker | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mapRef = useRef<HTMLDivElement>(null);

    const debouncedOnSelectLocation = useCallback(
        (address: string, coordinates: [number, number]) => {
            onSelectLocation(address, coordinates);
        },
        [onSelectLocation]
    );

    useEffect(() => {
        if (!isOpen || !mapRef.current) return;

        const loadGoogleMaps = async () => {
            try {
                setIsLoading(true);
                const loader = new Loader({
                    apiKey: 'AIzaSyBnsGVYbKYK9Ao6LmKdbtCkYDPW9wIjHsI',
                    version: 'weekly',
                });

                await loader.load();

                const initialLocation = initialCoordinates
                    ? { lat: initialCoordinates[1], lng: initialCoordinates[0] }
                    : { lat: 9.0820, lng: 8.6753 }; // Nigeria center

                const mapInstance = new google.maps.Map(mapRef.current, {
                    center: initialLocation,
                    zoom: initialCoordinates ? 15 : 6,
                    mapTypeControl: false,
                });

                const markerInstance = new google.maps.Marker({
                    position: initialLocation,
                    map: mapInstance,
                    draggable: true,
                });

                setMap(mapInstance);
                setMarker(markerInstance);

                markerInstance.addListener('dragend', async () => {
                    const position = markerInstance.getPosition();
                    if (position) {
                        const geocoder = new google.maps.Geocoder();
                        const result = await geocoder.geocode({ location: position });
                        if (result.results[0]) {
                            debouncedOnSelectLocation(
                                result.results[0].formatted_address,
                                [position.lng(), position.lat()]
                            );
                        }
                    }
                });

                setIsLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load map');
                setIsLoading(false);
            }
        };

        loadGoogleMaps();

        return () => {
            setMap(null);
            setMarker(null);
        };
    }, [isOpen, initialCoordinates, debouncedOnSelectLocation]);

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <DialogContent className="sm:max-w-[800px] h-[600px]">
                <DialogHeader>
                    <DialogTitle>Select Location</DialogTitle>
                </DialogHeader>
                <div ref={mapRef} className="w-full h-[500px] rounded-md">
                    {isLoading && <div className="w-full h-full flex items-center text-sidebar-primary justify-center">
                        <LoaderPinwheel className="animate-spin" size={30} />

                    </div>}
                    {error && <div className="w-full h-full flex items-center justify-center text-red-500">{error}</div>}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapDialog;
