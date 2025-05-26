import { toast } from '@/components/ui/use-toast';
import { authService } from './authService';

class InactivityService {
    private timeoutId: NodeJS.Timeout | null = null;
    private warningTimeoutId: NodeJS.Timeout | null = null;
    private readonly timeoutDuration = 30 * 60 * 1000; // 30 minutes
    private readonly warningDuration = 29 * 60 * 1000; // 29 minutes (1 minute before timeout)

    constructor() {
        // Initialize event listeners for user activity
        if (typeof window !== 'undefined') {
            const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
            events.forEach(event => {
                document.addEventListener(event, () => this.resetTimer());
            });
        }
    }

    public startTimer(): void {
        this.resetTimer();
    }

    private resetTimer(): void {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);

        // Set warning timeout (1 minute before session expires)
        this.warningTimeoutId = setTimeout(() => {
            toast({
                title: "Session Expiring Soon",
                description: "Your session will expire in 1 minute due to inactivity. Please click anywhere to stay logged in.",
                variant: "warning",
                duration: 60000 // Show for full minute
            });
        }, this.warningDuration);

        // Set actual timeout
        this.timeoutId = setTimeout(() => {
            this.handleInactiveTimeout();
        }, this.timeoutDuration);
    }

    private handleInactiveTimeout(): void {
        authService.logout();
        toast({
            title: "Session Expired",
            description: "You have been logged out due to inactivity.",
            variant: "destructive"
        });
        window.location.href = '/login';
    }

    public stopTimer(): void {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (this.warningTimeoutId) clearTimeout(this.warningTimeoutId);
    }
}

export const inactivityService = new InactivityService();
