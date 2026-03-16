// ==========================================
// 🛸 UNIVERSAL HOVER ENGINE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Create the one master tooltip and inject it into the app
    const masterTooltip = document.createElement('div');
    masterTooltip.id = 'global-master-tooltip';
    document.body.appendChild(masterTooltip);

    // 2. Listen to every mouse movement in the entire app
    document.addEventListener('mouseover', (e) => {
        // Check if the element (or its parent) has a data-tip attribute
        const target = e.target.closest('[data-tip]');
        
        if (target) {
            // Grab the text you wrote in the HTML
            masterTooltip.textContent = target.getAttribute('data-tip');
            
            // Calculate exactly where the button is on the screen
            const rect = target.getBoundingClientRect();
            
            // Center the tooltip perfectly above the button
            masterTooltip.style.left = `${rect.left + (rect.width / 2)}px`;
            masterTooltip.style.top = `${rect.top}px`;
            
            // Trigger the spring animation
            masterTooltip.classList.add('active');
        }
    });

    // 3. Hide it when the mouse leaves
    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tip]');
        if (target) {
            masterTooltip.classList.remove('active');
        }
    });
    
    // (Optional) Hide it if they click the button so it doesn't block UI
    document.addEventListener('mousedown', () => {
        masterTooltip.classList.remove('active');
    });
});