// interactionEngine.js
import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

/**
 * BROADCASTER: Sends a pulse to the partner
 */
export async function sendInteraction(rtdb, bridgeId, user, type) {
    const pulseRef = ref(rtdb, `bridges/${bridgeId}/interactions`);
    
    try {
        await set(pulseRef, {
            type: type, // 'tap' or 'hug'
            from: user,
            timestamp: Date.now()
        });
        
        // Local haptic feedback for the sender
        if (navigator.vibrate) navigator.vibrate(type === 'tap' ? 15 : 40);
        console.log(`✨ ${type.toUpperCase()} sent to partner.`);
    } catch (e) {
        console.error("Pulse Failed:", e);
    }
}

/**
 * LISTENER: Boots up once at app start to watch for incoming pulses
 */
export function initInteractionListener(rtdb, bridgeId, user) {
    const pulseRef = ref(rtdb, `bridges/${bridgeId}/interactions`);
    
    onValue(pulseRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        // Safety: Ignore our own pulses and pulses older than 10 seconds
        if (data.from === user) return;
        if (Date.now() - data.timestamp > 10000) return;

        triggerPulseEffect(data.type);
    });
}

/**
 * VISUALIZER: Injects the full-screen animations
 */
function triggerPulseEffect(type) {
    // Remove existing if one is already playing to prevent stacking
    const oldEffect = document.querySelector('.pulse-effect');
    if (oldEffect) oldEffect.remove();

    const overlay = document.createElement('div');
    overlay.className = `pulse-effect ${type}`;
    
    // Add the internal "glow" div for extra depth
    overlay.innerHTML = `<div class="pulse-glow"></div>`;
    document.body.appendChild(overlay);
    
    // Haptic feedback for the receiver
    if (navigator.vibrate) {
        type === 'tap' ? navigator.vibrate([30, 50, 30]) : navigator.vibrate([100, 200, 100]);
    }

    // Auto-cleanup after animation completes
    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
    }, type === 'tap' ? 1500 : 4000);
}

// Attach to window so HTML buttons can see it directly
window.triggerPulse = (type) => {
    // Accessing globals from your main app state
    if (window.rtdb && window.currentBridgeId && window.currentUsername) {
        sendInteraction(window.rtdb, window.currentBridgeId, window.currentUsername, type);
    }
};