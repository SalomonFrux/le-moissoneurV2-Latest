import { useEffect } from 'react';
import { inactivityService } from '@/services/inactivityService';
import { authService } from '@/services/authService';

export function useInactivityTracking() {
    useEffect(() => {
        if (authService.isAuthenticated()) {
            inactivityService.startTimer();
        }

        return () => {
            inactivityService.stopTimer();
        };
    }, []);
}
